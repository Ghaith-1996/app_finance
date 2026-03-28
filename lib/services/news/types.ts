export type NewsProviderId = "seed" | "marketaux" | "finnhub";

/** Origin label stored in news_items.source_type. */
export type NewsSourceType =
  | "edgar"
  | "yfinance"
  | "marketaux"
  | "finnhub"
  | "newsapi"
  | "gnews"
  | "newsapi_ai"
  | "newscatcher"
  | "seed"
  | "other";

export interface RawNewsItem {
  headline: string;
  source: string;
  url?: string;
  publishedAt: Date;
  angle?: string;
  rawContent?: string;
  /** Uppercase ticker symbols extracted by the provider (e.g. from MarketAux entities). */
  entityTickers?: string[];
}

export interface FetchNewsOptions {
  tickers?: string[];
  limit?: number;
  since?: Date;
}

export interface INewsProvider {
  readonly id: NewsProviderId;
  fetch(options?: FetchNewsOptions): Promise<RawNewsItem[]>;
}
