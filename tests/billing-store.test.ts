import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  claimStripeEvent,
  markStripeEventFailed,
  markStripeEventProcessed,
} from "@/lib/billing/store";

type BillingEventRow = {
  processing_state: "processing" | "processed" | "failed";
  processed_at: string | null;
};

function createBillingEventsSupabase(row: BillingEventRow | null) {
  const insertCalls: Array<Record<string, unknown>> = [];
  const updateCalls: Array<{ payload: Record<string, unknown>; filters: Record<string, unknown> }> = [];

  return {
    insertCalls,
    updateCalls,
    from(table: string) {
      if (table !== "billing_events") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        insert: async (payload: Record<string, unknown>) => {
          insertCalls.push(payload);
          if (!row) {
            return { error: null };
          }

          return { error: { code: "23505", message: "duplicate key" } };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          const filters: Record<string, unknown> = {};
          const query = {
            eq(field: string, value: unknown) {
              filters[field] = value;
              return query;
            },
            lt(field: string, value: unknown) {
              filters[`${field}_lt`] = value;
              return query;
            },
            select() {
              return {
                maybeSingle: async () => {
                  updateCalls.push({ payload, filters });

                  if (!row) {
                    return { data: null, error: null };
                  }

                  const matchesFailedReclaim =
                    row.processing_state === "failed" &&
                    filters.processing_state === "failed";
                  const matchesStaleProcessingReclaim =
                    row.processing_state === "processing" &&
                    filters.processing_state === "processing" &&
                    typeof row.processed_at === "string" &&
                    typeof filters.processed_at_lt === "string" &&
                    new Date(row.processed_at).getTime() <
                      new Date(String(filters.processed_at_lt)).getTime();

                  if (matchesFailedReclaim || matchesStaleProcessingReclaim) {
                    row.processing_state = "processing";
                    row.processed_at = String(payload.processed_at ?? row.processed_at);
                    return { data: { stripe_event_id: "evt_123" }, error: null };
                  }

                  return { data: null, error: null };
                },
              };
            },
          };

          return query;
        },
      };
    },
  };
}

describe("billing event claim recovery", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("stores a claim timestamp when first claiming a Stripe event", async () => {
    const supabase = createBillingEventsSupabase(null);

    const result = await claimStripeEvent(supabase as never, {
      stripeEventId: "evt_123",
      eventType: "invoice.paid",
      payload: { id: "evt_123" },
    });

    expect(result).toBe("claimed");
    expect(supabase.insertCalls[0]?.processing_state).toBe("processing");
    expect(typeof supabase.insertCalls[0]?.processed_at).toBe("string");
  });

  it("reclaims failed Stripe events immediately", async () => {
    const supabase = createBillingEventsSupabase({
      processing_state: "failed",
      processed_at: new Date().toISOString(),
    });

    const result = await claimStripeEvent(supabase as never, {
      stripeEventId: "evt_123",
      eventType: "invoice.paid",
      payload: { id: "evt_123" },
    });

    expect(result).toBe("claimed");
    expect(supabase.updateCalls).toHaveLength(1);
  });

  it("reclaims stale processing events after the timeout", async () => {
    const supabase = createBillingEventsSupabase({
      processing_state: "processing",
      processed_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    });

    const result = await claimStripeEvent(supabase as never, {
      stripeEventId: "evt_123",
      eventType: "invoice.paid",
      payload: { id: "evt_123" },
    });

    expect(result).toBe("claimed");
    expect(supabase.updateCalls).toHaveLength(1);
    expect(supabase.updateCalls[0]?.filters.processing_state).toBe("processing");
  });

  it("keeps fresh processing events in progress", async () => {
    const supabase = createBillingEventsSupabase({
      processing_state: "processing",
      processed_at: new Date().toISOString(),
    });

    const result = await claimStripeEvent(supabase as never, {
      stripeEventId: "evt_123",
      eventType: "invoice.paid",
      payload: { id: "evt_123" },
    });

    expect(result).toBe("in_progress");
    expect(supabase.updateCalls).toHaveLength(0);
  });

  it("marks failed and processed events with a completion timestamp", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const supabase = {
      from(table: string) {
        if (table !== "billing_events") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      },
    };

    await markStripeEventProcessed(supabase as never, "evt_123");
    await markStripeEventFailed(supabase as never, {
      stripeEventId: "evt_123",
      eventType: "invoice.paid",
      payload: { id: "evt_123" },
      errorMessage: "worker crashed",
    });

    expect(typeof updates[0]?.processed_at).toBe("string");
    expect(typeof updates[1]?.processed_at).toBe("string");
  });
});
