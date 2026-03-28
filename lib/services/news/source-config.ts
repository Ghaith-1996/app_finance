export const INGEST_SOURCE_KEYS = ["edgar", "newsapi", "gnews"] as const;

export type IngestSourceKey = (typeof INGEST_SOURCE_KEYS)[number];

export const INGEST_SOURCE_LABELS: Record<IngestSourceKey, string> = {
  edgar: "EDGAR",
  newsapi: "NewsAPI",
  gnews: "GNews",
};

/** Candidate provider set (parallel pipeline — Phase 1). */
export const CANDIDATE_INGEST_SOURCE_KEYS = ["edgar", "newsapi_ai", "gnews", "newscatcher"] as const;

export type CandidateIngestSourceKey = (typeof CANDIDATE_INGEST_SOURCE_KEYS)[number];

export const CANDIDATE_INGEST_SOURCE_LABELS: Record<CandidateIngestSourceKey, string> = {
  edgar: "EDGAR",
  newsapi_ai: "NewsAPI.ai",
  gnews: "GNews",
  newscatcher: "NewsCatcher",
};

export const ENRICHABLE_SOURCE_TYPES = [...INGEST_SOURCE_KEYS, "finnhub", "newsapi_ai", "newscatcher"] as const;

export const MARKET_HEADLINE_SOURCE_TYPES = ["newsapi", "gnews", "finnhub", "marketaux", "newsapi_ai", "newscatcher"] as const;

export function isMarketHeadlineSource(
  sourceType: string | null | undefined,
): boolean {
  if (!sourceType) return false;
  return (MARKET_HEADLINE_SOURCE_TYPES as readonly string[]).includes(sourceType);
}
