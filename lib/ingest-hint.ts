/**
 * Client-only snapshot of the last news refresh so the feed empty state can
 * distinguish "no articles in lookback" from ingestion / source failures.
 */

export const LAST_INGEST_STORAGE_KEY = "app_finance_last_ingest";

export interface IngestSourceSnapshot {
  fetched?: number;
  inserted?: number;
  skipped?: number;
  failed?: number;
  fetch_outcome?: string;
  fetch_error?: string | null;
  fetch_warnings?: string[];
}

export type LastIngestSnapshot = {
  at: number;
  lookbackHours?: number;
  ingest?: { status: string; detail?: string };
  breakdown?: {
    edgar?: IngestSourceSnapshot;
    newsapi?: IngestSourceSnapshot;
    gnews?: IngestSourceSnapshot;
    finnhub?: IngestSourceSnapshot;
    ingest_status?: string;
    ingest_detail?: string;
    total_inserted?: number;
  };
};

export function readLastIngestSnapshot(): LastIngestSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LAST_INGEST_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LastIngestSnapshot;
  } catch {
    return null;
  }
}

export function writeLastIngestSnapshot(data: LastIngestSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LAST_INGEST_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota */
  }
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isRecentIngestHint(
  hint: LastIngestSnapshot | null,
): hint is LastIngestSnapshot {
  if (!hint?.at) return false;
  return Date.now() - hint.at < MAX_AGE_MS;
}
