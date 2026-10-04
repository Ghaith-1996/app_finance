import { randomUUID } from "node:crypto";
import { test, expect, admin, createLocalSession, completeProfile, seedPortfolio, httpFixtures } from "./fixtures";

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
