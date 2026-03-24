import { createServiceClient } from "@/lib/supabase/service";
import { ingestNewsToSupabase } from "@/lib/services/news";
import { runAnalysis } from "@/lib/services/analysis";
import { formatIngestStage, type IngestInput, type SourceStats } from "@/lib/ingest-detail";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron");

const ANALYSIS_COOLDOWN_MS = 15 * 60 * 1000;

type CronSourceKey = "edgar" | "newsapi" | "gnews" | "finnhub";

type CronSourceRow = SourceStats & {
  inserted_ids?: string[];
};

interface CronFinalizePayload extends IngestInput {
  tickers: string[];
  lookbackHours: number;
  maxArticles: number;
  edgar: CronSourceRow;
  newsapi: CronSourceRow;
  gnews: CronSourceRow;
  finnhub: CronSourceRow;
  inserted_article_ids: string[];
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function isSourceRow(value: unknown): value is CronSourceRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.fetched === "number"
    && typeof row.inserted === "number"
    && typeof row.skipped === "number"
    && typeof row.failed === "number";
}

function isPayload(value: unknown): value is CronFinalizePayload {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return Array.isArray(body.tickers)
    && typeof body.lookbackHours === "number"
    && typeof body.maxArticles === "number"
    && typeof body.total_inserted === "number"
    && Array.isArray(body.inserted_article_ids)
    && isSourceRow(body.edgar)
    && isSourceRow(body.newsapi)
    && isSourceRow(body.gnews)
    && isSourceRow(body.finnhub);
}

function dedupeArticleIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))].sort();
}

async function runFinalize(request: Request) {
  const startedAt = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ error: "CRON_SECRET not configured" }, 500);
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!isPayload(body)) {
    return json({ error: "Invalid cron payload" }, 400);
  }

  const payload = body;
  const supabase = createServiceClient();
  const insertedArticleIds = dedupeArticleIds(payload.inserted_article_ids);

  log.info("Cron finalize started", {
    tickers: payload.tickers.length,
    totalInserted: payload.total_inserted,
    articleIds: insertedArticleIds.length,
  });

  let enriched = 0;
  let enrichError: string | undefined;
  if (insertedArticleIds.length > 0) {
    const enrichResult = await ingestNewsToSupabase(supabase, {
      articleIds: insertedArticleIds,
    });
    enriched = enrichResult.enriched;
    enrichError = enrichResult.error;
  }

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

  for (const portfolio of portfolios ?? []) {
    try {
      const { data: latestRun } = await supabase
        .from("analysis_runs")
        .select("completed_at")
        .eq("portfolio_id", portfolio.id)
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestRun?.completed_at) {
        const elapsed = Date.now() - new Date(latestRun.completed_at).getTime();
        if (elapsed < ANALYSIS_COOLDOWN_MS) {
          analysisResults.push({
            portfolioId: portfolio.id,
            runId: null,
            feedItemsCreated: 0,
            error: null,
            skipped: true,
          });
          continue;
        }
      }

      const result = await runAnalysis(supabase, portfolio.id);
      analysisResults.push({
        portfolioId: portfolio.id,
        runId: result.runId,
        feedItemsCreated: result.meta?.feedItemsCreated ?? 0,
        error: result.error,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("Analysis failed for portfolio", {
        portfolioId: portfolio.id,
        error: message,
      });
      analysisResults.push({
        portfolioId: portfolio.id,
        runId: null,
        feedItemsCreated: 0,
        error: message,
      });
    }
  }

  const analysisProcessed = analysisResults.filter((result) => !result.skipped && !result.error).length;
  const analysisErrors = analysisResults
    .filter((result) => result.error)
    .map((result) => ({ portfolioId: result.portfolioId, error: result.error }));
  const analysisSkipped = analysisResults.filter((result) => result.skipped).length;

  const ingestInput: IngestInput = {
    ingest_status: payload.ingest_status,
    ingest_detail: payload.ingest_detail,
    edgar: payload.edgar,
    newsapi: payload.newsapi,
    gnews: payload.gnews,
    total_inserted: payload.total_inserted,
  };
  const ingestStage = formatIngestStage(ingestInput);

  log.info("Cron finalize completed", {
    durationMs: Date.now() - startedAt,
    inserted: {
      edgar: payload.edgar.inserted,
      newsapi: payload.newsapi.inserted,
      gnews: payload.gnews.inserted,
      finnhub: payload.finnhub.inserted,
      total: payload.total_inserted,
    },
    enriched,
    analysis: {
      processed: analysisProcessed,
      skipped: analysisSkipped,
      errors: analysisErrors.length,
    },
  });

  return json({
    tickers: payload.tickers,
    lookbackHours: payload.lookbackHours,
    maxArticles: payload.maxArticles,
    ingest: ingestStage,
    ingestBreakdown: {
      edgar: payload.edgar,
      newsapi: payload.newsapi,
      gnews: payload.gnews,
      finnhub: payload.finnhub,
      total_inserted: payload.total_inserted,
    },
    totalInserted: payload.total_inserted,
    insertedArticleIds,
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

export async function GET() {
  return json(
    { error: "Use POST /api/news/cron with the GitHub ingest payload." },
    405,
  );
}

export async function POST(request: Request) {
  return runFinalize(request);
}

