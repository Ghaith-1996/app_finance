import { formatIngestStage, type IngestInput, type SourceStats } from "@/lib/ingest-detail";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron");

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
    && body.lookbackHours >= 1 && body.lookbackHours <= 168
    && Number.isFinite(body.lookbackHours)
    && typeof body.maxArticles === "number"
    && body.maxArticles >= 1 && body.maxArticles <= 500
    && Number.isFinite(body.maxArticles)
    && typeof body.total_inserted === "number"
    && Array.isArray(body.inserted_article_ids)
    && (body.tickers as unknown[]).every(t => typeof t === "string" && /^[A-Z0-9.\-]{1,10}$/.test(t))
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

  const auth = request.headers.get("authorization") ?? "";
  const { isTimingSafeEqual } = await import("@/lib/security/timing");
  if (!isTimingSafeEqual(auth, `Bearer ${secret}`)) {
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
  const insertedArticleIds = dedupeArticleIds(payload.inserted_article_ids);
  const shouldEnrich = insertedArticleIds.length > 0;

  log.info("Cron finalize started", {
    tickers: payload.tickers.length,
    totalInserted: payload.total_inserted,
    articleIds: insertedArticleIds.length,
    shouldEnrich,
  });

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
    shouldEnrich,
  });

  return json({
    tickerCount: payload.tickers.length,
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
    shouldEnrich,
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
