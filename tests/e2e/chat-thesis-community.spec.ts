import { test, expect, admin, createLocalSession, completeProfile, seedPortfolio, httpFixtures, yahooQuoteFixtures } from "./fixtures";
import { randomUUID } from "node:crypto";

test("E2E-08: real community UI pagination appends exact chronological posts without duplication", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  await createLocalSession(context, users.a);
  httpFixtures("E2E-08-pagination");
  const rows = Array.from({ length: 25 }, (_, index) => ({ id: randomUUID(), user_id: users.a.id, body: `Fixture pagination post ${index}`, created_at: new Date(Date.now() - index * 1000).toISOString() }));
  try {
    expect((await users.a.client.from("community_posts").insert(rows)).error).toBeNull();
    await page.goto("/community");
    const bodies = page.getByText(/^Fixture pagination post \d+$/);
    await expect(bodies).toHaveCount(20);
    expect(await bodies.allTextContents()).toEqual(rows.slice(0, 20).map((row) => row.body));
    await page.getByRole("button", { name: "Load more", exact: true }).click();
    await expect(bodies).toHaveCount(25);
    expect(await bodies.allTextContents()).toEqual(rows.map((row) => row.body));
    expect(new Set(await bodies.allTextContents()).size).toBe(25);
    await expect(page.getByRole("button", { name: "Load more", exact: true })).toHaveCount(0);
    proof("25 explicitly seeded posts traverse real getHomeFeed action and chronological cursor; UI20 then25, exact order and no duplicate", true);
  } finally { await users.a.client.from("community_posts").delete().in("id", rows.map((row) => row.id)); }
});

test("E2E-06: paid tiers use real Mistral and Azure HTTP budgets with ownership before quota", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  const articleId = randomUUID(), runId = randomUUID();
  await createLocalSession(context, users.a);
  httpFixtures("E2E-06-paid-seed");
  await page.goto(`/feed?portfolioId=${portfolioId}`);
  const verify = (action: string) => ({ origin: "https://challenges.cloudflare.com", method: "POST", path: "/turnstile/v0/siteverify", body: { success: true, hostname: "127.0.0.1", action } });
  const send = (route: string, modelTier: string) => page.evaluate(async ({ route, modelTier, portfolioId, articleId }) => {
    const response = await fetch(`/api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ portfolioId, ...(route === "article-chat" ? { newsItemId: articleId } : {}), modelTier, message: "Fixture paid-tier question", turnstileToken: "e2e-widget-response" }) });
    return { status: response.status, body: await response.json() };
  }, { route, modelTier, portfolioId, articleId });
  try {
    expect((await admin.from("news_items").insert({ id: articleId, headline: "Fixture paid-tier article", source: "Fixture", category: "other", published_at: new Date().toISOString() })).error).toBeNull();
    expect((await admin.from("analysis_runs").insert({ id: runId, portfolio_id: portfolioId, status: "complete", completed_at: new Date().toISOString(), progress: 100 })).error).toBeNull();
    expect((await admin.from("feed_items").insert({ analysis_run_id: runId, news_item_id: articleId, portfolio_id: portfolioId, relevance_score: 100, holdings: ["AAA"] })).error).toBeNull();
    httpFixtures("E2E-06-free-tier-refusals", [verify("article-chat"), verify("portfolio-copilot")]);
    for (const route of ["article-chat", "portfolio-copilot"]) for (const tier of ["premium", "ultimate"]) expect((await send(route, tier)).status).toBe(403);
    const subscriptionId = `sub_${randomUUID()}`;
    expect((await admin.from("subscriptions").insert({ user_id: users.a.id, stripe_subscription_id: subscriptionId, stripe_customer_id: `cus_${randomUUID()}`, stripe_price_id: "price_e2e_premium", plan_key: "premium", status: "active", current_period_start: new Date().toISOString(), current_period_end: new Date(Date.now() + 86400000).toISOString() })).error).toBeNull();
    for (const [tier, origin, path, budget] of [
      ["premium", "https://openrouter.ai", "/api/v1/chat/completions", '"max_tokens":2000'],
      ["ultimate", "https://e2e.openai.azure.com", "/openai/v1/responses", '"max_output_tokens":2000'],
    ]) {
      if (tier === "ultimate") expect((await admin.from("subscriptions").update({ plan_key: "ultimate", stripe_price_id: "price_e2e_ultimate" }).eq("stripe_subscription_id", subscriptionId)).error).toBeNull();
      httpFixtures(`E2E-06-paid-${tier}`, [verify("article-chat"), verify("portfolio-copilot"), { origin, method: "POST", path, requestAssertions: [{ label: `${tier} explicit2000 budget`, needle: budget, count: 1 }], body: tier === "ultimate" ? { output_text: "Fixture Azure paid reply" } : { choices: [{ message: { content: "Fixture Nemotron paid reply" } }] } }]);
      for (const route of ["article-chat", "portfolio-copilot"]) expect((await send(route, tier)).status).toBe(200);
      if (tier === "premium") {
        httpFixtures("E2E-06-premium-denies-ultimate", [verify("article-chat"), verify("portfolio-copilot")]);
        for (const route of ["article-chat", "portfolio-copilot"]) expect((await send(route, "ultimate")).status).toBe(403);
      }
    }
    const thread = await users.a.client.from("article_chat_threads").select("id").eq("news_item_id", articleId).single();
    expect(thread.error).toBeNull();
    expect((await admin.from("article_chat_messages").select("id").eq("thread_id", thread.data!.id)).data).toHaveLength(4);
    const usage = (await admin.from("ai_usage_counters").select("used_count").eq("user_id", users.a.id)).data!.reduce((sum, row) => sum + row.used_count, 0);
    expect(usage).toBe(4);
    await createLocalSession(context, users.b);
    httpFixtures("E2E-06-paid-cross-owner", [verify("article-chat"), verify("portfolio-copilot")]);
    for (const route of ["article-chat", "portfolio-copilot"]) expect((await send(route, "free")).status).toBe(404);
    expect((await admin.from("ai_usage_counters").select("used_count").eq("user_id", users.b.id)).data).toEqual([]);
    proof("free denies paid tiers; premium allows Nemotron but denies Azure; ultimate allows Azure; both surfaces actual explicit budgets and four successful quota units; B ownership refusal before quota/provider", true);
  } finally { await admin.from("news_items").delete().eq("id", articleId); }
});

test("E2E-06: general and copilot contexts retain distinct watchlist caps and select latest complete or degraded six stories", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  const otherPortfolio = await seedPortfolio(users.a, ["BBB"]);
  await createLocalSession(context, users.a);
  await page.goto(`/feed?portfolioId=${portfolioId}`);
  const provider = { origin: "https://openrouter.ai", method: "POST", path: "/api/v1/chat/completions", body: { choices: [{ message: { content: "Fixture context answer" } }] } };
  const verify = (action: string) => ({ origin: "https://challenges.cloudflare.com", method: "POST", path: "/turnstile/v0/siteverify", body: { success: true, hostname: "127.0.0.1", action } });
  const send = (route: string) => page.evaluate(async ({ route, portfolioId }) => {
    const response = await fetch(`/api/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ portfolioId, modelTier: "free", message: "Fixture context question", turnstileToken: "e2e-widget-response", watchlistSymbols: ["FORGED_CONTEXT"] }) });
    return { status: response.status, body: await response.json() };
  }, { route, portfolioId });
  httpFixtures("E2E-06-empty-watchlist", [verify("portfolio-copilot"), { ...provider, requestAssertions: [{ label: "empty watchlist disclosed", needle: "No watchlist symbols connected.", count: 1 }, { label: "browser watchlist ignored", needle: "FORGED_CONTEXT", count: 0 }] }]);
  expect((await send("portfolio-copilot")).status).toBe(200);
  const symbols = [...Array.from({ length: 30 }, (_, index) => `W${String(index).padStart(2, "0")}`), " w00 ", "w00"];
  expect((await users.a.client.from("watchlist_items").insert(symbols.map((symbol) => ({ user_id: users.a.id, symbol })))).error).toBeNull();
  expect((await users.b.client.from("watchlist_items").insert({ user_id: users.b.id, symbol: "PRIVATE_B" })).error).toBeNull();
  const realSymbols = (await users.a.client.from("watchlist_items").select("symbol").eq("user_id", users.a.id)).data!.map((row) => row.symbol);
  const generalSymbols = [...new Set(realSymbols.map((symbol) => symbol.toUpperCase()).filter(Boolean))];
  const copilotSymbols = [...new Set(realSymbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))].slice(0, 25);
  expect(generalSymbols).toHaveLength(31);
  expect(copilotSymbols).toHaveLength(25);
  const runIds = [randomUUID(), randomUUID(), randomUUID()];
  const newsIds = Array.from({ length: 10 }, () => randomUUID());
  try {
    expect((await admin.from("analysis_runs").insert(runIds.map((id, index) => ({ id, portfolio_id: portfolioId, status: index === 0 ? "complete" : index === 1 ? "degraded" : "queued", completed_at: new Date(Date.now() + index * 1000).toISOString(), progress: index === 2 ? 50 : 100 })))).error).toBeNull();
    expect((await admin.from("news_items").insert(newsIds.map((id, index) => ({ id, headline: `Context story ${index}`, source: "Fixture", category: "other", published_at: new Date().toISOString() })))).error).toBeNull();
    expect((await admin.from("feed_items").insert(newsIds.map((news_item_id, index) => ({ portfolio_id: portfolioId, news_item_id, analysis_run_id: index === 0 ? runIds[0] : index === 9 ? runIds[2] : runIds[1], relevance_score: 80 + index, holdings: ["AAA"] })))).error).toBeNull();
    expect((await users.a.client.from("user_investment_theses").insert([
      { user_id: users.a.id, scope: "holding", portfolio_id: portfolioId, symbol: "AAA", thesis: "Context owned thesis" },
      { user_id: users.a.id, scope: "holding", portfolio_id: otherPortfolio, symbol: "AAA", thesis: "Context other portfolio thesis" },
    ])).error).toBeNull();
    for (const [route, watchlist] of [["article-chat", generalSymbols], ["portfolio-copilot", copilotSymbols]] as const) {
      httpFixtures(`E2E-06-${route}-context`, [verify(route === "article-chat" ? "article-chat" : "portfolio-copilot"), { ...provider, requestAssertions: [
        { label: "actual user watchlist with surface-specific normalization and cap", needle: watchlist.join(", "), count: 1 },
        { label: "other user watchlist excluded", needle: "PRIVATE_B", count: 0 },
        { label: "forged browser watchlist excluded", needle: "FORGED_CONTEXT", count: 0 },
        { label: "owned scoped thesis included", needle: "Context owned thesis", count: 1 },
        { label: "other portfolio thesis excluded", needle: "Context other portfolio thesis", count: 0 },
        ...Array.from({ length: 10 }, (_, index) => ({ label: `latest degraded story ${index} inclusion`, needle: `Context story ${index}`, count: index >= 3 && index <= 8 ? 1 : 0 })),
      ] }]);
      expect((await send(route)).status).toBe(200);
    }
    expect((await admin.from("analysis_runs").update({ status: "complete" }).eq("id", runIds[1])).error).toBeNull();
    httpFixtures("E2E-06-latest-complete-context", [{ ...provider, requestAssertions: [{ label: "same latest run accepted complete", needle: "Context story 8", count: 1 }, { label: "queued newer run excluded", needle: "Context story 9", count: 0 }] }]);
    expect((await send("portfolio-copilot")).status).toBe(200);
    proof("real DB context: empty disclosure, general31 vs trimmed deduplicated copilot25, browser/B excluded, latest complete/degraded six feed stories, portfolio thesis scope", true);
  } finally { await admin.from("news_items").delete().in("id", newsIds); }
});

test("E2E-06: copilot grants, entitlement, provider failure and durable shared quota", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  const otherPortfolio = await seedPortfolio(users.b);
  await createLocalSession(context, users.a);
  await page.goto(`/portfolio?portfolioId=${portfolioId}`);
  const verify = { origin: "https://challenges.cloudflare.com", method: "POST", path: "/turnstile/v0/siteverify", body: { success: true, hostname: "127.0.0.1", action: "portfolio-copilot" } };
  const provider = { origin: "https://openrouter.ai", method: "POST", path: "/api/v1/chat/completions", body: { choices: [{ message: { content: "Fixture copilot answer" } }] } };
  httpFixtures("E2E-06-copilot-first", [verify, { ...provider, requestAssertions: [{ label: "copilot budget", needle: '"max_tokens":2000', count: 1 }, { label: "current copilot question once", needle: "Fixture copilot first question", count: 1 }] }]);
  const send = async (body: Record<string, unknown>) => page.evaluate(async (body) => {
    const response = await fetch("/api/portfolio-copilot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { portfolioId, modelTier: "free", message: "Fixture copilot first question", ...body });
  expect((await send({ turnstileToken: "e2e-widget-response" })).status).toBe(200);
  const usage = async () => (await admin.from("ai_usage_counters").select("used_count").eq("user_id", users.a.id)).data?.reduce((sum, row) => sum + row.used_count, 0);
  expect(await usage()).toBe(1);
  httpFixtures("E2E-06-copilot-grant", [{ ...provider, requestAssertions: [
    { label: "history user once", needle: "Fixture copilot first question", count: 1 },
    { label: "history assistant once", needle: "Fixture copilot answer", count: 1 },
    { label: "current user once", needle: "Fixture copilot second question", count: 1 },
  ] }]);
  expect((await send({ message: "Fixture copilot second question", history: [{ role: "user", content: "Fixture copilot first question" }, { role: "assistant", content: "Fixture copilot answer" }] })).status).toBe(200);
  expect(await usage()).toBe(2);
  httpFixtures("E2E-06-copilot-refusals");
  expect((await send({ modelTier: "premium" })).status).toBe(403);
  expect((await send({ portfolioId: otherPortfolio })).status).toBe(403);
  expect(await usage()).toBe(2);
  httpFixtures("E2E-06-copilot-provider-failure", [{ ...provider, status: 503, body: { error: { message: "Fixture provider unavailable" } } }]);
  expect((await send({})).status).toBe(503);
  expect(await usage()).toBe(2);
  expect((await admin.from("ai_usage_counters").update({ used_count: 100 }).eq("user_id", users.a.id)).error).toBeNull();
  httpFixtures("E2E-06-copilot-quota");
  const limited = await send({});
  expect(limited.status).toBe(429);
  expect(limited.body.quotaUsed).toBe(100);
  expect(await usage()).toBe(100);
  await createLocalSession(context, users.b);
  expect((await send({})).status).toBe(403);
  proof("copilot actual payload history, same-scope grant reuse, changed-user/portfolio refusal, free entitlement, provider error release and durable quota", true);
});

test("E2E-06: article chat provider receives durable history once and threads stay private", async ({ page, context, users, proof }) => {
  test.setTimeout(120_000);
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  const articleId = randomUUID();
  const runId = randomUUID();
  const q1 = "E2E first article question", q2 = "E2E second article question";
  const r1 = "E2E first provider answer", r2 = "E2E second provider answer";
  httpFixtures("E2E-06-article", [
    { origin: "https://challenges.cloudflare.com", method: "POST", path: "/turnstile/v0/siteverify", body: { success: true, hostname: "127.0.0.1", action: "article-chat" } },
    ...[r1, r2].map((answer, index) => ({
      origin: "https://openrouter.ai", method: "POST", path: "/api/v1/chat/completions", ordinal: index + 1,
      requestAssertions: [
        { label: "explicit provider token budget", needle: '"max_tokens":2000', count: 1 },
        { label: "first question occurs once", needle: q1, count: 1 },
        { label: "prior answer included exactly on second request", needle: r1, count: index },
        { label: "second question included only on second request", needle: q2, count: index },
      ],
      body: { id: `chat-e2e-${index}`, choices: [{ message: { role: "assistant", content: answer }, finish_reason: "stop" }] },
    })),
  ]);
  try {
    expect((await admin.from("news_items").insert({ id: articleId, headline: "E2E article for chat", source: "Fixture source", published_at: new Date().toISOString(), stock_tags: ["AAA"], category: "other", global_summary: "Fixture article facts for AAA." })).error).toBeNull();
    expect((await admin.from("analysis_runs").insert({ id: runId, portfolio_id: portfolioId, status: "complete", completed_at: new Date().toISOString(), progress: 100 })).error).toBeNull();
    expect((await admin.from("feed_items").insert({ analysis_run_id: runId, news_item_id: articleId, portfolio_id: portfolioId, relevance_score: 100, holdings: ["AAA"], sectors: [], ai_summary: "Fixture article facts for AAA." })).error).toBeNull();
    await createLocalSession(context, users.a);
    await page.goto(`/feed?portfolioId=${portfolioId}&story=${articleId}`);
    await page.getByRole("button", { name: "Ask AI about this story" }).click();
    for (const [question, answer] of [[q1, r1], [q2, r2]]) {
      await page.getByRole("textbox", { name: "Ask a follow-up" }).fill(question);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.getByText(answer, { exact: true })).toBeVisible();
    }
    const thread = await users.a.client.from("article_chat_threads").select("id").eq("news_item_id", articleId).single();
    expect(thread.error).toBeNull();
    const messages = await users.a.client.from("article_chat_messages").select("role,content").eq("thread_id", thread.data!.id).order("created_at");
    expect(messages.data).toEqual([{ role: "user", content: q1 }, { role: "assistant", content: r1 }, { role: "user", content: q2 }, { role: "assistant", content: r2 }]);
    expect((await users.b.client.from("article_chat_messages").select("id").eq("thread_id", thread.data!.id)).data).toEqual([]);
    await page.reload();
    await page.getByRole("button", { name: "Ask AI about this story" }).click();
    await expect(page.getByText(r2, { exact: true })).toBeVisible();
    const q3 = "Fixture retry article question";
    const provider = { origin: "https://openrouter.ai", method: "POST", path: "/api/v1/chat/completions" };
    const usage = async () => (await admin.from("ai_usage_counters").select("used_count").eq("user_id", users.a.id)).data?.reduce((sum, row) => sum + row.used_count, 0);
    expect(await usage()).toBe(2);
    for (const failure of [
      { name: "rate", response: { status: 429, body: { error: { message: "Fixture busy" } } }, error: "The selected AI provider is busy or rate-limited. Please try again shortly." },
      { name: "empty", response: { body: { choices: [{ message: { content: " " } }] } }, error: "The AI provider returned an unusable response. Please try again or rephrase your question." },
      { name: "timeout", response: { delay: 65_000, body: { choices: [{ message: { content: "Fixture late answer must not persist" } }] } }, error: "The AI provider took too long to respond. Please try again in a moment." },
    ]) {
      httpFixtures(`E2E-06-article-${failure.name}`, [{ ...provider, ...failure.response }]);
      await page.getByRole("textbox", { name: "Ask a follow-up" }).fill(q3);
      await page.getByRole("button", { name: "Send", exact: true }).click();
      await expect(page.getByText(failure.error, { exact: true })).toBeVisible({ timeout: 75_000 });
      await expect(page.getByRole("textbox", { name: "Ask a follow-up" })).toHaveValue(q3);
      await expect(page.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
      expect((await users.a.client.from("article_chat_messages").select("id").eq("thread_id", thread.data!.id)).data).toHaveLength(4);
      expect(await usage()).toBe(2);
    }
    httpFixtures("E2E-06-article-retry-success", [{ ...provider, requestAssertions: [
      { label: "retry question once after three failed attempts", needle: q3, count: 1 },
      { label: "first durable question once on retry", needle: q1, count: 1 },
      { label: "second durable answer once on retry", needle: r2, count: 1 },
      { label: "late failed answer excluded", needle: "Fixture late answer must not persist", count: 0 },
    ], body: { choices: [{ message: { content: "Fixture retry answer" } }] } }]);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("Fixture retry answer", { exact: true })).toBeVisible();
    expect((await users.a.client.from("article_chat_messages").select("role,content").eq("thread_id", thread.data!.id).order("created_at")).data?.slice(-2)).toEqual([{ role: "user", content: q3 }, { role: "assistant", content: "Fixture retry answer" }]);
    expect((await users.a.client.from("article_chat_messages").select("id").eq("thread_id", thread.data!.id)).data).toHaveLength(6);
    expect(await usage()).toBe(3);
    proof("article scope: real HTTP history/budget, durable reload/private messages; 429, empty and actual60s timeout leave four messages/quota2; UI retry commits one pair/quota3", true);
  } finally { await admin.from("news_items").delete().eq("id", articleId); }
});

test("E2E-07: holding thesis snapshots persist and remain private", async ({ page, context, users, proof }) => {
  httpFixtures("E2E-07", yahooQuoteFixtures(["AAA"]));
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  await createLocalSession(context, users.a);
  await page.goto(`/portfolio/full?portfolioId=${portfolioId}`);
  await page.getByRole("button", { name: /AAA/ }).first().click();
  const panel = page.getByRole("region", { name: "AAA investment thesis" });
  await panel.getByLabel("Thesis", { exact: true }).fill("Fixture thesis initial");
  await panel.getByLabel("Risks", { exact: true }).fill("Fixture first risk");
  await panel.getByRole("button", { name: "Save thesis" }).click();
  await expect(panel.getByText("Thesis saved.", { exact: true })).toBeVisible();
  await expect.poll(async () => (await users.a.client.from("user_investment_thesis_history").select("thesis")).data).toEqual([{ thesis: "Fixture thesis initial" }]);
  await panel.getByLabel("Thesis", { exact: true }).fill("Fixture thesis revised");
  await panel.getByLabel("Risks", { exact: true }).fill("Fixture first risk\nFixture second risk");
  await panel.getByLabel("Horizon", { exact: true }).selectOption("long");
  await panel.getByLabel("Conviction", { exact: true }).selectOption("high");
  await panel.getByRole("button", { name: "Save thesis" }).click();
  await expect.poll(async () => (await users.a.client.from("user_investment_thesis_history").select("thesis,change_type").order("captured_at")).data).toEqual([{ thesis: "Fixture thesis initial", change_type: "created" }, { thesis: "Fixture thesis initial", change_type: "updated" }]);
  await page.reload();
  await page.getByRole("button", { name: /AAA/ }).first().click();
  await expect(panel.getByLabel("Thesis", { exact: true })).toHaveValue("Fixture thesis revised");
  const saved = await users.a.client.from("user_investment_theses").select("id,scope,portfolio_id,risks,horizon,conviction").single();
  expect(saved.data).toMatchObject({ scope: "holding", portfolio_id: portfolioId, risks: ["Fixture first risk", "Fixture second risk"], horizon: "long", conviction: "high" });
  expect((await users.b.client.from("user_investment_theses").select("id")).data).toEqual([]);
  await users.b.client.from("user_investment_theses").update({ thesis: "Not allowed" }).eq("id", saved.data!.id);
  expect((await admin.from("user_investment_theses").select("thesis").eq("id", saved.data!.id).single()).data?.thesis).toBe("Fixture thesis revised");
  expect((await users.a.client.from("watchlist_items").insert({ user_id: users.a.id, symbol: "AAA", company: "Fixture AAA" })).error).toBeNull();
  httpFixtures("E2E-07-watchlist-scope", [
    ...yahooQuoteFixtures(["AAA"]),
    { origin: "https://finnhub.io", method: "GET", path: "/api/v1/quote", body: { c: 20, dp: 1 } },
    ...["/quote", "/profile", "/time_series", "/statistics", "/earnings", "/income_statement", "/balance_sheet", "/cash_flow"].map((path) => ({ origin: "https://api.twelvedata.com", method: "GET", path, body: path === "/quote" ? { symbol: "AAA", name: "Fixture AAA", close: "20", currency: "USD" } : {} })),
  ]);
  await page.goto("/watchlist?symbol=AAA");
  const watchlistPanel = page.getByRole("region", { name: "AAA investment thesis" });
  await expect(watchlistPanel.getByLabel("Thesis", { exact: true })).toHaveValue("");
  await watchlistPanel.getByLabel("Thesis", { exact: true }).fill("Fixture separate watchlist thesis");
  await watchlistPanel.getByRole("button", { name: "Save thesis" }).click();
  await expect(watchlistPanel.getByText("Thesis saved.", { exact: true })).toBeVisible();
  const scoped = await users.a.client.from("user_investment_theses").select("scope,portfolio_id,thesis").eq("symbol", "AAA").order("scope");
  expect(scoped.data).toEqual([
    { scope: "holding", portfolio_id: portfolioId, thesis: "Fixture thesis revised" },
    { scope: "watchlist", portfolio_id: null, thesis: "Fixture separate watchlist thesis" },
  ]);
  await page.reload();
  await expect(watchlistPanel.getByLabel("Thesis", { exact: true })).toHaveValue("Fixture separate watchlist thesis");
  await page.goto(`/portfolio/full?portfolioId=${portfolioId}`);
  await page.getByRole("button", { name: /AAA/ }).first().click();
  await expect(panel.getByLabel("Thesis", { exact: true })).toHaveValue("Fixture thesis revised");
  proof("create/update snapshots, same ticker holding/watchlist scopes remain separate on save/reload, holding-scope RLS; delete history deliberately unqualified", true);
});

test("E2E-08: real post/comment actions, Turnstile refusal and back navigation", async ({ page, context, users, proof }) => {
  const verify = { origin: "https://challenges.cloudflare.com", method: "POST", path: "/turnstile/v0/siteverify", body: { success: true, hostname: "127.0.0.1", action: "community", challenge_ts: new Date().toISOString() } };
  httpFixtures("E2E-08", [verify]);
  await completeProfile(users.a);
  await completeProfile(users.b);
  await createLocalSession(context, users.a);
  await page.goto("/community");
  await page.getByRole("textbox", { name: /What's on your mind/ }).fill("Fixture original community post");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect.poll(async () => (await users.a.client.from("community_posts").select("body").eq("user_id", users.a.id).single()).data?.body).toBe("Fixture original community post");
  await expect(page.getByRole("textbox", { name: /What's on your mind/ })).toHaveValue("");
  await expect(page.getByText("Fixture original community post", { exact: true })).toBeVisible();
  const post = await users.a.client.from("community_posts").select("id,body").eq("user_id", users.a.id).single();
  expect(post.data?.body).toBe("Fixture original community post");
  await createLocalSession(context, users.b);
  await page.reload();
  await page.getByRole("button", { name: /comment/i }).first().click();
  await expect(page.getByText("Fixture original community post", { exact: true }).last()).toBeVisible();
  await page.getByPlaceholder("Write a comment…").fill("Fixture comment from B");
  await page.getByPlaceholder("Write a comment…").press("Enter");
  await expect(page.getByText("Fixture comment from B", { exact: true })).toBeVisible();
  expect((await users.b.client.from("community_comments").select("body,user_id").eq("post_id", post.data!.id)).data).toEqual([{ body: "Fixture comment from B", user_id: users.b.id }]);
  await page.getByRole("button", { name: "Back to community" }).click();
  httpFixtures("E2E-08-refused", [{ ...verify, body: { success: false, "error-codes": ["invalid-input-response"] } }]);
  await page.getByRole("textbox", { name: /What's on your mind/ }).fill("This post must never persist");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByText(/Bot verification failed/)).toBeVisible();
  expect((await admin.from("community_posts").select("id").eq("body", "This post must never persist")).data).toEqual([]);
  proof("post/comment durable with real user sessions, widget transport, siteverify refusal and return UI", true);
});
