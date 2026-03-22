/**
 * News service public surface.
 *
 * Ingestion is handled by the Python worker at workers/news_ingestion/
 * (EDGAR + global headline sources). This module exports shared types and
 * Node-side AI enrichment.
 */

export type {
  INewsProvider,
  RawNewsItem,
  FetchNewsOptions,
  NewsProviderId,
  NewsSourceType,
} from "./types";

export { ingestNewsToSupabase } from "./ingest";
export {
  getNewsPoolSnapshot24h,
  newsWindowCutoffIso,
  type NewsPoolSnapshot24h,
} from "./pool-snapshot";
