import { beforeEach, describe, expect, it, vi } from "vitest";

// Audit B7: an old subscription's late events cannot remove a newer subscription's access.

type StoredRow = { stripe_subscription_id: string; status: string; current_period_end: string | null };

const mocked = vi.hoisted(() => ({
  stored: [] as StoredRow[],
  stripeSubscriptions: [] as unknown[],
  listFails: false,
  listCalls: 0,
  beforeWrite: null as null | ((row: StoredRow) => Promise<void>),
}));

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/billing/store", () => ({
  loadBillingCustomerByStripeCustomerId: async () => ({ user_id: "user-1", stripe_customer_id: "cus_1" }),
  loadBillingCustomerByUserId: async () => null,
  upsertBillingCustomer: async () => undefined,
  loadSubscriptionsForUser: async () => mocked.stored.map((row) => ({ ...row })),
  // Mirrors the conditional UPDATE/INSERT: applies only while the stored row is the one expected.
  writeSubscriptionRowIfCurrent: async (_client: unknown, row: StoredRow, expected: string | null) => {
    if (mocked.beforeWrite) await mocked.beforeWrite(row);
    const current = mocked.stored[0]?.stripe_subscription_id ?? null;
    if (current !== expected) return false;
    mocked.stored = [row];
    return true;
  },
}));
vi.mock("@/lib/billing/stripe", () => ({
  planFromStripePriceId: () => "premium",
  getStripe: () => ({
    subscriptions: {
      list: async () => {
        mocked.listCalls += 1;
        if (mocked.listFails) throw new Error("stripe unreachable");
        return { data: mocked.stripeSubscriptions };
      },
    },
  }),
}));

import {
  selectAuthoritativeSubscription,
  syncSubscriptionFromStripeSubscription,
} from "@/lib/billing/sync";

const FUTURE = Math.floor(Date.parse("2099-01-01T00:00:00Z") / 1000);

function sub(id: string, status: string, created: number) {
  return {
    id,
    status,
    created,
    customer: "cus_1",
    cancel_at_period_end: false,
    canceled_at: null,
    trial_start: null,
    trial_end: null,
    metadata: {},
    items: {
      data: [
        {
          id: `${id}_item`,
          quantity: 1,
          current_period_start: created,
          current_period_end: FUTURE,
          price: { id: "price_premium", product: "prod_1" },
        },
      ],
    },
  } as never;
}

const oldA = (status: string) => sub("sub_old_A", status, 1_700_000_000);
const newB = (status: string) => sub("sub_new_B", status, 1_800_000_000);

describe("subscription reconciliation (B7)", () => {
  beforeEach(() => {
    mocked.stored = [];
    mocked.stripeSubscriptions = [];
    mocked.listFails = false;
    mocked.listCalls = 0;
    mocked.beforeWrite = null;
  });

  it("concurrent: A's cancellation decided from a stale read cannot overwrite B written meanwhile (R2)", async () => {
    mocked.stored = [{ stripe_subscription_id: "sub_old_A", status: "active", current_period_end: null }];
    mocked.stripeSubscriptions = [oldA("canceled"), newB("active")];

    // A reads stored A and pauses just before its write; B's activation runs to completion meanwhile.
    let pausedOnce = false;
    mocked.beforeWrite = async (row) => {
      if (row.stripe_subscription_id !== "sub_old_A" || pausedOnce) return;
      pausedOnce = true;
      mocked.beforeWrite = null;
      await syncSubscriptionFromStripeSubscription(newB("active"));
      expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "active" });
    };

    await syncSubscriptionFromStripeSubscription(oldA("canceled"));

    expect(pausedOnce).toBe(true);
    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "active" });
  });

  it("first subscription for a user: a concurrent insert makes the loser re-read and reconcile", async () => {
    mocked.stripeSubscriptions = [oldA("canceled"), newB("active")];
    let raced = false;
    mocked.beforeWrite = async (row) => {
      if (raced || row.stripe_subscription_id !== "sub_old_A") return;
      raced = true;
      mocked.stored = [{ stripe_subscription_id: "sub_new_B", status: "active", current_period_end: null }];
    };

    await syncSubscriptionFromStripeSubscription(oldA("canceled"));

    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "active" });
  });

  it("gives up with an error (Stripe will redeliver) when the row keeps changing", async () => {
    mocked.stored = [{ stripe_subscription_id: "sub_new_B", status: "active", current_period_end: null }];
    mocked.beforeWrite = async () => {
      mocked.stored = [{ stripe_subscription_id: `sub_other_${Math.random()}`, status: "active", current_period_end: null }];
    };

    await expect(syncSubscriptionFromStripeSubscription(newB("canceled"))).rejects.toThrow(/retry later/);
  });

  it("a late cancellation of old subscription A does not replace active subscription B", async () => {
    mocked.stored = [{ stripe_subscription_id: "sub_new_B", status: "active", current_period_end: null }];
    mocked.stripeSubscriptions = [oldA("canceled"), newB("active")];

    await syncSubscriptionFromStripeSubscription(oldA("canceled"));

    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "active" });
  });

  it("reverse order: B activation replaces stored A, then A's deletion leaves B entitled", async () => {
    mocked.stored = [{ stripe_subscription_id: "sub_old_A", status: "active", current_period_end: null }];
    mocked.stripeSubscriptions = [oldA("canceled"), newB("active")];

    await syncSubscriptionFromStripeSubscription(newB("active"));
    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "active" });

    await syncSubscriptionFromStripeSubscription(oldA("canceled"));
    await syncSubscriptionFromStripeSubscription(oldA("canceled")); // duplicate delivery
    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "active" });
  });

  it("when Stripe cannot be reached, a non-entitled other subscription never replaces stored access", async () => {
    mocked.stored = [{ stripe_subscription_id: "sub_new_B", status: "active", current_period_end: null }];
    mocked.listFails = true;

    await syncSubscriptionFromStripeSubscription(oldA("canceled"));

    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "active" });
  });

  it("when Stripe cannot be reached, two entitled subscriptions are not decided by arrival order", async () => {
    // Stored: newer subscription B (e.g. Ultimate). Incoming: a late event for older, still-active A.
    mocked.stored = [{ stripe_subscription_id: "sub_new_B", status: "active", current_period_end: null }];
    mocked.listFails = true;

    // Failing the webhook makes Stripe redeliver it once the subscription list can be read.
    await expect(syncSubscriptionFromStripeSubscription(oldA("active"))).rejects.toThrow(/reconcile/i);
    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "active" });
  });

  it("when Stripe cannot be reached, an older entitled subscription does not replace stored access; the event is retried", async () => {
    // Stored B is the newer (e.g. Ultimate) subscription; A's event arrives late and is still active.
    mocked.stored = [{ stripe_subscription_id: "sub_new_B", status: "active", current_period_end: null }];
    mocked.listFails = true;

    await expect(syncSubscriptionFromStripeSubscription(oldA("active"))).rejects.toThrow(/retry later/);

    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "active" });
  });

  it("when Stripe cannot be reached, an entitled subscription still replaces stored non-entitled access", async () => {
    mocked.stored = [{ stripe_subscription_id: "sub_free", status: "trialing", current_period_end: null }];
    mocked.listFails = true;

    await expect(syncSubscriptionFromStripeSubscription(oldA("active"))).resolves.toMatchObject({
      stripe_subscription_id: "sub_old_A",
      status: "active",
    });
    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_old_A", status: "active" });
  });

  it("when Stripe cannot be reached and stored access has lapsed, an entitled subscription is still applied", async () => {
    mocked.stored = [{ stripe_subscription_id: "sub_old_A", status: "canceled", current_period_end: null }];
    mocked.listFails = true;

    await expect(syncSubscriptionFromStripeSubscription(oldA("active"))).resolves.toMatchObject({
      stripe_subscription_id: "sub_old_A",
      status: "active",
    });
    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_old_A", status: "active" });
  });
    mocked.stored = [{ stripe_subscription_id: "sub_old_A", status: "canceled", current_period_end: null }];
    mocked.listFails = true;

    await syncSubscriptionFromStripeSubscription(newB("active"));

    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "active" });
  });

  it("events for the stored subscription update it directly without reconciliation", async () => {
    mocked.stored = [{ stripe_subscription_id: "sub_new_B", status: "active", current_period_end: null }];

    await syncSubscriptionFromStripeSubscription(newB("canceled"));

    expect(mocked.listCalls).toBe(0);
    expect(mocked.stored[0]).toMatchObject({ stripe_subscription_id: "sub_new_B", status: "canceled" });
  });

  it("selection is deterministic regardless of input order", () => {
    const now = Date.parse("2026-10-02T00:00:00Z");
    expect(selectAuthoritativeSubscription([oldA("canceled"), newB("active")], now)).toMatchObject({ id: "sub_new_B" });
    expect(selectAuthoritativeSubscription([newB("active"), oldA("canceled")], now)).toMatchObject({ id: "sub_new_B" });
    // Both entitled: the newer one wins. Neither entitled: the newer one reflects the latest state.
    expect(selectAuthoritativeSubscription([newB("active"), oldA("active")], now)).toMatchObject({ id: "sub_new_B" });
    expect(selectAuthoritativeSubscription([oldA("canceled"), newB("canceled")], now)).toMatchObject({ id: "sub_new_B" });
    // An entitled older subscription beats a canceled newer one.
    expect(selectAuthoritativeSubscription([oldA("active"), newB("canceled")], now)).toMatchObject({ id: "sub_old_A" });
  });
});
