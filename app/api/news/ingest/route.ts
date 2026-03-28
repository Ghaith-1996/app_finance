import { createServiceClient } from "@/lib/supabase/service";
import { ingestNewsToSupabase, extractPublisherContent } from "@/lib/services/news";
import { ENRICHABLE_SOURCE_TYPES } from "@/lib/services/news/source-config";
import { runPythonWorker, type WorkerResult } from "@/lib/services/news/worker";
import { resolveGlobalTickers } from "@/lib/services/ticker-resolver";
import { requireAdminRouteAccess } from "@/lib/security/admin";

/**
 * POST /api/news/ingest
 *
 * @deprecated Retained for admin/debug use only. Production ingestion now
 * runs automatically via the 20-minute cron job (POST /api/news/cron).
 *
 * Body (JSON, optional): { lookbackHours?, maxArticles? }
 *
 * Uses the global ticker universe plus global headline sources via the Python worker, then AI enrichment.
 */
export async function POST(request: Request) {
  const { supabase, errorResponse } = await requireAdminRouteAccess();
  if (errorResponse) return errorResponse;

  let body: { lookbackHours?: number; maxArticles?: number } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text);
  } catch {
    /* empty */
  }

  const lookbackHours = Math.max(1, Math.min(body.lookbackHours ?? 24, 168));
  const maxArticles = Math.max(1, Math.min(body.maxArticles ?? 20, 100));

  const serviceSupabase = createServiceClient();
  const { tickers, error: tickerError } = await resolveGlobalTickers(serviceSupabase);

  if (tickerError) {
    return Response.json(
      { error: tickerError, tickers: [], totalInserted: 0, enriched: 0 },
      { status: 500 },
    );
  }

  const workerResult: WorkerResult = await runPythonWorker(tickers, lookbackHours, maxArticles);

  const ingestBreakdown = {
    edgar: workerResult.edgar,
    newsapi: workerResult.newsapi,
    gnews: workerResult.gnews,
    ingest_status: workerResult.ingest_status,
    ingest_detail: workerResult.ingest_detail,
    total_inserted: workerResult.total_inserted,
  };

  if (workerResult.error && workerResult.ingest_status === undefined) {
    return Response.json({
      tickers,
      lookbackHours,
      ingestBreakdown,
      sources: {
        edgar: workerResult.edgar,
        newsapi: workerResult.newsapi,
        gnews: workerResult.gnews,
      },
      totalInserted: 0,
      enriched: 0,
      workerError: workerResult.error,
      workerChecks: workerResult.checks ?? null,
      enrichmentError: null,
    }, { status: 502 });
  }

  if (workerResult.ingest_status === "failed") {
    return Response.json({
      tickers,
      lookbackHours,
      ingestBreakdown,
      sources: {
        edgar: workerResult.edgar,
        newsapi: workerResult.newsapi,
        gnews: workerResult.gnews,
      },
      totalInserted: workerResult.total_inserted,
      enriched: 0,
      workerError: workerResult.error ?? null,
      workerChecks: workerResult.checks ?? null,
      enrichmentError: null,
    }, { status: 502 });
  }

  const insertedArticleIds: string[] = [];
  for (const key of ["edgar", "newsapi", "gnews"] as const) {
    const ids = workerResult[key]?.inserted_ids;
    if (Array.isArray(ids)) insertedArticleIds.push(...ids);
  }

  let extractionQueued = 0;
  if (insertedArticleIds.length > 0) {
    const ex = await extractPublisherContent(supabase, {
      articleIds: insertedArticleIds,
    });
    extractionQueued = ex.queued;
  }

  const enrichmentResult = workerResult.total_inserted > 0
    ? await ingestNewsToSupabase(supabase, {
        sourceTypes: [...ENRICHABLE_SOURCE_TYPES],
        limit: workerResult.total_inserted + 5,
      })
    : { enriched: 0, skipped: 0, error: undefined };

  const httpStatus = enrichmentResult.error ? 207 : 200;

  return Response.json({
    tickers,
    lookbackHours,
    ingestBreakdown,
    sources: {
      edgar: workerResult.edgar,
      newsapi: workerResult.newsapi,
      gnews: workerResult.gnews,
    },
    totalInserted: workerResult.total_inserted,
    enriched: enrichmentResult.enriched,
    ingest_status: workerResult.ingest_status,
    ingest_detail: workerResult.ingest_detail,
    workerError: workerResult.error ?? null,
    workerChecks: workerResult.checks ?? null,
    enrichmentError: enrichmentResult.error ?? null,
    extractionQueued,
  }, { status: httpStatus });
}
