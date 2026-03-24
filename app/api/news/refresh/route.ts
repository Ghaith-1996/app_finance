import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ingestNewsToSupabase, extractPublisherContent } from "@/lib/services/news";
import { runAnalysis } from "@/lib/services/analysis";
import { formatIngestStage } from "@/lib/ingest-detail";
import { ingestFinnhubPortfolioNews } from "@/lib/services/news/finnhub-refresh";
import { ENRICHABLE_SOURCE_TYPES } from "@/lib/services/news/source-config";
import { runPythonWorker } from "@/lib/services/news/worker";
import { resolveGlobalTickers } from "@/lib/services/ticker-resolver";
import { getNewsPoolSnapshot24h } from "@/lib/services/news/pool-snapshot";

/**
 * POST /api/news/refresh
 *
 * @deprecated Retained for admin/debug use only. Production ingestion and
 * analysis now run automatically via the 20-minute cron job (POST /api/news/cron).
 * No user-facing UI calls this route anymore.
 *
 * Full pipeline: ingest global 24h pool → enrich → analyze portfolio.
 *
 * - EDGAR: global ticker universe (all holdings in DB), not the selected portfolio.
 * - NewsAPI: global market/business headlines (Python worker; no tickers).
 * - GNews: broad global/top stories.
 * - Finnhub: refresh-only targeted company news for the selected portfolio holdings.
 * - Analysis: uses the selected portfolio’s holdings only.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { portfolioId?: string; lookbackHours?: number; maxArticles?: number } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch { /* empty body is fine */ }

  const lookbackHours = Math.max(1, Math.min(body.lookbackHours ?? 24, 168));
  const maxArticles = Math.max(1, Math.min(body.maxArticles ?? 20, 100));

  let portfolioId = body.portfolioId ?? null;
  if (!portfolioId) {
    const { data: portfolios } = await supabase
      .from("portfolios")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    portfolioId = portfolios?.[0]?.id ?? null;
  }

  if (!portfolioId) {
    return Response.json(
      { error: "no_portfolio", message: "No portfolio found. Create one first." },
      { status: 400 },
    );
  }

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (!portfolio) {
    return Response.json(
      { error: "portfolio_not_found", message: "Portfolio not found." },
      { status: 404 },
    );
  }

  const { data: holdingsRows } = await supabase
    .from("holdings")
    .select("symbol, company")
    .eq("portfolio_id", portfolioId);

  const analysisSymbols = [
    ...new Set((holdingsRows ?? []).map((h) => (h.symbol as string).toUpperCase())),
  ];

  if (analysisSymbols.length === 0) {
    return Response.json(
      { error: "no_holdings", message: "No holdings in this portfolio. Add some first." },
      { status: 400 },
    );
  }

  const serviceSupabase = createServiceClient();
  const { tickers: globalTickers, error: tickerError } = await resolveGlobalTickers(serviceSupabase);

  if (tickerError) {
    return Response.json(
      { error: "ticker_resolution_failed", message: tickerError },
      { status: 500 },
    );
  }

  type StageStatus = "success" | "failed" | "skipped" | "partial" | "empty" | "queued";
  const stages: Record<string, { status: StageStatus; detail: string }> = {};

  const workerResult = await runPythonWorker(globalTickers, lookbackHours, maxArticles);
  const finnhubResult = await ingestFinnhubPortfolioNews(
    serviceSupabase,
    holdingsRows ?? [],
    lookbackHours,
    maxArticles,
  );

  stages.ingest = formatIngestStage(workerResult);
  if (finnhubResult.inserted > 0 && stages.ingest.status !== "failed") {
    stages.ingest = {
      status: stages.ingest.status === "partial" ? "partial" : "success",
      detail: `${stages.ingest.detail} Finnhub added ${finnhubResult.inserted} targeted article${finnhubResult.inserted === 1 ? "" : "s"}.`,
    };
  }
  if (finnhubResult.fetch_error && stages.ingest.status !== "failed") {
    stages.ingest = {
      status: "partial",
      detail: `${stages.ingest.detail} Finnhub targeted fetch issue: ${finnhubResult.fetch_error}.`,
    };
  }

  const ingestBreakdown = {
    edgar: workerResult.edgar,
    newsapi: workerResult.newsapi,
    gnews: workerResult.gnews,
    finnhub: finnhubResult,
    ingest_status: workerResult.ingest_status,
    ingest_detail: workerResult.ingest_detail,
    total_inserted: workerResult.total_inserted + finnhubResult.inserted,
  };

  if (workerResult.error && workerResult.ingest_status === undefined) {
    return Response.json({
      portfolioId,
      tickers: globalTickers,
      lookbackHours,
      stages,
      ingestBreakdown,
      workerChecks: workerResult.checks ?? null,
      totalInserted: finnhubResult.inserted,
      enriched: 0,
      analysisRunId: null,
    }, { status: 502 });
  }

  if (workerResult.ingest_status === "failed") {
    return Response.json({
      portfolioId,
      tickers: globalTickers,
      lookbackHours,
      stages,
      ingestBreakdown,
      workerChecks: workerResult.checks ?? null,
      totalInserted: workerResult.total_inserted + finnhubResult.inserted,
      enriched: 0,
      analysisRunId: null,
    }, { status: 502 });
  }

  let enriched = 0;
  const totalInserted = workerResult.total_inserted + finnhubResult.inserted;

  const insertedArticleIds: string[] = [];
  for (const key of ["edgar", "newsapi", "gnews"] as const) {
    const ids = workerResult[key]?.inserted_ids;
    if (Array.isArray(ids)) insertedArticleIds.push(...ids);
  }
  if (Array.isArray(finnhubResult.inserted_ids)) {
    insertedArticleIds.push(...finnhubResult.inserted_ids);
  }

  let extractionStats: {
    queued: number;
    attempted: number;
    extracted: number;
    failed: number;
    skippedMissingUrl: number;
    skippedUnsupportedSource: number;
    skippedAlreadyExtracted: number;
    skippedUnsupportedUrl: number;
    background: boolean;
  } | null = null;

  if (insertedArticleIds.length > 0) {
    const extractResult = await extractPublisherContent(supabase, {
      articleIds: insertedArticleIds,
    });
    extractionStats = {
      queued: extractResult.queued,
      attempted: extractResult.attempted,
      extracted: extractResult.extracted,
      failed: extractResult.failed,
      skippedMissingUrl: extractResult.skippedMissingUrl,
      skippedUnsupportedSource: extractResult.skippedUnsupportedSource,
      skippedAlreadyExtracted: extractResult.skippedAlreadyExtracted,
      skippedUnsupportedUrl: extractResult.skippedUnsupportedUrl,
      background: extractResult.background,
    };

    if (extractResult.queued > 0) {
      const skipParts: string[] = [];
      if (extractResult.skippedMissingUrl > 0)
        skipParts.push(`${extractResult.skippedMissingUrl} missing URLs`);
      if (extractResult.skippedUnsupportedSource > 0)
        skipParts.push(`${extractResult.skippedUnsupportedSource} unsupported sources`);
      if (extractResult.skippedAlreadyExtracted > 0)
        skipParts.push(`${extractResult.skippedAlreadyExtracted} already extracted`);
      if (extractResult.skippedUnsupportedUrl > 0)
        skipParts.push(`${extractResult.skippedUnsupportedUrl} unsupported URLs`);
      const skipSuffix = skipParts.length > 0 ? ` (skipped: ${skipParts.join(", ")})` : "";
      stages.extraction = {
        status: "queued",
        detail: `${extractResult.queued}/${insertedArticleIds.length} article(s) queued for background extraction${skipSuffix}. Enrichment uses headlines/snippets until text arrives.`,
      };
    } else if (extractResult.failed > 0 && extractResult.errors.length > 0) {
      stages.extraction = {
        status: "partial",
        detail: extractResult.errors.slice(0, 2).join("; "),
      };
    } else {
      const reasons: string[] = [];
      if (extractResult.skippedMissingUrl > 0)
        reasons.push(`${extractResult.skippedMissingUrl} missing URLs`);
      if (extractResult.skippedUnsupportedSource > 0)
        reasons.push(`${extractResult.skippedUnsupportedSource} unsupported sources`);
      if (extractResult.skippedAlreadyExtracted > 0)
        reasons.push(`${extractResult.skippedAlreadyExtracted} already extracted`);
      if (extractResult.skippedUnsupportedUrl > 0)
        reasons.push(`${extractResult.skippedUnsupportedUrl} unsupported URLs`);
      const detail = reasons.length > 0
        ? `0 extracted: ${reasons.join(", ")}`
        : "No extractable articles in this batch";
      stages.extraction = { status: "skipped", detail };
    }

    const enrichResult = await ingestNewsToSupabase(supabase, {
      sourceTypes: [...ENRICHABLE_SOURCE_TYPES],
      limit: totalInserted + 5,
    });

    if (enrichResult.error) {
      stages.enrichment = { status: "failed", detail: enrichResult.error };
    } else {
      enriched = enrichResult.enriched;
      stages.enrichment = {
        status: "success",
        detail: `${enriched} articles enriched`,
      };
    }
  } else {
    stages.extraction = { status: "skipped", detail: "No new articles to extract" };
    stages.enrichment = {
      status: "skipped",
      detail: "No new articles to enrich",
    };
  }

  const poolSnap = await getNewsPoolSnapshot24h(supabase);
  const poolSnapshot = poolSnap.snapshot;

  if (stages.ingest?.status === "empty" && poolSnapshot.poolCount24h > 0) {
    stages.ingest = {
      status: "success",
      detail:
        "No new articles fetched this run; the 24-hour news pool still has articles from earlier ingests.",
    };
  }

  const analysisResult = await runAnalysis(supabase, portfolioId);

  if (analysisResult.error) {
    stages.analysis = { status: "failed", detail: analysisResult.error };
  } else {
    stages.analysis = {
      status: "success",
      detail: `Analysis run ${analysisResult.runId} complete`,
    };
  }

  const httpFailed =
    stages.enrichment?.status === "failed" || stages.analysis?.status === "failed";
  const httpStatus = httpFailed ? 207 : 200;

  return Response.json({
    portfolioId,
    tickers: globalTickers,
    lookbackHours,
    stages,
    ingestBreakdown,
    totalInserted,
    enriched,
    extractionStats,
    analysisRunId: analysisResult.runId,
    poolSnapshot,
    poolSnapshotError: poolSnap.error ?? null,
    analysisMeta: analysisResult.meta ?? null,
  }, { status: httpStatus });
}
