import { beforeEach, describe, expect, it, vi } from "vitest";

type Plan = "free" | "premium" | "ultimate";

function createSupabaseMock(plan: Plan) {
  const currentPeriodEnd = new Date(Date.now() + 86_400_000).toISOString();
  const subscriptionRows =
    plan !== "free"
      ? [
          {
            id: "sub-row-1",
            user_id: "user-1",
            stripe_subscription_id: "sub_123",
            stripe_customer_id: "cus_123",
            stripe_price_id: plan === "premium" ? "price_premium" : "price_ultimate",
            stripe_product_id: plan === "premium" ? "prod_premium" : "prod_ultimate",
            plan_key: plan,
            status: "active",
            current_period_start: new Date().toISOString(),
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            trial_start: null,
            trial_end: null,
            raw: { subscription_id: "sub_123" },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]
      : [];

  return {
    from(table: string) {
      if (table === "billing_customers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  plan !== "free"
                    ? { user_id: "user-1", stripe_customer_id: "cus_123" }
                    : null,
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: async () => ({ data: subscriptionRows, error: null }),
              }),
            }),
          }),
        };
      }

      throw new Error(`unexpected table ${table}`);
    },
  };
}

let currentSupabase = createSupabaseMock("free");

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => currentSupabase,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }),
}));

import {
  getBillingStateForUser,
  getBillingSummaryForUser,
} from "@/lib/billing/subscriptions";

describe("billing subscriptions", () => {
  beforeEach(() => {
    currentSupabase = createSupabaseMock("premium");
  });

  it("omits Stripe identifiers from the public billing summary", async () => {
    const summary = await getBillingSummaryForUser("user-1");

    expect(summary.planKey).toBe("premium");
    expect(summary).not.toHaveProperty("stripeCustomerId");
    expect(summary).not.toHaveProperty("stripeSubscriptionId");
  });

  it("retains Stripe identifiers in the server-only billing state", async () => {
    currentSupabase = createSupabaseMock("ultimate");

    const state = await getBillingStateForUser("user-1");

    expect(state.planKey).toBe("ultimate");
    expect(state.stripeCustomerId).toBe("cus_123");
    expect(state.stripeSubscriptionId).toBe("sub_123");
  });
});