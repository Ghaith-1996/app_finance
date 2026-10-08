import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { test, expect, admin, createLocalSession, completeProfile, httpFixtures } from "./fixtures";

test("E2E-09: signed webhook replay and late cancellation preserve active entitlement", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  const customerId = `cus_${randomUUID().replaceAll("-", "")}`;
  const now = Math.floor(Date.now() / 1000);
  const active = {
    id: "sub_e2e_active", object: "subscription", customer: customerId, status: "active", created: now,
    metadata: { user_id: users.a.id, plan_key: "premium" }, cancel_at_period_end: false,
    items: { data: [{ id: "si_e2e", quantity: 1, current_period_start: now, current_period_end: now + 86400 * 30, price: { id: "price_e2e_premium", product: "prod_e2e" } }] },
  };
  const canceled = { ...active, id: "sub_e2e_old", created: now - 86400, status: "canceled", canceled_at: now - 60 };
  httpFixtures("E2E-09", [
    { origin: "https://api.stripe.com", method: "GET", path: `/v1/subscriptions/${active.id}`, body: active },
    { origin: "https://api.stripe.com", method: "GET", path: `/v1/subscriptions/${canceled.id}`, body: canceled },
    { origin: "https://api.stripe.com", method: "GET", path: "/v1/subscriptions", body: { object: "list", data: [active, canceled], has_more: false } },
  ]);
  await page.goto("/settings");
  const stripe = new Stripe("sk_test_e2e_fictitious");
  const eventIds: string[] = [];
  async function deliver(object: typeof active, type: string, eventId = `evt_${randomUUID()}`, invalid = false) {
    eventIds.push(eventId);
    const payload = JSON.stringify({ id: eventId, object: "event", type, created: now, data: { object } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: invalid ? "wrong-local-secret" : "whsec_e2e_fictitious" });
    return page.evaluate(async ({ payload, signature }) => {
      const result = await fetch("/api/stripe/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: payload });
      return { status: result.status, body: await result.json() };
    }, { payload, signature });
  }
  try {
    const eventId = `evt_${randomUUID()}`;
    expect((await deliver(active, "customer.subscription.created", eventId)).status).toBe(200);
    const replay = await Promise.all([deliver(active, "customer.subscription.created", eventId), deliver(active, "customer.subscription.created", eventId)]);
    expect(replay.map((row) => row.status)).toEqual([200, 200]);
    expect((await deliver(canceled, "customer.subscription.deleted")).status).toBe(200);
    const subscription = await users.a.client.from("subscriptions").select("stripe_subscription_id,status,plan_key").eq("user_id", users.a.id);
    expect(subscription.error).toBeNull();
    expect(subscription.data).toEqual([{ stripe_subscription_id: active.id, status: "active", plan_key: "premium" }]);
    expect((await admin.from("billing_events").select("processing_state").eq("stripe_event_id", eventId)).data).toEqual([{ processing_state: "processed" }]);
    expect((await users.b.client.from("subscriptions").select("user_id").eq("user_id", users.a.id)).data).toEqual([]);
    const invalidId = `evt_${randomUUID()}`;
    expect((await deliver(active, "customer.subscription.created", invalidId, true)).status).toBe(400);
    expect((await admin.from("billing_events").select("stripe_event_id").eq("stripe_event_id", invalidId)).data).toEqual([]);
    await page.reload();
    await expect(page.getByText("Premium", { exact: true }).first()).toBeVisible();
    proof("signed delivery, replay/concurrency, late cancellation, durable entitlement and invalid signature", true);
  } finally { await admin.from("billing_events").delete().in("stripe_event_id", eventIds); }
});
