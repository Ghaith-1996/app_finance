import { createServiceClient } from "@/lib/supabase/service";
import { resolveGlobalTickers } from "@/lib/services/ticker-resolver";
import { runPythonWorker } from "@/lib/services/news/worker";
import { ingestNewsToSupabase, extractPublisherContent } from "@/lib/services/news";
import { formatIngestStage } from "@/lib/ingest-detail";
import { ENRICHABLE_SOURCE_TYPES } from "@/lib/services/news/source-config";

/**
 * POST /api/news/cron
 *
 * Unattended ingestion: EDGAR (global tickers) + NewsAPI/GNews (global headlines).
 * Secured by CRON_SECRET. Does not run analysis or create feed_items.
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
    }, { status: 502 });
  }

  let enriched = 0;
  let enrichError: string | undefined;
  if (workerResult.total_inserted > 0) {
    await extractPublisherContent(supabase, {
      limit: workerResult.total_inserted + 10,
    });

    const enrichResult = await ingestNewsToSupabase(supabase, {
      sourceTypes: [...ENRICHABLE_SOURCE_TYPES],
      limit: workerResult.total_inserted + 10,
    });
    enriched = enrichResult.enriched;
    enrichError = enrichResult.error;
  }

  return Response.json({
    tickers,
    lookbackHours,
    ingest: ingestStage,
    ingestBreakdown: {
      edgar: workerResult.edgar,
      newsapi: workerResult.newsapi,
      gnews: workerResult.gnews,
      total_inserted: workerResult.total_inserted,
    },
    totalInserted: workerResult.total_inserted,
    enriched,
    enrichError: enrichError ?? null,
  });
}
