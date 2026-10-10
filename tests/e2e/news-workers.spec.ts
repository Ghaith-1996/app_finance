import { randomUUID } from "node:crypto";
import { test, expect, admin, createLocalSession, completeProfile, seedPortfolio, httpFixtures, yahooQuoteFixtures } from "./fixtures";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync } from "node:fs";

test("E2E-11: current and candidate workers finalize through Node enrichment into visible feed articles", async ({ page, context, users, proof }) => {
  test.setTimeout(480_000);
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  const otherPortfolio = await seedPortfolio(users.b);
  await createLocalSession(context, users.a);
  await page.goto("/admin");
  const invoke = (route: string, selectedPortfolio = portfolioId) => page.evaluate(async ({ route, portfolioId }) => {
    const result = await fetch(`/api/news/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ portfolioId, lookbackHours: 24, maxArticles: 1 }) });
    return { status: result.status, body: await result.json() };
  }, { route, portfolioId: selectedPortfolio });
  httpFixtures("E2E-11-success-access-refusals");
  await createLocalSession(context, users.b);
  for (const route of ["refresh", "refresh-v2"]) expect((await invoke(route, otherPortfolio)).status).toBe(403);
  await createLocalSession(context, users.a);
  for (const route of ["refresh", "refresh-v2"]) expect((await invoke(route, otherPortfolio)).status).toBe(404);
  const urls: string[] = [];
  const paragraph = "Fixture AAA reported higher earnings and revenue. Management reported steady demand and improving margins. Investors are assessing operating cash flow alongside the outlook for the coming year.";
  const ai = (requestContains: string, content: unknown) => ({ origin: "https://openrouter.ai", method: "POST", path: "/api/v1/chat/completions", requestContains, body: { choices: [{ message: { content: JSON.stringify(content) } }] } });
  const secondary = [
    ...["/rss", "/rss/search"].map((path) => ({ origin: "https://news.google.com", method: "GET", path, status: 503, body: "Fixture outage" })),
    ...["/files/company_tickers.json", "/files/company_tickers_mf.json", "/files/company_tickers_exchange.json", "/Archives/edgar/cik-lookup-data.txt"].map((path) => ({ origin: "https://www.sec.gov", method: "GET", path, status: 503, body: "Fixture outage" })),
    { origin: "https://finnhub.io", method: "GET", path: "/api/v1/company-news", body: [] },
    { origin: "https://v3-api.newscatcherapi.com", method: "POST", path: "/api/search", body: { articles: [] } },
  ];
  try {
    for (const [route, source] of [["refresh", "newsapi"], ["refresh-v2", "newsapi_ai"]]) {
      const identity = randomUUID();
      const path = `/pipeline/${identity}`;
      const url = `https://publisher.e2e.invalid${path}`;
      const headline = `Fixture AAA pipeline ${route} ${identity}`;
      urls.push(url);
      const now = new Date().toISOString();
      httpFixtures(`E2E-11-success-${route}`, [
        ...secondary,
        { origin: "https://newsapi.org", method: "GET", path: "/v2/everything", body: { status: "ok", totalResults: 1, articles: [{ source: { name: "Fixture publisher" }, title: headline, url, publishedAt: now, description: paragraph }] } },
        { origin: "https://eventregistry.org", method: "POST", path: "/api/v1/article/getArticles", body: { articles: { results: [{ uri: identity, title: headline, url, dateTimePub: now, body: paragraph, source: { title: "Fixture publisher" }, concepts: [{ label: { eng: "AAA" } }] }] } } },
        { origin: "https://publisher.e2e.invalid", method: "GET", path, headers: { "content-type": "text/html" }, body: `<html><head><title>${headline}</title></head><body><article><h1>${headline}</h1><p>${paragraph}</p><p>${paragraph}</p></article></body></html>` },
        ai("financial-news classification", { category: "earnings", globalSummary: "Fixture Node enriched AAA earnings.", overallEffect: "bullish", stockTags: ["AAA"], tickerImpacts: [{ symbol: "AAA", effect: "bullish" }] }),
        ai("output 3 short insights", [{ title: "Fixture real Node insight", value: "AAA", detail: "Fixture earnings support the outlook." }]),
        ai("explicit-indirect portfolio impact classifier", { relevanceScore: 0, whyItMatters: "", matchedHoldings: [], matchReasonCodes: [] }),
      ]);
      const response = await invoke(route);
      expect(response.status).toBe(200);
      expect(response.body.totalInserted).toBe(1);
      expect(response.body.stages.enrichment.status).toBe("success");
      expect(response.body.stages.analysis.status).toBe("success");
      const article = await users.a.client.from("news_items").select("id,source_type,enrichment_status,global_summary").eq("url", url).single();
      expect(article.data).toMatchObject({ source_type: source, enrichment_status: "succeeded", global_summary: "Fixture Node enriched AAA earnings." });
      await expect.poll(async () => (await admin.from("news_items").select("extraction_status").eq("url", url).single()).data?.extraction_status, { timeout: 180_000 }).toBe("complete");
      expect((await users.a.client.from("analysis_runs").select("status,progress").eq("id", response.body.analysisRunId).single()).data).toEqual({ status: "complete", progress: 100 });
      expect((await users.a.client.from("feed_items").select("news_item_id").eq("analysis_run_id", response.body.analysisRunId).eq("news_item_id", article.data!.id)).data).toHaveLength(1);
      await page.goto(`/feed?portfolioId=${portfolioId}&story=${article.data!.id}`);
      await expect(page.getByRole("heading", { name: headline, exact: true }).last()).toBeVisible();
      proof(`${route}: real worker ${source}, durable extraction, Node HTTP AI enrichment, published complete analysis, feed and article detail`, true);
    }
  } finally { await admin.from("news_items").delete().in("url", urls); }
});

test("E2E-11: authenticated current and candidate routes spawn real workers with distinct argv and HTTP", async ({ page, context, users, proof }) => {
  test.setTimeout(120_000);
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  await createLocalSession(context, users.a);
  await page.goto("/admin");
  const ledgerStart = readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).length;
  httpFixtures("E2E-11-route-bridges", [
    { origin: "https://newsapi.org", method: "GET", path: "/v2/everything", status: 503, body: { status: "error", code: "unexpectedError", message: "Fixture outage" } },
    { origin: "https://eventregistry.org", method: "POST", path: "/api/v1/article/getArticles", status: 503, body: { error: "Fixture outage" } },
    { origin: "https://v3-api.newscatcherapi.com", method: "POST", path: "/api/search", status: 503, body: { error: "Fixture outage" } },
    ...["/rss", "/rss/search"].map((path) => ({ origin: "https://news.google.com", method: "GET", path, status: 503, body: "Fixture outage" })),
    ...["/files/company_tickers.json", "/files/company_tickers_mf.json", "/files/company_tickers_exchange.json", "/Archives/edgar/cik-lookup-data.txt"].map((path) => ({ origin: "https://www.sec.gov", method: "GET", path, status: 503, body: "Fixture outage" })),
    { origin: "https://finnhub.io", method: "GET", path: "/api/v1/company-news", status: 503, body: { error: "Fixture outage" } },
  ]);
  for (const route of ["refresh", "refresh-v2"]) {
    const response = await page.evaluate(async ({ route, portfolioId }) => {
      const result = await fetch(`/api/news/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ portfolioId, lookbackHours: 24, maxArticles: 1 }) });
      return { status: result.status, body: await result.json() };
    }, { route, portfolioId });
    expect(response.status).toBe(502);
    expect(response.body.stages.ingest.status).toBe("failed");
  }
  const ledger = readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).slice(ledgerStart).map((line) => JSON.parse(line));
  const workers = ledger.filter((row) => row.module === "workers.news_ingestion.main");
  expect(workers).toHaveLength(2);
  expect(workers[0].worker_flags).toMatchObject({ "--tickers": "AAA", "--lookback-hours": "24", "--max-articles": "1" });
  expect(workers[0].worker_flags["--provider-set"]).toBeUndefined();
  expect(workers[0].worker_flags["--queries-json"]).toBeUndefined();
  expect(workers[1].worker_flags["--provider-set"]).toBe("candidate");
  expect(JSON.parse(workers[1].worker_flags["--queries-json"])).toEqual(['"Fixture AAA" AAA stock']);
  for (const path of ["/v2/everything", "/api/v1/article/getArticles", "/api/search"])
    expect(ledger.some((row) => row.path === path && row.transport === "python")).toBe(true);
  proof("current/candidate real route-to-spawn argv and distinct provider HTTP failures; successful publication remains separate", true);
});

test("E2E-12: earnings cache beyond Data API cap survives real provider HTTP failures", async ({ page, context, users, proof }) => {
  test.setTimeout(120_000);
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a, ["ZZZZ"]);
  const fillers = Array.from({ length: 1000 }, (_, index) => `E${String(index).padStart(4, "0")}`);
  const cached = { symbol: "ZZZZ", is_active: true, preferred_url: "https://publisher.e2e.invalid/cached-report", company_url: "https://publisher.e2e.invalid/cached-report", url_source: "company", report_date: "2026-09-30", title: "Retained quarterly report" };
  httpFixtures("E2E-12-earnings-cap", [
    ...yahooQuoteFixtures(["ZZZZ"]),
    { origin: "https://www.sec.gov", method: "GET", path: "/files/company_tickers.json", status: 503, body: { error: "Fixture SEC outage" } },
    { origin: "https://api.twelvedata.com", method: "GET", path: "/profile", status: 503, body: { status: "error", message: "Fixture company outage" } },
  ]);
  try {
    expect((await admin.from("ticker_earnings_reports").insert([...fillers.map((symbol) => ({ symbol, is_active: false })), cached])).error).toBeNull();
    expect((await admin.from("ticker_earnings_reports").select("symbol").order("symbol")).data).toHaveLength(1000);
    await createLocalSession(context, users.a);
    await page.goto(`/portfolio/full?portfolioId=${portfolioId}`);
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/earnings-reports/cron", { method: "POST", headers: { authorization: "Bearer e2e-fictitious-cron" } });
      return { status: response.status, body: await response.json() };
    });
    expect(result.status).toBe(502);
    expect(result.body).toMatchObject({ processed: 1, stale: 1, failed: 1, missing: 0 });
    expect((await admin.from("ticker_earnings_reports").select("preferred_url,report_date,title").eq("symbol", "ZZZZ").single()).data).toEqual({ preferred_url: cached.preferred_url, report_date: cached.report_date, title: cached.title });
    await page.reload();
    await expect(page.getByRole("link", { name: "ZZZZ latest earnings report" })).toHaveAttribute("href", cached.preferred_url);
    proof("1000-row Data API cap observed; row1001 retained after SEC/company HTTP outage and rendered on holding", true);
  } finally {
    const symbols = [...fillers, "ZZZZ"];
    for (let index = 0; index < symbols.length; index += 250) await admin.from("ticker_earnings_reports").delete().in("symbol", symbols.slice(index, index + 250));
  }
});

test("E2E-11: real main and extraction child persist and deduplicate a NewsAPI article", async ({ users, proof }) => {
  test.setTimeout(300_000);
  const identity = randomUUID();
  const path = `/story/${identity}`;
  const articleUrl = `https://publisher.e2e.invalid${path}`;
  const paragraph = "Fixture Alpha reported quarterly revenue growth and a higher operating margin. The company stated that demand for its products remained steady across its major markets. Investors continue to assess expenses and cash flow alongside the outlook for the coming year.";
  const ledgerStart = readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).length;
  httpFixtures("E2E-11-direct-worker", [
    { origin: "https://newsapi.org", method: "GET", path: "/v2/everything", body: { status: "ok", totalResults: 1, articles: [{ source: { id: "e2e", name: "Fixture publisher" }, title: `Fixture Alpha earnings ${identity}`, url: articleUrl, publishedAt: new Date().toISOString(), description: paragraph }] } },
    { origin: "https://publisher.e2e.invalid", method: "GET", path, headers: { "content-type": "text/html; charset=utf-8" }, body: `<html><head><title>Fixture Alpha quarterly earnings</title></head><body><article><h1>Fixture Alpha quarterly earnings</h1><p>${paragraph}</p><p>${paragraph}</p></article></body></html>` },
  ]);
  await completeProfile(users.a);
  const invoke = async () => {
    const result = await promisify(execFile)("python", ["-m", "workers.news_ingestion.main", "--tickers", "AAA", "--sources", "newsapi", "--lookback-hours", "24", "--max-articles", "1"], {
      env: { ...process.env, NEWSAPI_KEY: "e2e-fictitious", EDGAR_IDENTITY: "Local Fixture fixture@example.invalid" }, timeout: 60_000,
    });
    return JSON.parse(result.stdout);
  };
  try {
    const first = await invoke();
    expect(first.newsapi.inserted).toBe(1);
    expect(first.full_text_extraction).toMatchObject({ queued: 1, background: true });
    await expect.poll(async () => (await admin.from("news_items").select("extraction_status").eq("url", articleUrl).single()).data?.extraction_status, { timeout: 180_000 }).toBe("complete");
    const article = await users.a.client.from("news_items").select("source_type,external_id,extracted_content").eq("url", articleUrl).single();
    expect(article.error).toBeNull();
    expect(article.data?.source_type).toBe("newsapi");
    expect(article.data?.external_id).toMatch(/^newsapi_/);
    expect(article.data?.extracted_content).toContain("reported quarterly revenue growth");
    const second = await invoke();
    expect(second.newsapi.inserted).toBe(0);
    expect(second.newsapi.skipped).toBe(1);
    expect((await admin.from("news_items").select("id").eq("url", articleUrl)).data).toHaveLength(1);
    const ledger = readFileSync(process.env.E2E_LEDGER!, "utf8").split("\n").filter(Boolean).slice(ledgerStart).map((line) => JSON.parse(line));
    expect(ledger.filter((row) => row.module === "workers.news_ingestion.main")).toHaveLength(2);
    const child = ledger.find((row) => row.module === "workers.news_ingestion.extract_full_text");
    expect(child).toBeTruthy();
    expect(ledger.some((row) => row.module === "workers.news_ingestion.main" && String(row.pid) === child.inherited_python_pid)).toBe(true);
    expect(ledger.filter((row) => row.path === path)).toHaveLength(1);
    proof("direct worker main/Popen extractor, real parser, durable extracted text and stable provider deduplication", true);
  } finally { await admin.from("news_items").delete().eq("url", articleUrl); }
});

test("E2E-12: real admin health thresholds exclude old failures and informational notes", async ({ page, context, users, proof }) => {
  httpFixtures("E2E-12-health");
  await completeProfile(users.a);
  const portfolioId = await seedPortfolio(users.a);
  const now = new Date().toISOString();
  expect((await admin.from("holdings").update({ quote_as_of: now }).eq("portfolio_id", portfolioId)).error).toBeNull();
  expect((await admin.from("analysis_runs").insert({ portfolio_id: portfolioId, status: "complete", completed_at: now, progress: 100 })).error).toBeNull();
  const newsIds: string[] = [];
  const earningsSymbols: string[] = [];
  async function failedNews(count: number, old = false) {
    const rows = Array.from({ length: count }, () => ({ id: randomUUID(), headline: "Fixture failed news", source: "Fixture", published_at: now, created_at: old ? new Date(Date.now() - 2 * 86400000).toISOString() : now, enrichment_status: "failed" }));
    newsIds.push(...rows.map((row) => row.id));
    expect((await admin.from("news_items").insert(rows)).error).toBeNull();
  }
  async function failedEarnings(count: number, note?: string) {
    const rows = Array.from({ length: count }, (_, i) => ({ symbol: `E2E${earningsSymbols.length + i}`, is_active: true, error: note ?? "Fixture real refresh error" }));
    earningsSymbols.push(...rows.map((row) => row.symbol));
    expect((await admin.from("ticker_earnings_reports").insert(rows)).error).toBeNull();
  }
  async function health() {
    return page.evaluate(async () => { const response = await fetch("/api/admin/job-health"); return { status: response.status, body: await response.json() }; });
  }
  try {
    await failedNews(3);
    await failedEarnings(2);
    await createLocalSession(context, users.a);
    await page.goto("/admin");
    let report = await health();
    expect(report.status).toBe(200);
    expect(report.body.enrichment.failedLast24h).toBe(3);
    expect(report.body.earnings.rowsWithErrors).toBe(2);
    await failedNews(8);
    await failedEarnings(4);
    report = await health();
    expect(report.status).toBe(503);
    expect(report.body.enrichment.failedLast24h).toBe(11);
    expect(report.body.earnings.rowsWithErrors).toBe(6);
    await failedNews(4, true);
    // Exact notes are part of the business contract; no query responses are mocked.
    await failedEarnings(1, "No newer report found; showing the last known report.");
    await failedEarnings(1, "No earnings report link found.");
    report = await health();
    expect(report.body.enrichment.failedLast24h).toBe(11);
    expect(report.body.earnings.rowsWithErrors).toBe(6);
    await createLocalSession(context, users.b);
    expect((await health()).status).toBe(403);
    proof("admin health actual Data API counts and RLS-authenticated non-admin refusal", { failures: 11, earnings: 6 });
  } finally {
    await admin.from("news_items").delete().in("id", newsIds);
    await admin.from("ticker_earnings_reports").delete().in("symbol", earningsSymbols);
  }
});
