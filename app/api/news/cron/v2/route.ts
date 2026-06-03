/**
 * Candidate-pipeline cron finalize endpoint.
 *
 * Mirrors /api/news/cron but accepts the candidate provider set
 * (edgar + newsapi_ai + gnews + newscatcher) and uses a dedicated
 * NEWS_V2_CRON_SECRET for auth so the two pipelines stay independent.
 */
import type { SourceStats } from "@/lib/ingest-detail";
import { createLogger } from "@/lib/logger";

const log = createLogger("cron-v2");

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type CandidateSourceKey = "edgar" | "newsapi_ai" | "gnews" | "newscatcher";

type CandidateSourceRow = SourceStats & {
  inserted_ids?: string[];
};

interface CandidatePayload {
  tickers: string[];
  lookbackHours: number;
  maxArticles: number;
  providerSet: "candidate";
  ingest_status?: string;
  ingest_detail?: string;
  edgar: CandidateSourceRow;
  newsapi_ai: CandidateSourceRow;
  gnews: CandidateSourceRow;
  newscatcher: CandidateSourceRow;
  total_inserted: number;
  inserted_article_ids: string[];
}

/* ------------------------------------------------------------------ */
/*  Validators                                                         */
/* ------------------------------------------------------------------ */

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

function isSourceRow(value: unknown): value is CandidateSourceRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.fetched === "number" &&
    typeof row.inserted === "number" &&
    typeof row.skipped === "number" &&
    typeof row.failed === "number"
  );
}

function isPayload(value: unknown): value is CandidatePayload {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  return (
    Array.isArray(body.tickers) &&
    typeof body.lookbackHours === "number" &&
    body.lookbackHours >= 1 &&
    body.lookbackHours <= 168 &&
    Number.isFinite(body.lookbackHours) &&
    typeof body.maxArticles === "number" &&
    body.maxArticles >= 1 &&
    body.maxArticles <= 500 &&
    Number.isFinite(body.maxArticles) &&
    typeof body.total_inserted === "number" &&
    Array.isArray(body.inserted_article_ids) &&
    (body.tickers as unknown[]).every(
      (t) => typeof t === "string" && /^[A-Z0-9.\-]{1,10}$/.test(t),
    ) &&
    isSourceRow(body.edgar) &&
    isSourceRow(body.newsapi_ai) &&
    isSourceRow(body.gnews) &&
    isSourceRow(body.newscatcher)
  );
}

function dedupeArticleIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))].sort();
}

/* ------------------------------------------------------------------ */
/*  Source label mapping (candidate set only)                          */
/* ------------------------------------------------------------------ */

const CANDIDATE_LABELS: Record<CandidateSourceKey, string> = {
  edgar: "EDGAR",
  newsapi_ai: "NewsAPI.ai",
  gnews: "GNews",
  newscatcher: "NewsCatcher",
};

function buildIngestDetail(payload: CandidatePayload): string {
  const keys: CandidateSourceKey[] = [
    "edgar",
    "newsapi_ai",
    "gnews",
    "newscatcher",
  ];
  const parts = keys.map((key) => {
    const row = payload[key];
    return `${CANDIDATE_LABELS[key]}: ${row.inserted} inserted, ${row.skipped} skipped, ${row.failed} failed (${row.fetched} fetched)`;
  });
  return parts.join("; ");
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

async function runFinalize(request: Request) {
  const startedAt = Date.now();
  const secret = process.env.NEWS_V2_CRON_SECRET;
  if (!secret) {
    return json({ error: "NEWS_V2_CRON_SECRET not configured" }, 500);
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
    return json({ error: "Invalid candidate cron payload" }, 400);
  }

  const payload = body;
  const insertedArticleIds = dedupeArticleIds(payload.inserted_article_ids);
  const shouldEnrich = insertedArticleIds.length > 0;

  log.info("Candidate cron finalize started", {
    tickers: payload.tickers.length,
    totalInserted: payload.total_inserted,
    articleIds: insertedArticleIds.length,
    shouldEnrich,
  });

  const ingestDetail = buildIngestDetail(payload);

  log.info("Candidate cron finalize completed", {
    durationMs: Date.now() - startedAt,
    inserted: {
      edgar: payload.edgar.inserted,
      newsapi_ai: payload.newsapi_ai.inserted,
      gnews: payload.gnews.inserted,
      newscatcher: payload.newscatcher.inserted,
      total: payload.total_inserted,
    },
    shouldEnrich,
  });

  return json({
    providerSet: "candidate",
    tickerCount: payload.tickers.length,
    lookbackHours: payload.lookbackHours,
    maxArticles: payload.maxArticles,
    ingest: {
      status: payload.ingest_status ?? "success",
      detail: payload.ingest_detail ?? ingestDetail,
    },
    ingestBreakdown: {
      edgar: payload.edgar,
      newsapi_ai: payload.newsapi_ai,
      gnews: payload.gnews,
      newscatcher: payload.newscatcher,
      total_inserted: payload.total_inserted,
    },
    totalInserted: payload.total_inserted,
    insertedArticleIds,
    shouldEnrich,
  });
}

/* ------------------------------------------------------------------ */
/*  Route exports                                                      */
/* ------------------------------------------------------------------ */

export async function GET() {
  return json(
    {
      error:
        "Use POST /api/news/cron/v2 with the candidate ingest payload.",
    },
    405,
  );
}

export async function POST(request: Request) {
  return runFinalize(request);
}
