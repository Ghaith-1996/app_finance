import { createServiceClient } from "@/lib/supabase/service";
import { resolveGlobalTickers } from "@/lib/services/ticker-resolver";
import { runPythonWorker } from "@/lib/services/news/worker";
import { ingestNewsToSupabase, extractPublisherContent } from "@/lib/services/news";
import { ingestFinnhubPortfolioNews } from "@/lib/services/news/finnhub-refresh";
import { formatIngestStage } from "@/lib/ingest-detail";
import { ENRICHABLE_SOURCE_TYPES } from "@/lib/services/news/source-config";
import { runAnalysis } from "@/lib/services/analysis";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron");

const ANALYSIS_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * POST /api/news/cron
 *
 * Unattended 20-minute global ingest: EDGAR + NewsAPI + GNews + Finnhub.
 * After enrichment, runs analysis for every portfolio automatically.
 * Secured by CRON_SECRET.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { tickers, error: tickerError } = await resolveGlobalTickers(supabase);

  if (tickerError) {
    return Response.json(
      { error: tickerError, tickers: [], totalInserted: 0, enriched: 0 },
      { status: 500 },
    );
  }

  const lookbackHours = 24;
  const maxArticles = 50;

  // --- Global ingest: Python worker + Finnhub ---

  const workerResult = await runPythonWorker(tickers, lookbackHours, maxArticles);
  const ingestStage = formatIngestStage(workerResult);

  if (workerResult.error && workerResult.ingest_status === undefined) {
    return Response.json({
      tickers,
      lookbackHours,
      ingest: ingestStage,
      ingestBreakdown: {
        edgar: workerResult.edgar,
        newsapi: workerResult.newsapi,
        gnews: workerResult.gnews,
        total_inserted: 0,
      },
      totalInserted: 0,
      enriched: 0,
      analysis: { portfoliosProcessed: 0, errors: [] },
    }, { status: 502 });
  }

  // Build combined holdings+watchlist list for Finnhub targeted news
  const { data: allHoldings } = await supabase
    .from("holdings")
    .select("symbol, company");
  const { data: allWatchlist } = await supabase
    .from("watchlist_items")
    .select("symbol, company");

  const seen = new Set<string>();
  const combinedHoldings: Array<{ symbol: string; company: string | null }> = [];
  for (const row of [...(allHoldings ?? []), ...(allWatchlist ?? [])]) {
    const sym = row.symbol?.toUpperCase();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    combinedHoldings.push({ symbol: sym, company: row.company ?? null });
  }

  let finnhubResult = { inserted: 0, updated: 0, skipped: 0, failed: 0, fetch_error: null as string | null, inserted_ids: [] as string[] };
  if (process.env.FINNHUB_API_KEY && combinedHoldings.length > 0) {
    try {
      finnhubResult = await ingestFinnhubPortfolioNews(
        supabase,
        combinedHoldings,
        lookbackHours,
        maxArticles,
      );
    } catch (err) {
      log.warn("Finnhub ingest failed, continuing", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // --- Collect inserted article IDs ---
  const insertedArticleIds: string[] = [];
  for (const key of ["edgar", "newsapi", "gnews"] as const) {
    const ids = workerResult[key]?.inserted_ids;
    if (Array.isArray(ids)) insertedArticleIds.push(...ids);
  }
  if (Array.isArray(finnhubResult.inserted_ids)) {
    insertedArticleIds.push(...finnhubResult.inserted_ids);
  }

  const totalInserted = workerResult.total_inserted + finnhubResult.inserted;

  // --- Extraction + Enrichment ---
  let enriched = 0;
  let enrichError: string | undefined;
  if (insertedArticleIds.length > 0) {
    await extractPublisherContent(supabase, {
      articleIds: insertedArticleIds,
    });

    const enrichResult = await ingestNewsToSupabase(supabase, {
      sourceTypes: [...ENRICHABLE_SOURCE_TYPES],
      limit: totalInserted + 10,
    });
    enriched = enrichResult.enriched;
    enrichError = enrichResult.error;
  }

  // --- Analysis for all portfolios ---
  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, user_id");

  const analysisResults: Array<{
    portfolioId: string;
    runId: string | null;
    feedItemsCreated: number;
    error: string | null;
    skipped?: boolean;
  }> = [];

  for (const p of portfolios ?? []) {
    try {
      const { data: latestRun } = await supabase
        .from("analysis_runs")
        .select("completed_at")
        .eq("portfolio_id", p.id)
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestRun?.completed_at) {
        const elapsed = Date.now() - new Date(latestRun.completed_at).getTime();
        if (elapsed < ANALYSIS_COOLDOWN_MS) {
          analysisResults.push({
            portfolioId: p.id,
            runId: null,
            feedItemsCreated: 0,
            error: null,
            skipped: true,
          });
          continue;
        }
      }

      const result = await runAnalysis(supabase, p.id);
      analysisResults.push({
        portfolioId: p.id,
        runId: result.runId,
        feedItemsCreated: result.meta?.feedItemsCreated ?? 0,
        error: result.error,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Analysis failed for portfolio", { portfolioId: p.id, error: message });
      analysisResults.push({
        portfolioId: p.id,
        runId: null,
        feedItemsCreated: 0,
        error: message,
      });
    }
  }

  const analysisProcessed = analysisResults.filter((r) => !r.skipped && !r.error).length;
  const analysisErrors = analysisResults.filter((r) => r.error).map((r) => ({
    portfolioId: r.portfolioId,
    error: r.error,
  }));
  const analysisSkipped = analysisResults.filter((r) => r.skipped).length;

  return Response.json({
    tickers,
    lookbackHours,
    ingest: ingestStage,
    ingestBreakdown: {
      edgar: workerResult.edgar,
      newsapi: workerResult.newsapi,
      gnews: workerResult.gnews,
      finnhub: finnhubResult,
      total_inserted: totalInserted,
    },
    totalInserted,
    enriched,
    enrichError: enrichError ?? null,
    analysis: {
      portfoliosProcessed: analysisProcessed,
      portfoliosSkipped: analysisSkipped,
      errors: analysisErrors,
      results: analysisResults,
    },
  });
}
