export type NewsProviderId = "seed" | "marketaux" | "finnhub";

export interface RawNewsItem {
  headline: string;
  source: string;
  url?: string;
  publishedAt: Date;
  angle?: string;
  rawContent?: string;
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
