export const INGEST_SOURCE_KEYS = ["edgar", "newsapi", "gnews"] as const;

export type IngestSourceKey = (typeof INGEST_SOURCE_KEYS)[number];

export const INGEST_SOURCE_LABELS: Record<IngestSourceKey, string> = {
  edgar: "EDGAR",
  newsapi: "NewsAPI",
  gnews: "GNews",
};

export const ENRICHABLE_SOURCE_TYPES = [...INGEST_SOURCE_KEYS] as const;

export const MARKET_HEADLINE_SOURCE_TYPES = ["newsapi", "gnews", "finnhub", "marketaux"] as const;

export function isMarketHeadlineSource(
  sourceType: string | null | undefined,
): boolean {
  if (!sourceType) return false;
  return (MARKET_HEADLINE_SOURCE_TYPES as readonly string[]).includes(sourceType);
}
