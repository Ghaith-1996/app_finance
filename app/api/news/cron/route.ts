import { createServiceClient } from "@/lib/supabase/service";
import { resolveGlobalTickers } from "@/lib/services/ticker-resolver";
import { runPythonWorker } from "@/lib/services/news/worker";
import { ingestNewsToSupabase, extractPublisherContent } from "@/lib/services/news";
import {
  ingestFinnhubPortfolioNews,
  type RefreshSourceRow,
} from "@/lib/services/news/finnhub-refresh";
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
async function runNewsCron(request: Request) {
  const startedAt = Date.now();
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
  log.info("Cron run started");

  const { tickers, error: tickerError } = await resolveGlobalTickers(supabase);

  if (tickerError) {
    log.error("Cron ticker resolution failed", { error: tickerError });
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
    log.error("Cron worker failed before ingest status", {
      durationMs: Date.now() - startedAt,
      error: workerResult.error,
    });
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

  let finnhubResult: RefreshSourceRow & { updated: number } = {
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    fetch_error: null,
    inserted_ids: [],
  };
  if (process.env.FINNHUB_API_KEY && combinedHoldings.length > 0) {
    try {
      const result = await ingestFinnhubPortfolioNews(
        supabase,
        combinedHoldings,
        lookbackHours,
        maxArticles,
      );
      finnhubResult = {
        ...result,
        updated: 0,
      };
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

  log.info("Cron run completed", {
    durationMs: Date.now() - startedAt,
    inserted: {
      edgar: workerResult.edgar?.inserted ?? 0,
      newsapi: workerResult.newsapi?.inserted ?? 0,
      gnews: workerResult.gnews?.inserted ?? 0,
      finnhub: finnhubResult.inserted,
      total: totalInserted,
    },
    enriched,
    analysis: {
      processed: analysisProcessed,
      skipped: analysisSkipped,
      errors: analysisErrors.length,
    },
    pythonWorkerRuntime: "Requires verification on deployed Vercel functions because cron invokes runPythonWorker()",
  });

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

export async function GET(request: Request) {
  return runNewsCron(request);
}

export async function POST(request: Request) {
  return runNewsCron(request);
}
