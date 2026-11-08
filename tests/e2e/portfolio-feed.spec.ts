import { randomUUID } from "node:crypto";
import { test, expect, admin, createLocalSession, completeProfile, seedPortfolio, httpFixtures, yahooQuoteFixtures } from "./fixtures";

test("E2E-03: real CAD USD pricing preserves cached FX and quotes before fresh 173 USD valuation", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a, ["AAA", "SHOP.TO"]);
  const oldAsOf = new Date(Date.now() - 2 * 86400000).toISOString();
  expect((await admin.from("holdings").update({ quote_currency: "CAD", fx_rate_to_usd: 0.73, fx_as_of: oldAsOf }).eq("portfolio_id", portfolioId).eq("symbol", "SHOP.TO")).error).toBeNull();
  const quotes = ["AAA", "SHOP.TO", "CADUSD=X"].map((symbol) => {
    const fixture = yahooQuoteFixtures([symbol])[2];
    if (typeof fixture.body !== "object" || !("quoteResponse" in fixture.body)) throw new Error("Expected Yahoo quote fixture");
    const result = fixture.body.quoteResponse.result[0];
    return { ...fixture, query: { symbols: symbol }, body: { quoteResponse: { error: null, result: [{ ...result, regularMarketPrice: symbol === "CADUSD=X" ? 0.73 : 100, regularMarketPreviousClose: symbol === "CADUSD=X" ? 0.73 : 99, currency: symbol === "SHOP.TO" ? "CAD" : "USD" }] } } };
  });
  const bootstrap = yahooQuoteFixtures([]).slice(0, 2);
  httpFixtures("E2E-03-missing-FX", [...bootstrap, ...quotes.slice(0, 2), { origin: "https://query2.finance.yahoo.com", method: "GET", path: "/v7/finance/quote", query: { symbols: "CADUSD=X" }, status: 503, body: { error: "Fixture FX unavailable" } }]);
  await createLocalSession(context, users.a);
  await page.goto(`/portfolio/full?portfolioId=${portfolioId}`);
  await expect.poll(async () => (await users.a.client.from("holdings").select("current_price").eq("portfolio_id", portfolioId).eq("symbol", "SHOP.TO").single()).data?.current_price).toBe(100);
  await expect(page.getByText("Auto-refreshing...", { exact: true })).toHaveCount(0);
  const stale = await users.a.client.from("holdings").select("fx_rate_to_usd,fx_as_of").eq("portfolio_id", portfolioId).eq("symbol", "SHOP.TO").single();
  expect(stale.data?.fx_rate_to_usd).toBe(0.73);
  expect(Date.parse(stale.data!.fx_as_of)).toBe(Date.parse(oldAsOf));
  httpFixtures("E2E-03-fresh-FX", [...bootstrap, ...quotes]);
  const fullRequest = page.waitForRequest((request) => request.method() === "POST" && Boolean(request.headers()["next-action"]) && Boolean(request.postData()?.includes(portfolioId)));
  await page.getByRole("button", { name: "Refresh prices", exact: true }).click();
  expect((await fullRequest).postData()).toContain('"includeHoldings":true');
  await expect(page.getByText("Updated 2 holdings.", { exact: true })).toBeVisible();
  await expect(page.getByText("$173", { exact: true }).first()).toBeVisible();
  const fresh = await users.a.client.from("holdings").select("symbol,current_price,fx_rate_to_usd,fx_as_of,quote_as_of").eq("portfolio_id", portfolioId).order("symbol");
  expect(fresh.data?.map((row) => [row.symbol, row.current_price, row.fx_rate_to_usd])).toEqual([["AAA", 100, 1], ["SHOP.TO", 100, 0.73]]);
  expect(Date.parse(fresh.data![1].fx_as_of)).toBeGreaterThan(Date.parse(oldAsOf));
  expect((await users.a.client.from("holdings").select("symbol,allocation").eq("portfolio_id", portfolioId).order("symbol")).data).toEqual([{ symbol: "AAA", allocation: 57.8 }, { symbol: "SHOP.TO", allocation: 42.2 }]);
  await page.goto(`/portfolio?portfolioId=${portfolioId}`);
  const inlineQuotes = quotes.map((quote, index) => index ? quote : { ...quote, body: { quoteResponse: { error: null, result: [{ ...quote.body.quoteResponse.result[0], regularMarketPrice: 200 }] } } });
  httpFixtures("E2E-03-inline-pricing", [...bootstrap, ...inlineQuotes]);
  const inlineRequest = page.waitForRequest((request) => request.method() === "POST" && Boolean(request.headers()["next-action"]) && Boolean(request.postData()?.includes(portfolioId)));
  await page.getByRole("button", { name: "Refresh prices", exact: true }).click();
  expect((await inlineRequest).postData()?.includes("includeHoldings")).toBe(false);
  await expect(page.getByText("$273", { exact: true }).first()).toBeVisible();
  await expect.poll(async () => (await users.a.client.from("holdings").select("current_price").eq("portfolio_id", portfolioId).eq("symbol", "AAA").single()).data?.current_price).toBe(200);
  const beforeOutage = (await users.a.client.from("holdings").select("symbol,current_price,fx_rate_to_usd,fx_as_of,quote_as_of").eq("portfolio_id", portfolioId).order("symbol")).data;
  httpFixtures("E2E-03-quotes-unavailable", [...bootstrap, { origin: "https://query2.finance.yahoo.com", method: "GET", path: "/v7/finance/quote", status: 503, body: { error: "Fixture quotes unavailable" } }]);
  await page.getByRole("button", { name: "Refresh prices", exact: true }).click();
  await expect(page.getByText("No live quotes were returned. Showing last known prices.", { exact: true })).toBeVisible();
  expect((await users.a.client.from("holdings").select("symbol,current_price,fx_rate_to_usd,fx_as_of,quote_as_of").eq("portfolio_id", portfolioId).order("symbol")).data).toEqual(beforeOutage);
  await expect(page.getByText("$273", { exact: true }).first()).toBeVisible();
  proof("CAD100 ×0.73 + USD100 = USD173/allocation57.8:42.2; full callback then inline without includeHoldings updates USD273 without reload; missing FX and quote outages preserve exact stored cache", true);
});

test("E2E-05: a newer real holding filter wins over a delayed older request", async ({ page, context, users, proof }) => {
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a, ["AAA", "NVDA"]);
  const runId = randomUUID();
  const ids = [randomUUID(), randomUUID()];
  httpFixtures("E2E-05-filter-race");
  let release!: () => void;
  let reached!: () => void;
  let newerReached!: () => void;
  let olderHandled!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const olderRequest = new Promise<void>((resolve) => { reached = resolve; });
  const newerRequest = new Promise<void>((resolve) => { newerReached = resolve; });
  const olderFinished = new Promise<void>((resolve) => { olderHandled = resolve; });
  let olderAborted = false;
  page.on("requestfailed", (request) => { if (new URL(request.url()).searchParams.get("holding") === "AAA") olderAborted = true; });
  try {
    expect((await admin.from("analysis_runs").insert({ id: runId, portfolio_id: portfolioId, status: "complete", completed_at: new Date().toISOString(), progress: 100 })).error).toBeNull();
    expect((await admin.from("news_items").insert(ids.map((id, index) => ({ id, headline: `Fixture filter ${index}`, source: "Fixture", published_at: new Date().toISOString(), category: "other", stock_tags: [index ? "NVDA" : "AAA"] })))).error).toBeNull();
    expect((await admin.from("feed_items").insert(ids.map((id, index) => ({ analysis_run_id: runId, news_item_id: id, portfolio_id: portfolioId, relevance_score: 100, holdings: [index ? "NVDA" : "AAA"] })))).error).toBeNull();
    await createLocalSession(context, users.a);
    await page.goto(`/feed?portfolioId=${portfolioId}`);
    await page.route("**/api/feed?**", async (route) => {
      const query = new URL(route.request().url()).searchParams;
      if (query.get("holding") === "AAA") { reached(); await barrier; }
      if (query.get("holding") === "NVDA") newerReached();
      try { await route.continue(); }
      catch (error) { if (!route.request().failure()) throw error; }
      finally { if (query.get("holding") === "AAA") olderHandled(); }
    });
    const holding = page.getByRole("combobox", { name: "Select holding", exact: true });
    await holding.selectOption("AAA");
    await olderRequest;
    const newerResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/feed" && new URL(response.url()).searchParams.get("holding") === "NVDA");
    await holding.selectOption("NVDA");
    const dispatchedNewer = await Promise.race([newerRequest.then(() => true), new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000))]);
    if (dispatchedNewer) {
      expect((await newerResponse).status()).toBe(200);
      await expect(page.locator(`#feed-story-${ids[1]}`)).toBeVisible();
    }
    release();
    await olderFinished;
    expect(dispatchedNewer, "The newer filter must be dispatched while the older response is delayed").toBe(true);
    await expect(holding).toHaveValue("NVDA");
    await expect(page.locator('[id^="feed-story-"]')).toHaveCount(1);
    await expect(page.locator(`#feed-story-${ids[1]}`)).toBeVisible();
    await expect(page.locator(`#feed-story-${ids[0]}`)).toHaveCount(0);
    proof("real GET barrier preserves current filter chips and exact new story IDs before/after older response released; no content replacement", { olderAborted });
  } finally {
    release?.();
    await page.unroute("**/api/feed?**");
    await admin.from("news_items").delete().in("id", ids);
  }
});

test("E2E-03: real position actions, identical replay and full sale remain atomic", async ({ page, context, users, proof }) => {
  httpFixtures("E2E-03", yahooQuoteFixtures(["AAA"]));
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  const initial = await users.a.client.from("holdings").select("id").eq("portfolio_id", portfolioId).single();
  expect(initial.error).toBeNull();
  await createLocalSession(context, users.a);
  await page.goto(`/portfolio/full?portfolioId=${portfolioId}`);
  const open = async () => page.getByRole("button", { name: /AAA/ }).first().click();
  await open();
  const panel = page.getByRole("region", { name: "Adjust position AAA" });
  await panel.getByPlaceholder("e.g. 10").fill("2");
  await panel.getByPlaceholder("e.g. 195.50").fill("25");
  const outgoing = page.waitForRequest((request) => request.method() === "POST" && Boolean(request.headers()["next-action"]) && Boolean(request.postData()?.includes(initial.data!.id)));
  await panel.getByRole("button", { name: "Apply purchase" }).click();
  const request = await outgoing;
  const payload = request.postData()!;
  const headers = { "next-action": request.headers()["next-action"], "content-type": request.headers()["content-type"] };
  await expect.poll(async () => (await users.a.client.from("holdings").select("quantity,average_cost").eq("id", initial.data!.id).single()).data).toEqual({ quantity: 3, average_cost: 20 });
  await expect(page.getByRole("button", { name: /AAA/ }).first().getByText("3.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /AAA/ }).first().getByText("$20.00", { exact: true }).first()).toBeVisible();
  const replay = await page.evaluate(async ({ payload, headers }) => {
    const result = await fetch(location.pathname + location.search, { method: "POST", headers, body: payload });
    return result.status;
  }, { payload, headers });
  expect(replay).toBe(200);
  expect((await users.a.client.from("holding_transactions").select("id").eq("portfolio_id", portfolioId)).data).toHaveLength(1);
  const originalOperation = await users.a.client.from("holding_transactions").select("id").eq("portfolio_id", portfolioId).single();
  expect(originalOperation.error).toBeNull();
  expect(payload.includes(originalOperation.data!.id)).toBe(true);
  const rpc = (operationId: string, kind: string, quantity: number, price: number | null, holdingId = initial.data!.id, client = users.a.client) => client.rpc("apply_holding_transaction", {
    p_operation_id: operationId, p_portfolio_id: portfolioId, p_holding_id: holdingId, p_kind: kind, p_quantity: quantity, p_price: price,
  });
  for (const divergent of [
    () => rpc(originalOperation.data!.id, "add", 3, 25),
    () => rpc(originalOperation.data!.id, "add", 2, 26),
    () => rpc(originalOperation.data!.id, "add", 2, 25, randomUUID()),
    () => rpc(randomUUID(), "sell", 100, null),
    () => rpc(randomUUID(), "add", 1, 20, initial.data!.id, users.b.client),
  ]) expect((await divergent()).error).not.toBeNull();
  expect((await users.a.client.from("holdings").select("quantity,average_cost").eq("id", initial.data!.id).single()).data).toEqual({ quantity: 3, average_cost: 20 });
  const concurrentOperation = randomUUID();
  const concurrent = await Promise.all([rpc(concurrentOperation, "add", 1, 20), rpc(concurrentOperation, "add", 1, 20)]);
  expect(concurrent.every((result) => result.error === null)).toBe(true);
  expect(concurrent.map((result) => result.data.status).sort()).toEqual(["applied", "duplicate"]);
  expect((await users.a.client.from("holdings").select("quantity").eq("id", initial.data!.id).single()).data?.quantity).toBe(4);
  await page.reload();
  await open();
  await panel.getByPlaceholder("max 4.0000").fill("1");
  await panel.getByRole("button", { name: "Apply sale" }).click();
  await expect.poll(async () => (await users.a.client.from("holdings").select("quantity,average_cost").eq("id", initial.data!.id).single()).data).toEqual({ quantity: 3, average_cost: 20 });
  await expect(page.getByRole("button", { name: /AAA/ }).first().getByText("3.00", { exact: true })).toBeVisible();
  expect((await users.b.client.from("holdings").select("id").eq("id", initial.data!.id)).data).toEqual([]);
  await page.reload();
  await open();
  await panel.getByRole("button", { name: "Max", exact: true }).click();
  await panel.getByRole("button", { name: "Apply sale" }).click();
  await expect.poll(async () => (await users.a.client.from("holdings").select("id").eq("id", initial.data!.id)).data).toEqual([]);
  await expect(page.getByRole("button", { name: /AAA/ })).toHaveCount(0);
  const transactions = await users.a.client.from("holding_transactions").select("kind,quantity,requested_holding_id").eq("portfolio_id", portfolioId).order("created_at");
  expect(transactions.data).toEqual([
    { kind: "add", quantity: 2, requested_holding_id: initial.data!.id },
    { kind: "add", quantity: 1, requested_holding_id: initial.data!.id },
    { kind: "sell", quantity: 1, requested_holding_id: initial.data!.id },
    { kind: "sell", quantity: 3, requested_holding_id: initial.data!.id },
  ]);
  expect((await rpc(originalOperation.data!.id, "add", 2, 25)).data?.status).toBe("duplicate");
  expect((await users.a.client.from("holdings").select("id").eq("id", initial.data!.id)).data).toEqual([]);
  proof("UI add/partial/full sale equals DB without corrective reload; divergent quantity/price/holding, oversell and B denied; concurrent same-ID exactly once and captured operation replay remains protected after full sale", true);
});

test("E2E-04: Finnhub watchlist add/retry/reload/delete and cross-user isolation", async ({ page, context, users, proof }) => {
  httpFixtures("E2E-04", [
    ...["/quote", "/profile", "/time_series", "/statistics", "/earnings", "/income_statement", "/balance_sheet", "/cash_flow"].map((path) => ({ origin: "https://api.twelvedata.com", method: "GET", path, body: path === "/quote" ? { symbol: "NVDA", name: "Fixture Nvidia", close: "100", currency: "USD" } : {} })),
    { origin: "https://finnhub.io", method: "GET", path: "/api/v1/search", body: { count: 1, result: [{ symbol: "NVDA", displaySymbol: "NVDA", description: "Fixture Nvidia", type: "Common Stock" }] } },
    { origin: "https://finnhub.io", method: "GET", path: "/api/v1/quote", body: { c: 100, d: 1, dp: 1, h: 101, l: 99, o: 99, pc: 99, t: Math.floor(Date.now() / 1000) } },
  ]);
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a, ["NVDA"]);
  await createLocalSession(context, users.a);
  await page.goto("/watchlist");
  for (let repeat = 0; repeat < 2; repeat++) {
    await page.getByRole("button", { name: "Add to Watchlist", exact: true }).click();
    await page.getByPlaceholder("Ticker or company…").fill("NVDA");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("button", { name: /NVDA Fixture Nvidia/ }).click();
    await expect.poll(async () => (await users.a.client.from("watchlist_items").select("symbol")).data).toEqual([{ symbol: "NVDA" }]);
  }
  await page.reload();
  await expect(page.getByText("Fixture Nvidia", { exact: true }).first()).toBeVisible();
  const owned = await users.a.client.from("watchlist_items").select("id,company").single();
  expect(owned.data?.company).toBe("Fixture Nvidia");
  expect((await users.b.client.from("watchlist_items").select("id").eq("id", owned.data!.id)).data).toEqual([]);
  await users.b.client.from("watchlist_items").delete().eq("id", owned.data!.id);
  expect((await admin.from("watchlist_items").select("id").eq("id", owned.data!.id)).data).toHaveLength(1);
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect.poll(async () => (await users.a.client.from("watchlist_items").select("id")).data).toEqual([]);
  await page.reload();
  expect((await users.a.client.from("watchlist_items").select("id")).data).toEqual([]);
  expect((await users.a.client.from("holdings").select("symbol").eq("portfolio_id", portfolioId)).data).toEqual([{ symbol: "NVDA" }]);
  proof("one durable watchlist row after real action retry; B denied; delete preserves holding", true);
});

test("E2E-05: 105 real feed rows paginate without loss or duplication", async ({ page, context, users, proof }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1100, height: 900 });
  httpFixtures("E2E-05");
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a, ["NVDA", "AAA"]);
  expect((await users.a.client.from("holdings").update({ sector: "Technology" }).eq("portfolio_id", portfolioId).eq("symbol", "AAA")).error).toBeNull();
  expect((await users.a.client.from("holdings").update({ sector: "Energy" }).eq("portfolio_id", portfolioId).eq("symbol", "NVDA")).error).toBeNull();
  const runId = randomUUID();
  expect((await admin.from("analysis_runs").insert({ id: runId, portfolio_id: portfolioId, status: "complete", completed_at: new Date().toISOString(), progress: 100 })).error).toBeNull();
  const rows = Array.from({ length: 105 }, (_, i) => ({ id: randomUUID(), headline: `E2E story ${i}`, source: "Fixture source", published_at: new Date(Date.now() - i * 60_000).toISOString(), category: "other", stock_tags: [i % 2 ? "AAA" : "NVDA"], global_summary: `Fixture summary ${i}` }));
  try {
    expect((await admin.from("news_items").insert(rows)).error).toBeNull();
    expect((await admin.from("feed_items").insert(rows.map((row) => ({ analysis_run_id: runId, news_item_id: row.id, portfolio_id: portfolioId, relevance_score: 100, holdings: row.stock_tags, sectors: [row.stock_tags[0] === "AAA" ? "Technology" : "Energy"], ai_summary: row.global_summary })))).error).toBeNull();
    await createLocalSession(context, users.a);
    await page.goto(`/feed?portfolioId=${portfolioId}`);
    const domIds = () => page.locator('[id^="feed-story-"]').evaluateAll((elements) => elements.map((element) => element.id.replace("feed-story-", "")));
    const defaultPage = await page.evaluate(async (portfolioId) => (await fetch(`/api/feed?mode=personal&portfolioId=${portfolioId}`)).json(), portfolioId);
    expect(defaultPage.pageSize).toBe(100);
    expect(defaultPage.totalCount).toBe(105);
    await expect.poll(domIds).toEqual(defaultPage.feed.map((story: { newsItemId: string }) => story.newsItemId));
    const uiNextResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/feed" && new URL(response.url()).searchParams.get("page") === "2");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    const uiNext = await (await uiNextResponse).json();
    expect(uiNext.pageSize).toBe(100);
    expect(uiNext.totalCount).toBe(105);
    await expect.poll(domIds).toEqual(uiNext.feed.map((story: { newsItemId: string }) => story.newsItemId));
    expect(new Set([...defaultPage.feed, ...uiNext.feed].map((story: { newsItemId: string }) => story.newsItemId)).size).toBe(105);
    await expect(page.getByText("Page 2 of 2 · Showing 5 of 105 articles", { exact: true })).toBeVisible();
    await page.getByText("Refine by sector or category", { exact: true }).click();
    await page.getByRole("combobox", { name: "Sector", exact: true }).selectOption("Energy");
    await expect.poll(async () => (await domIds()).length).toBe(53);
    await page.getByRole("combobox", { name: "Select holding", exact: true }).selectOption("AAA");
    await expect.poll(domIds).toEqual([]);
    await expect(page.getByRole("combobox", { name: "Sector", exact: true })).toHaveValue("Energy");
    await expect(page.getByRole("combobox", { name: "Select holding", exact: true })).toHaveValue("AAA");
    await page.getByRole("button", { name: "Reset filters", exact: true }).first().click();
    await expect.poll(async () => (await domIds()).length).toBe(100);
    const observed: string[] = [];
    for (let pageNumber = 1; pageNumber <= 3; pageNumber++) {
      const response = await page.evaluate(async ({ portfolioId, pageNumber }) => {
        const result = await fetch(`/api/feed?mode=personal&portfolioId=${portfolioId}&page=${pageNumber}&pageSize=50&sort=recent`);
        return { status: result.status, body: await result.json() };
      }, { portfolioId, pageNumber });
      expect(response.status).toBe(200);
      expect(response.body.totalCount).toBe(105);
      expect(response.body.totalPages).toBe(3);
      observed.push(...response.body.feed.map((story: { newsItemId: string }) => story.newsItemId));
    }
    expect(observed).toEqual(rows.map((row) => row.id));
    expect(new Set(observed).size).toBe(105);
    for (const index of [0, 104]) {
      await page.goto(`/feed?portfolioId=${portfolioId}&story=${rows[index].id}`);
      await expect(page.getByRole("dialog", { name: "Article details" }).getByText(rows[index].headline, { exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("story")).toBe(rows[index].id);
    }
    await page.goto(`/feed?portfolioId=${portfolioId}&story=${randomUUID()}`);
    await expect(page.getByText(/The story you opened is no longer available/)).toBeVisible();
    await expect.poll(async () => (await domIds()).length).toBe(100);
    await page.goto(`/portfolio?portfolioId=${portfolioId}`);
    const opportunityLinks = page.locator('a[href^="/feed?story="]');
    const hrefs = await opportunityLinks.evaluateAll((links) => links.slice(0, 2).map((link) => link.getAttribute("href")!));
    expect(hrefs).toHaveLength(2);
    expect(new Set(hrefs).size).toBe(2);
    for (const href of hrefs) {
      const id = new URL(href, "http://127.0.0.1:3000").searchParams.get("story");
      const row = rows.find((row) => row.id === id)!;
      expect(row).toBeTruthy();
      await page.locator(`a[href="${href}"]`).first().click();
      await expect(page).toHaveURL((url) => url.pathname === "/feed" && url.searchParams.get("story") === row.id);
      // Scoped to the opened article: the same headline is also a feed card heading when the story is on the current page.
      await expect(page.getByRole("dialog", { name: "Article details" }).getByRole("heading", { name: row.headline, exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("story")).toBe(row.id);
      await page.goto(`/portfolio?portfolioId=${portfolioId}`);
    }
    proof("105 seeded rows exact pagination; server default100 equals initial UI and Next UI request; zero holding/sector combination stays selected then reset; two direct deep links including row105 render own article, missing ID falls back to feed", observed);
    proof("two distinct actual portfolio opportunity links open their own exact feed article ID and headline", true);
  } finally { await admin.from("news_items").delete().in("id", rows.map((row) => row.id)); }
});
