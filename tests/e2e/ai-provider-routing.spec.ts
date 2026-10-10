import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test, expect, admin, createLocalSession, completeProfile, seedPortfolio, httpFixtures } from "./fixtures";

const completions = { origin: "https://openrouter.ai", method: "POST", path: "/api/v1/chat/completions" };
const nemotron = { requestHeaders: { authorization: "Bearer sk-or-e2e-nemotron" }, requestAssertions: [{ label: "Nemotron model", needle: '"model":"nvidia/nemotron-3-ultra-550b-a55b:free"', count: 1 }] };
const stepfun = { requestHeaders: { authorization: "Bearer sk-or-e2e-fixture" }, requestAssertions: [{ label: "StepFun model", needle: '"model":"stepfun/step-3.5-flash:free"', count: 1 }] };
const reply = (content: string) => ({ choices: [{ message: { content } }] });
const providerError = (status: number, message: string) => ({ ...completions, ...nemotron, status, body: { error: { message } } });

function providerCalls(scenario: string) {
  return readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    .filter((row) => row.scenario === scenario && row.path === completions.path).length;
}

test("E2E-13: enrichment uses the Nemotron key and never spends attempts on provider-wide refusals", async ({ page, proof }) => {
  const ids = [randomUUID(), randomUUID(), randomUUID()];
  // Distinct publication times fix the order in which the route claims articles.
  const rows = ids.map((id, i) => ({ id, headline: `Fixture enrichment ${i}`, source: "Fixture", raw_content: "AAA reported results.", published_at: new Date(Date.now() - i * 60_000).toISOString(), enrichment_status: "pending" }));
  expect((await admin.from("news_items").insert(rows)).error).toBeNull();
  await page.goto("/login");
  async function enrich() {
    return page.evaluate(async (articleIds) => {
      const response = await fetch("/api/news/cron/enrich", { method: "POST", headers: { authorization: "Bearer e2e-fictitious-cron", "content-type": "application/json" }, body: JSON.stringify({ articleIds }) });
      return { status: response.status, body: await response.json() };
    }, ids);
  }
  async function state() {
    const result = await admin.from("news_items").select("id,enrichment_status,enrichment_attempts,enrichment_last_error,category").in("id", ids);
    expect(result.error).toBeNull();
    return result.data!;
  }
  const makeDue = async () => expect((await admin.from("news_items").update({ enrichment_next_attempt_at: null }).in("id", ids)).error).toBeNull();
  try {
    for (const [scenario, status, code] of [["E2E-13-429", 429, "provider_rate_limited"], ["E2E-13-403", 403, "provider_auth"]] as const) {
      httpFixtures(scenario, [providerError(status, status === 429 ? "Rate limit exceeded: free-models-per-day" : "Forbidden")]);
      const result = await enrich();
      expect(result.status).toBe(500);
      expect(result.body).toMatchObject({ enriched: 0, retrying: 0, failed: 0 });
      expect(result.body.error).toContain(code);
      expect(providerCalls(scenario), "batch stops at the first provider-wide refusal").toBe(1);
      const after = await state();
      expect(after.map((row) => [row.enrichment_status, row.enrichment_attempts])).toEqual(ids.map(() => ["pending", 0]));
      expect(after.filter((row) => row.enrichment_last_error?.includes(`HTTP ${status}`))).toHaveLength(1);
      await makeDue();
    }

    // An ordinary per-article failure still counts its attempt and does not stop the batch.
    const analysis = JSON.stringify({ category: "earnings", globalSummary: "AAA beat.", overallEffect: "bullish", stockTags: ["AAA"], tickerImpacts: [{ symbol: "AAA", effect: "bullish" }] });
    httpFixtures("E2E-13-recovery", [
      { ...completions, ...nemotron, ordinal: 1, status: 500, body: { error: { message: "Upstream error" } } },
      { ...completions, ...nemotron, ordinal: 2, body: reply(analysis) },
      { ...completions, ...nemotron, ordinal: 3, body: reply(analysis) },
    ]);
    const recovered = await enrich();
    expect(recovered.status).toBe(200);
    expect(recovered.body).toMatchObject({ enriched: 2, retrying: 1, failed: 0, error: null });
    const final = await state();
    expect(final.filter((row) => row.enrichment_status === "succeeded" && row.category === "earnings" && row.enrichment_attempts === 1)).toHaveLength(2);
    expect(final.filter((row) => row.enrichment_status === "retrying" && row.enrichment_attempts === 1)).toHaveLength(1);
    proof("429/403 refund the attempt and stop the batch with HTTP 500; 500 counts; success enriches; Nemotron key+model on every call", true);
  } finally {
    await admin.from("news_items").delete().in("id", ids);
  }
});

test("E2E-14: premium chat answers through Nemotron while free chat stays on StepFun", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  const subscriptionId = `sub_e2e_${randomUUID()}`;
  expect((await admin.from("subscriptions").insert({ user_id: users.a.id, stripe_subscription_id: subscriptionId, stripe_customer_id: "cus_e2e", stripe_price_id: "price_e2e_premium", plan_key: "premium", status: "active", current_period_end: new Date(Date.now() + 86400000).toISOString() })).error).toBeNull();
  const verify = { origin: "https://challenges.cloudflare.com", method: "POST", path: "/turnstile/v0/siteverify", body: { success: true, hostname: "127.0.0.1", action: "article-chat", challenge_ts: new Date().toISOString() } };
  httpFixtures("E2E-14", [
    verify,
    { ...completions, ...nemotron, ordinal: 1, body: reply("Nemotron premium answer") },
    { ...completions, ...stepfun, ordinal: 2, body: reply("StepFun free answer") },
  ]);
  await createLocalSession(context, users.a);
  await page.goto("/feed");
  async function ask(modelTier: string) {
    return page.evaluate(async (body) => {
      const response = await fetch("/api/article-chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    }, { portfolioId, message: "How is my portfolio doing?", modelTier, turnstileToken: "e2e-widget-response" });
  }
  try {
    const premium = await ask("premium");
    expect(premium.status).toBe(200);
    expect(premium.body.messages.at(-1)).toMatchObject({ role: "assistant", content: "Nemotron premium answer" });
    const free = await ask("free");
    expect(free.status).toBe(200);
    expect(free.body.messages.at(-1)).toMatchObject({ role: "assistant", content: "StepFun free answer" });
    expect(providerCalls("E2E-14")).toBe(2);
    proof("premium tier → Nemotron key and model; free tier → StepFun key and model", true);
  } finally {
    await admin.from("subscriptions").delete().eq("stripe_subscription_id", subscriptionId);
  }
});
