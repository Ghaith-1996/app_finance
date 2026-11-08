import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test, expect, admin, createLocalSession, completeProfile, seedPortfolio, httpFixtures } from "./fixtures";

const completions = { origin: "https://openrouter.ai", method: "POST", path: "/api/v1/chat/completions" };
const groqCompletions = { origin: "https://api.groq.com", method: "POST", path: "/openai/v1/chat/completions" };
const nemotron = { requestHeaders: { authorization: "Bearer sk-or-e2e-nemotron" }, requestAssertions: [{ label: "Nemotron model", needle: '"model":"nvidia/nemotron-3-ultra-550b-a55b:free"', count: 1 }] };
const stepfun = { requestHeaders: { authorization: "Bearer sk-or-e2e-fixture" }, requestAssertions: [{ label: "StepFun model", needle: '"model":"stepfun/step-3.5-flash:free"', count: 1 }] };
const groq = { ...groqCompletions, requestHeaders: { authorization: "Bearer gsk-e2e-fixture" }, requestAssertions: [
  { label: "Groq model", needle: '"model":"openai/gpt-oss-120b"', count: 1 },
  { label: "Groq medium reasoning", needle: '"reasoning_effort":"medium"', count: 1 },
  { label: "Groq JSON mode", needle: '"response_format":{"type":"json_object"}', count: 1 },
] };
const reply = (content: string) => ({ choices: [{ message: { content } }] });
const failure = (status: number, message: string) => ({ status, body: { error: { message } } });

function providerCalls(scenario: string, path = completions.path) {
  return readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line))
    .filter((row) => row.scenario === scenario && row.path === path).length;
}

test("E2E-13: enrichment tries Groq, falls back to Nemotron only on provider-wide refusals, and never spends attempts on them", async ({ page, proof }) => {
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
    return new Map(result.data!.map((row) => [row.id, row]));
  }
  const makeDue = async () => expect((await admin.from("news_items").update({ enrichment_next_attempt_at: null }).in("id", ids)).error).toBeNull();
  try {
    // Both providers refuse: the attempt is refunded and the batch stops after one article.
    for (const [scenario, groqStatus, nemotronStatus, code] of [["E2E-13-quota", 429, 429, "provider_rate_limited"], ["E2E-13-auth", 401, 403, "provider_auth"]] as const) {
      httpFixtures(scenario, [
        { ...groq, ...failure(groqStatus, groqStatus === 429 ? "Rate limit reached for model openai/gpt-oss-120b on tokens per day (TPD)" : "Invalid API Key") },
        { ...completions, ...nemotron, ...failure(nemotronStatus, nemotronStatus === 429 ? "Rate limit exceeded: free-models-per-day" : "Forbidden") },
      ]);
      const result = await enrich();
      expect(result.status).toBe(500);
      expect(result.body).toMatchObject({ enriched: 0, retrying: 0, failed: 0 });
      expect(result.body.error).toContain(code);
      expect(providerCalls(scenario, groqCompletions.path), "Groq tried once").toBe(1);
      expect(providerCalls(scenario), "Nemotron fallback tried once, then the batch stops").toBe(1);
      const after = [...(await state()).values()];
      expect(after.map((row) => [row.enrichment_status, row.enrichment_attempts])).toEqual(ids.map(() => ["pending", 0]));
      expect(after.filter((row) => row.enrichment_last_error?.includes(`OpenRouter HTTP ${nemotronStatus}`))).toHaveLength(1);
      await makeDue();
    }

    // Groq 500 counts without fallback; Groq 429 falls back to Nemotron; Groq success needs no fallback.
    const analysis = JSON.stringify({ category: "earnings", globalSummary: "AAA beat.", overallEffect: "bullish", stockTags: ["AAA"], tickerImpacts: [{ symbol: "AAA", effect: "bullish" }] });
    httpFixtures("E2E-13-mixed", [
      { ...groq, ordinal: 1, ...failure(500, "Internal Server Error") },
      { ...groq, ordinal: 2, ...failure(429, "Rate limit reached for model openai/gpt-oss-120b on tokens per minute (TPM)") },
      { ...groq, ordinal: 3, body: reply(analysis) },
      { ...completions, ...nemotron, body: reply(analysis) },
    ]);
    const mixed = await enrich();
    expect(mixed.status).toBe(200);
    expect(mixed.body).toMatchObject({ enriched: 2, retrying: 1, failed: 0, error: null });
    expect(providerCalls("E2E-13-mixed", groqCompletions.path)).toBe(3);
    expect(providerCalls("E2E-13-mixed"), "only the Groq 429 article used Nemotron").toBe(1);
    const final = await state();
    expect(final.get(ids[0])).toMatchObject({ enrichment_status: "retrying", enrichment_attempts: 1 });
    expect(final.get(ids[0])!.enrichment_last_error).toContain("Groq HTTP 500");
    for (const id of ids.slice(1)) expect(final.get(id)).toMatchObject({ enrichment_status: "succeeded", enrichment_attempts: 1, category: "earnings" });
    proof("Groq first (model, medium reasoning, JSON mode, key); 429/401 fall back to Nemotron; both refusing refunds and stops with HTTP 500; Groq 500 counts without fallback", true);
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
