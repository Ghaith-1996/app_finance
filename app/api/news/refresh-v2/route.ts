import { createServiceClient } from "@/lib/supabase/service";
import { ingestNewsToSupabase, extractPublisherContent } from "@/lib/services/news";
import { runAnalysis } from "@/lib/services/analysis";
import {
  CANDIDATE_INGEST_SOURCE_KEYS,
  CANDIDATE_INGEST_SOURCE_LABELS,
  ENRICHABLE_SOURCE_TYPES,
  type CandidateIngestSourceKey,
} from "@/lib/services/news/source-config";
import { runPythonWorkerV2, type CandidateWorkerResult } from "@/lib/services/news/worker";
import { resolveGlobalTickers } from "@/lib/services/ticker-resolver";
import { buildPortfolioQueries } from "@/lib/services/news/portfolio-queries";
import { getNewsPoolSnapshot24h } from "@/lib/services/news/pool-snapshot";
import { requireAdminRouteAccess } from "@/lib/security/admin";

/**
 * POST /api/news/refresh-v2
 *
 * Admin-only manual refresh using the **candidate** provider set
 * (edgar + newsapi_ai + gnews + newscatcher). Mirrors the current
 * `/api/news/refresh` route but uses `runPythonWorkerV2` and
 * portfolio keyword queries instead of Finnhub targeted news.
 */
export async function POST(request: Request) {
  const { supabase, user, errorResponse } = await requireAdminRouteAccess();
  if (errorResponse) return errorResponse;
  const adminUser = user!;

  let body: { portfolioId?: string; lookbackHours?: number; maxArticles?: number } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch { /* empty body is fine */ }

  const lookbackHours = Math.max(1, Math.min(body.lookbackHours ?? 24, 168));
  const maxArticles = Math.max(1, Math.min(body.maxArticles ?? 20, 100));

  // ---------- resolve portfolio ----------

  let portfolioId = body.portfolioId ?? null;
  if (!portfolioId) {
    const { data: portfolios } = await supabase
      .from("portfolios")
      .select("id")
      .eq("user_id", adminUser.id)
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
    .eq("user_id", adminUser.id)
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

  // ---------- resolve tickers + queries ----------

  const serviceSupabase = createServiceClient();
  const { tickers: globalTickers, error: tickerError } = await resolveGlobalTickers(serviceSupabase);

  if (tickerError) {
    return Response.json(
      { error: "ticker_resolution_failed", message: tickerError },
      { status: 500 },
    );
  }

  const portfolioQueries = buildPortfolioQueries(holdingsRows ?? []);

  // ---------- run candidate worker ----------

  type StageStatus = "success" | "failed" | "skipped" | "partial" | "empty" | "queued";
  const stages: Record<string, { status: StageStatus; detail: string }> = {};

  const workerResult = await runPythonWorkerV2(
    globalTickers,
    lookbackHours,
    maxArticles,
    { queries: portfolioQueries },
  );

  stages.ingest = formatCandidateIngestStage(workerResult);

  const ingestBreakdown: Record<string, unknown> = {};
  for (const key of CANDIDATE_INGEST_SOURCE_KEYS) {
    ingestBreakdown[key] = workerResult[key];
  }
  ingestBreakdown.ingest_status = workerResult.ingest_status;
  ingestBreakdown.ingest_detail = workerResult.ingest_detail;
  ingestBreakdown.total_inserted = workerResult.total_inserted;

  if (workerResult.error && workerResult.ingest_status === undefined) {
    return Response.json({
      portfolioId,
      tickers: globalTickers,
      lookbackHours,
      stages,
      ingestBreakdown,
      workerChecks: workerResult.checks ?? null,
      totalInserted: 0,
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
      totalInserted: workerResult.total_inserted,
      enriched: 0,
      analysisRunId: null,
    }, { status: 502 });
  }

  // ---------- extraction + enrichment ----------

  let enriched = 0;
  const totalInserted = workerResult.total_inserted;

  const insertedArticleIds: string[] = [];
  for (const key of CANDIDATE_INGEST_SOURCE_KEYS) {
    const ids = workerResult[key]?.inserted_ids;
    if (Array.isArray(ids)) insertedArticleIds.push(...ids);
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

  // ---------- pool snapshot ----------

  const poolSnap = await getNewsPoolSnapshot24h(supabase);
  const poolSnapshot = poolSnap.snapshot;

  if (stages.ingest?.status === "empty" && poolSnapshot.poolCount24h > 0) {
    stages.ingest = {
      status: "success",
      detail:
        "No new articles fetched this run; the 24-hour news pool still has articles from earlier ingests.",
    };
  }

  // ---------- analysis ----------

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
    portfolioQueries,
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

/* ------------------------------------------------------------------ */
/*  Lightweight ingest stage formatter for candidate sources           */
/* ------------------------------------------------------------------ */

function sourceLabel(key: string): string {
  return CANDIDATE_INGEST_SOURCE_LABELS[key as CandidateIngestSourceKey] ?? key;
}

function formatCandidateIngestStage(
  result: CandidateWorkerResult,
): { status: "success" | "failed" | "partial" | "empty"; detail: string } {
  if (result.error && result.ingest_status === undefined) {
    return { status: "failed", detail: result.error };
  }

  const st = result.ingest_status;
  if (st === "failed") {
    return { status: "failed", detail: result.ingest_detail ?? result.error ?? "All candidate sources failed." };
  }
  if (st === "partial") {
    return { status: "partial", detail: result.ingest_detail ?? "Some candidate sources failed." };
  }
  if (st === "empty") {
    const labels = CANDIDATE_INGEST_SOURCE_KEYS.map((k) => sourceLabel(k));
    return {
      status: "empty",
      detail: result.ingest_detail ?? `No articles returned by ${labels.join(", ")} in the lookback window.`,
    };
  }
  if (st === "success") {
    return {
      status: "success",
      detail: result.ingest_detail ?? `${result.total_inserted} article(s) inserted from candidate sources.`,
    };
  }

  // Fallback: infer from counts
  if (result.total_inserted > 0) {
    return { status: "success", detail: `${result.total_inserted} article(s) inserted.` };
  }
  return { status: "empty", detail: "No articles returned by candidate sources in the lookback window." };
}
