import type { INewsProvider, RawNewsItem } from "./types";
import { seedNewsProvider } from "./seed-provider";
import { createMarketAuxProvider } from "./marketaux-provider";

function getProvider(): INewsProvider {
  const id = (process.env.NEWS_PROVIDER ?? "seed").toLowerCase();
  if (id === "marketaux") {
    return createMarketAuxProvider();
  }
  return seedNewsProvider;
}

export type { INewsProvider, RawNewsItem, FetchNewsOptions, NewsProviderId } from "./types";
export { seedNewsProvider } from "./seed-provider";

/**
 * Fetch news from the configured provider (seed, marketaux, finnhub).
 * Default is seed so the app works without an API key.
 */
export async function fetchNews(
  options?: { tickers?: string[]; limit?: number; since?: Date }
): Promise<RawNewsItem[]> {
  const provider = getProvider();
  return provider.fetch(options);
}
