import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { rmSync } from "node:fs";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { test, expect, admin, createLocalSession, completeProfile, httpFixtures, seedPortfolio } from "./fixtures";

test("E2E-10: owned Next instance without Twilio refuses SMS before consuming a challenge", async ({ page, context, users, proof }) => {
  test.setTimeout(60_000);
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  httpFixtures("E2E-10-Twilio-absent");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("TWILIO_")) delete env[key];
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3001"], { env, stdio: "ignore" });
  try {
    await expect.poll(async () => { try { return (await fetch("http://127.0.0.1:3001/login")).status; } catch { return 0; } }, { timeout: 30_000 }).toBe(200);
    expect(server.exitCode).toBeNull();
    await page.goto("http://127.0.0.1:3001/settings");
    await page.getByRole("textbox", { name: /^Phone number/ }).fill("+12025550129");
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    await expect(page.getByText("Text messages are unavailable right now. Please try again later.", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Verification code", { exact: true })).toHaveCount(0);
    expect((await admin.from("phone_verification_challenges").select("user_id").eq("user_id", users.a.id)).data).toEqual([]);
    expect((await admin.from("verified_phone_numbers").select("user_id").eq("user_id", users.a.id)).data).toEqual([]);
    proof("Twilio absent in owned Next child; real settings action refuses before issuance; zero challenge/proof and no provider HTTP", { port: 3001, instance: "Next Twilio-absent child", pid: server.pid });
  } finally {
    if (server.exitCode === null) { const stopped = new Promise<void>((resolve) => server.once("exit", () => resolve())); server.kill(); await stopped; }
  }
});

test("E2E-09: actual checkout UI reaches Stripe SDK, displays its failure and retries without granting entitlement", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  const customerId = `cus_${randomUUID().replaceAll("-", "")}`;
  const customer = { origin: "https://api.stripe.com", method: "POST", path: "/v1/customers", body: { id: customerId, object: "customer", metadata: { user_id: users.a.id } } };
  const checkout = { origin: "https://api.stripe.com", method: "POST", path: "/v1/checkout/sessions", requestAssertions: [
    { label: "Premium price requested exactly once", needle: "price_e2e_premium", count: 1 },
    { label: "Owned return URLs", needle: "http%3A%2F%2F127.0.0.1%3A3000", minimum: 2 },
    { label: "Session and subscription each carry plan metadata", needle: "plan_key", count: 2 },
  ] };
  httpFixtures("E2E-09-checkout-SDK-error", [customer, { ...checkout, status: 400, body: { error: { type: "invalid_request_error", message: "Fixture Stripe rejected checkout" } } }]);
  await page.goto("/settings");
  const firstResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/billing/checkout");
  await page.getByRole("button", { name: "Start Premium", exact: true }).click();
  expect((await firstResponse).status()).toBe(500);
  await expect(page.getByText("Billing action failed.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Premium", exact: true })).toBeEnabled();
  httpFixtures("E2E-09-checkout-retry", [{ ...checkout, body: { id: "cs_e2e_fixture", object: "checkout.session", url: "http://127.0.0.1:3000/settings?checkoutFixture=1" } }]);
  await page.getByRole("button", { name: "Start Premium", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?checkoutFixture=1$/);
  await expect(page.getByRole("button", { name: "Start Premium", exact: true })).toBeVisible();
  expect((await admin.from("subscriptions").select("id").eq("user_id", users.a.id)).data).toEqual([]);
  proof("real checkout button/action/Stripe SDK payload; failed SDK response visible then UI retry navigates fixture URL; no hosted payment or entitlement claimed", true);
});

test("E2E-10: reanalysis preserves read alert identity and a new article creates a new alert", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  const articleIds = [randomUUID(), randomUUID()];
  const now = new Date().toISOString();
  httpFixtures("E2E-10-alerts");
  try {
    expect((await users.a.client.from("user_notification_preferences").upsert({ user_id: users.a.id, critical_news_alerts_enabled: true })).error).toBeNull();
    expect((await admin.from("news_items").insert(articleIds.map((id, index) => ({ id, headline: `Fixture risk article ${index}`, source: "Fixture", published_at: now, category: "regulation", stock_tags: ["AAA"] })))).error).toBeNull();
    const seedRun = async (ids: string[], completedAt: string) => {
      const runId = randomUUID();
      expect((await admin.from("analysis_runs").insert({ id: runId, portfolio_id: portfolioId, status: "complete", completed_at: completedAt, progress: 100 })).error).toBeNull();
      expect((await admin.from("feed_items").insert(ids.map((id) => ({ analysis_run_id: runId, news_item_id: id, portfolio_id: portfolioId, relevance_score: 95, holdings: ["AAA"], why_it_matters: "Fixture regulation risk" })))).error).toBeNull();
    };
    await seedRun([articleIds[0]], now);
    await createLocalSession(context, users.a);
    await page.goto("/alerts");
    const cron = () => page.evaluate(async () => {
      const response = await fetch("/api/notifications/smart-alerts/cron", { method: "POST", headers: { authorization: "Bearer e2e-fictitious-cron" } });
      return response.status;
    });
    expect(await cron()).toBe(200);
    await page.reload();
    await page.getByRole("button", { name: "Mark read", exact: true }).click();
    const alerts = async () => (await users.a.client.from("notification_alerts").select("id,read_at,payload").eq("portfolio_id", portfolioId).order("created_at")).data;
    await expect.poll(async () => (await alerts())?.[0]?.read_at !== null).toBe(true);
    const original = (await alerts())![0];
    expect(original.payload.newsItemId).toBe(articleIds[0]);
    await seedRun(articleIds, new Date(Date.now() + 1000).toISOString());
    expect(await cron()).toBe(200);
    const after = (await alerts())!;
    expect(after).toHaveLength(2);
    expect(after.find((row) => row.payload.newsItemId === articleIds[0])).toEqual(original);
    expect(after.find((row) => row.payload.newsItemId === articleIds[1])?.read_at).toBeNull();
    expect((await users.b.client.from("notification_alerts").select("id").eq("portfolio_id", portfolioId)).data).toEqual([]);
    proof("actual smart-alert cron and Mark read action preserve article identity/read_at after new analysis run; distinct article creates second alert; B RLS refused", true);
  } finally { await admin.from("news_items").delete().in("id", articleIds); }
});

test("E2E-10: real digest claims retry email but never resend uncertain SMS", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  const articleId = randomUUID();
  const headline = `Fixture digest story ${articleId}`;
  const twilio = { origin: "https://api.twilio.com", method: "POST", path: "/2010-04-01/Accounts/ACe2efictitious/Messages.json", status: 503, body: { message: "Fixture uncertain delivery" }, requestAssertions: [{ label: "digest SMS includes matched symbol", needle: "AAA", minimum: 1 }, { label: "digest SMS owned origin", needle: encodeURIComponent("http://127.0.0.1:3000"), minimum: 1 }] };
  const resend = { origin: "https://api.resend.com", method: "POST", path: "/emails", body: { id: "re_fixture" }, requestAssertions: [{ label: "email includes exact snapshot headline", needle: headline, count: 1 }, { label: "email uses owned origin", needle: "http://127.0.0.1:3000", minimum: 1 }] };
  const ledgerStart = readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).length;
  try {
    expect((await users.a.client.from("watchlist_items").insert({ user_id: users.a.id, symbol: "AAA", company: "Fixture AAA" })).error).toBeNull();
    expect((await admin.from("news_items").insert({ id: articleId, headline, source: "Fixture", published_at: "2026-10-02T12:00:00Z", category: "earnings", stock_tags: ["AAA"], overall_effect: "bullish", global_summary: "Fixture digest facts." })).error).toBeNull();
    // Recipient seed only; the independent R9 scenario proves the actual possession flow.
    expect((await admin.from("verified_phone_numbers").insert({ user_id: users.a.id, phone_number: "+12025550123" })).error).toBeNull();
    expect((await users.a.client.from("user_notification_preferences").upsert({ user_id: users.a.id, email_digest_enabled: true, sms_digest_enabled: true, phone_number: "+12025550123" })).error).toBeNull();
    await createLocalSession(context, users.a);
    await page.goto("/settings");
    const cron = () => page.evaluate(async () => {
      const result = await fetch("/api/notifications/daily-digest/cron?now=2026-10-02T13:00:00Z", { method: "POST", headers: { authorization: "Bearer e2e-fictitious-digest", "x-forwarded-host": "untrusted.e2e.invalid" } });
      return { status: result.status, body: await result.json() };
    });
    httpFixtures("E2E-10-digest-first", [{ ...resend, status: 400, body: { message: "Fixture confirmed email rejection" } }, twilio]);
    const first = await cron();
    expect(first.status).toBe(500);
    expect(first.body).toMatchObject({ failedDeliveries: 1, uncertainDeliveries: 1 });
    const digest = await users.a.client.from("notification_digests").select("id,bullish_symbols,top_stories").eq("digest_date", "2026-10-02").single();
    expect(digest.error).toBeNull();
    expect(digest.data?.bullish_symbols).toEqual(["AAA"]);
    expect(digest.data?.top_stories).toEqual(expect.arrayContaining([expect.objectContaining({ newsItemId: articleId, headline })]));
    httpFixtures("E2E-10-digest-email-retry", [resend]);
    await cron();
    const deliveries = async () => (await admin.from("notification_deliveries").select("channel,status").eq("digest_id", digest.data!.id).order("channel")).data;
    expect(await deliveries()).toEqual([{ channel: "email", status: "sent" }, { channel: "sms", status: "uncertain" }]);
    httpFixtures("E2E-10-digest-dedup");
    await Promise.all([cron(), cron()]);
    expect(await deliveries()).toEqual([{ channel: "email", status: "sent" }, { channel: "sms", status: "uncertain" }]);
    expect((await users.a.client.from("notification_digests").select("id")).data).toEqual([{ id: digest.data!.id }]);
    await page.goto(`/digest/${digest.data!.id}`);
    await expect(page.getByText(headline, { exact: true })).toBeVisible();
    expect((await users.b.client.from("notification_digests").select("id").eq("id", digest.data!.id)).data).toEqual([]);
    await createLocalSession(context, users.b);
    await page.reload();
    await expect(page.getByText(headline, { exact: true })).toHaveCount(0);
    const ledger = readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).slice(ledgerStart).map((line) => JSON.parse(line));
    expect(ledger.filter((row) => row.path === "/emails")).toHaveLength(2);
    expect(ledger.filter((row) => row.path === twilio.path)).toHaveLength(1);
    proof("one exact digest snapshot and channel rows across retry/concurrency, owned links at provider boundary, confirmed email retry twice and uncertain SMS exactly once, A detail and B refused", true);
  } finally { await admin.from("news_items").delete().eq("id", articleId); }
});

test("E2E-10: real phone possession, uncertain cooldown and confirmed rejection", async ({ page, context, users, proof }) => {
  const socketPath = "/tmp/pulsefolio-e2e-phone.sock";
  rmSync(socketPath, { force: true });
  let code = "";
  const capture = createServer((socket) => {
    let incoming = "";
    socket.on("data", (part) => { incoming += part; });
    socket.on("end", () => { code = incoming; });
  });
  await new Promise<void>((resolve) => capture.listen(socketPath, resolve));
  const twilio = { origin: "https://api.twilio.com", method: "POST", path: "/2010-04-01/Accounts/ACe2efictitious/Messages.json", capturePhoneCode: true, body: { sid: "SMfixture" } };
  try {
    await completeProfile(users.a);
    await createLocalSession(context, users.a);
    await page.goto("/settings");
    const phone = page.getByRole("textbox", { name: /^Phone number/ });
    const input = page.getByLabel("Verification code", { exact: true });
    const verified = async () => (await admin.from("verified_phone_numbers").select("phone_number").eq("user_id", users.a.id).maybeSingle()).data?.phone_number ?? null;
    await phone.fill("+12025550123");
    httpFixtures("E2E-10-phone-sent", [twilio]);
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    await expect(input).toBeVisible();
    await expect.poll(() => /^\d{6}$/.test(code)).toBe(true);
    const issued = code;
    const challenge = await admin.from("phone_verification_challenges").select("code_hash,attempts").eq("user_id", users.a.id).single();
    expect(challenge.error).toBeNull();
    expect(Boolean(challenge.data?.code_hash && challenge.data.code_hash !== issued && challenge.data.code_hash.length === 64)).toBe(true);
    expect(challenge.data?.attempts).toBe(0);
    await input.fill(issued === "000000" ? "000001" : "000000");
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByText("That code is not correct.", { exact: true })).toBeVisible();
    expect(await verified()).toBeNull();
    expect((await admin.from("phone_verification_challenges").select("attempts").eq("user_id", users.a.id).single()).data?.attempts).toBe(1);
    await input.fill(issued);
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByText("Verified for SMS digests.", { exact: true })).toBeVisible();
    expect(await verified()).toBe("+12025550123");
    expect((await admin.from("phone_verification_challenges").select("code_hash,attempts").eq("user_id", users.a.id).single()).data).toEqual({ code_hash: null, attempts: 2 });
    await page.getByRole("checkbox", { name: /SMS digest/ }).check();
    const save = page.locator("form").filter({ has: phone }).getByRole("button", { name: "Save changes", exact: true });
    await save.click();
    await expect(page.getByText("Notification preferences updated.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: /SMS digest/ })).toBeChecked();
    await phone.fill("+12025550124");
    await page.getByRole("checkbox", { name: /SMS digest/ }).uncheck();
    await save.click();
    await expect(page.getByText("Notification preferences updated.", { exact: true })).toBeVisible();
    // The historical proof remains for the old number; the new number has no proof.
    expect(await verified()).toBe("+12025550123");
    await expect(page.getByText("Verified for SMS digests.", { exact: true })).toHaveCount(0);
    await completeProfile(users.b);
    await createLocalSession(context, users.b);
    await page.goto("/settings");
    await phone.fill("+12025550124");
    await save.click();
    await expect(page.getByText("Notification preferences updated.", { exact: true })).toBeVisible();
    code = "";
    httpFixtures("E2E-10-phone-uncertain", [{ ...twilio, status: 503, body: { message: "Fixture uncertain acceptance" } }]);
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    await expect(page.getByText(/If it arrives within a few minutes/)).toBeVisible();
    await expect(input).toBeVisible();
    await expect.poll(() => /^\d{6}$/.test(code)).toBe(true);
    const uncertainCode = code;
    await page.reload();
    httpFixtures("E2E-10-phone-cooldown");
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    await expect(page.getByText(/Please wait .* before requesting another code/)).toBeVisible();
    await expect(input).toBeVisible();
    await input.fill(uncertainCode);
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByText("Verified for SMS digests.", { exact: true })).toBeVisible();
    proof("real phone issuance/confirmation, wrong code refusal, new number has no matching proof, uncertain code surviving reload/cooldown without another HTTP call; OTP only in memory", true);
  } finally {
    code = "";
    await new Promise<void>((resolve) => capture.close(() => resolve()));
    rmSync(socketPath, { force: true });
  }
});

test("E2E-10: confirmed SMS rejection releases the challenge for immediate retry", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  await page.goto("/settings");
  await page.getByRole("textbox", { name: /^Phone number/ }).fill("+12025550125");
  const twilio = { origin: "https://api.twilio.com", method: "POST", path: "/2010-04-01/Accounts/ACe2efictitious/Messages.json", body: { sid: "SMfixture" } };
  httpFixtures("E2E-10-phone-rejected", [{ ...twilio, status: 400, body: { message: "Fixture confirmed rejection" } }]);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByText("We could not send a code to that number. Check it and try again.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Verification code", { exact: true })).toHaveCount(0);
  const challenge = await admin.from("phone_verification_challenges").select("code_hash").eq("user_id", users.a.id).maybeSingle();
  expect(challenge.data?.code_hash ?? null).toBeNull();
  httpFixtures("E2E-10-phone-retry", [twilio]);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByLabel("Verification code", { exact: true })).toBeVisible();
  proof("confirmed Twilio400 causes real release RPC and immediate new issue/HTTP call", true);
});

test("E2E-10: notification preferences persist through UI and remain owner scoped", async ({ page, context, users, proof }) => {
  httpFixtures("E2E-10-preferences");
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  await page.goto("/settings");
  const email = page.getByRole("checkbox", { name: /Email digest/ });
  const sms = page.getByRole("checkbox", { name: /SMS digest/ });
  const save = page.locator("form").filter({ has: email }).getByRole("button", { name: "Save changes", exact: true });
  await email.check();
  await sms.check();
  await page.getByRole("textbox", { name: /^Phone number/ }).fill("+12025550123");
  await save.click();
  await expect(page.getByText("Verify this phone number before enabling SMS digests.")).toBeVisible();
  await sms.uncheck();
  await save.click();
  await expect(page.getByText("Notification preferences updated.")).toBeVisible();
  await page.reload();
  await expect(email).toBeChecked();
  const stored = await users.a.client.from("user_notification_preferences").select("email_digest_enabled,sms_digest_enabled").eq("user_id", users.a.id).single();
  expect(stored.error).toBeNull();
  expect(stored.data).toEqual({ email_digest_enabled: true, sms_digest_enabled: false });
  expect((await users.b.client.from("user_notification_preferences").select("user_id").eq("user_id", users.a.id)).data).toEqual([]);
  await users.b.client.from("user_notification_preferences").update({ email_digest_enabled: false }).eq("user_id", users.a.id);
  expect((await admin.from("user_notification_preferences").select("email_digest_enabled").eq("user_id", users.a.id).single()).data?.email_digest_enabled).toBe(true);
  await email.uncheck();
  await save.click();
  await expect(page.getByText("Notification preferences updated.")).toBeVisible();
  await page.reload();
  await expect(email).not.toBeChecked();
  proof("preference opt-in/out survives reload; unverified SMS rejected by action; cross-user reads/writes denied", true);
});

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
    const subscription = await admin.from("subscriptions").select("stripe_subscription_id,status,plan_key").eq("user_id", users.a.id);
    expect(subscription.error).toBeNull();
    expect(subscription.data).toEqual([{ stripe_subscription_id: active.id, status: "active", plan_key: "premium" }]);
    expect((await admin.from("billing_events").select("processing_state").eq("stripe_event_id", eventId)).data).toEqual([{ processing_state: "processed" }]);
    expect((await users.b.client.from("subscriptions").select("user_id").eq("user_id", users.a.id)).data).toEqual([]);
    expect((await users.a.client.from("subscriptions").select("user_id").eq("user_id", users.a.id)).data).toEqual([]);
    const invalidId = `evt_${randomUUID()}`;
    expect((await deliver(active, "customer.subscription.created", invalidId, true)).status).toBe(400);
    expect((await admin.from("billing_events").select("stripe_event_id").eq("stripe_event_id", invalidId)).data).toEqual([]);
    const unexpectedId = `evt_${randomUUID()}`;
    const unexpected = await deliver(active, "invoice.created", unexpectedId);
    expect(unexpected.status).toBe(200);
    expect((await admin.from("billing_events").select("stripe_event_id").eq("stripe_event_id", unexpectedId)).data).toEqual([]);
    expect((await admin.from("subscriptions").select("stripe_subscription_id,status,plan_key").eq("user_id", users.a.id)).data).toEqual(subscription.data);
    await page.reload();
    await expect(page.getByText("Premium", { exact: true }).first()).toBeVisible();
    proof("signed delivery, replay/concurrency, late cancellation, durable entitlement and invalid signature", true);
  } finally { await admin.from("billing_events").delete().in("stripe_event_id", eventIds); }
});
