import { randomUUID } from "node:crypto";
import { test, expect, admin, createLocalSession, completeProfile, seedPortfolio, httpFixtures } from "./fixtures";

test("E2E-04: Finnhub watchlist add/retry/reload/delete and cross-user isolation", async ({ page, context, users, proof }) => {
  httpFixtures("E2E-04", [
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
  await page.reload();
  expect((await users.a.client.from("watchlist_items").select("id")).data).toEqual([]);
  expect((await users.a.client.from("holdings").select("symbol").eq("portfolio_id", portfolioId)).data).toEqual([{ symbol: "NVDA" }]);
  proof("one durable watchlist row after real action retry; B denied; delete preserves holding", true);
});

test("E2E-05: 105 real feed rows paginate without loss or duplication", async ({ page, context, users, proof }) => {
  httpFixtures("E2E-05");
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a, ["NVDA", "AAA"]);
  const runId = randomUUID();
  expect((await admin.from("analysis_runs").insert({ id: runId, portfolio_id: portfolioId, status: "complete", completed_at: new Date().toISOString(), progress: 100 })).error).toBeNull();
  const rows = Array.from({ length: 105 }, (_, i) => ({ id: randomUUID(), headline: `E2E story ${i}`, source: "Fixture source", published_at: new Date(Date.now() - i * 60_000).toISOString(), category: "other", stock_tags: [i % 2 ? "AAA" : "NVDA"], global_summary: `Fixture summary ${i}` }));
  try {
    expect((await admin.from("news_items").insert(rows)).error).toBeNull();
    expect((await admin.from("feed_items").insert(rows.map((row) => ({ analysis_run_id: runId, news_item_id: row.id, portfolio_id: portfolioId, relevance_score: 100, holdings: row.stock_tags, sectors: ["Technology"], ai_summary: row.global_summary })))).error).toBeNull();
    await createLocalSession(context, users.a);
    await page.goto(`/feed?portfolioId=${portfolioId}`);
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
    proof("105 seeded feed rows, actual Next pagination and Data API, exact ordered IDs", observed);
  } finally { await admin.from("news_items").delete().in("id", rows.map((row) => row.id)); }
});
