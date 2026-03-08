import type { INewsProvider, RawNewsItem, FetchNewsOptions } from "./types";

interface MarketAuxArticle {
  uuid: string;
  title: string;
  description: string;
  snippet: string;
  url: string;
  source: string;
  published_at: string;
  entities?: Array<{
    symbol: string;
    name: string;
    industry: string;
    sentiment_score: number;
  }>;
}

interface MarketAuxResponse {
  meta: { found: number; returned: number; limit: number; page: number };
  data: MarketAuxArticle[];
}

function deriveAngle(article: MarketAuxArticle): string {
  const entities = article.entities ?? [];
  if (entities.length === 0) return "General market";
  const avgSentiment =
    entities.reduce((s, e) => s + e.sentiment_score, 0) / entities.length;
  if (avgSentiment > 0.3) return "Positive catalyst";
  if (avgSentiment < -0.3) return "Risk signal";
  return "Market update";
}

export function createMarketAuxProvider(): INewsProvider {
  const key = process.env.MARKETAUX_API_KEY;
  if (!key) {
    throw new Error(
      "MARKETAUX_API_KEY is required when NEWS_PROVIDER=marketaux"
    );
  }

  return {
    id: "marketaux",

    async fetch(options?: FetchNewsOptions): Promise<RawNewsItem[]> {
      const params = new URLSearchParams({
        api_token: key,
        language: "en",
        filter_entities: "true",
        must_have_entities: "true",
        limit: String(options?.limit ?? 10),
      });

      if (options?.tickers?.length) {
        params.set("symbols", options.tickers.join(","));
      }

      if (options?.since) {
        params.set(
          "published_after",
          options.since.toISOString().replace(/\.\d{3}Z$/, "")
        );
      }

      const url = `https://api.marketaux.com/v1/news/all?${params.toString()}`;
      const res = await fetch(url);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `MarketAux API error ${res.status}: ${text.slice(0, 200)}`
        );
      }

      const json = (await res.json()) as MarketAuxResponse;

      return (json.data ?? []).map((article) => ({
        headline: article.title,
        source: article.source,
        url: article.url,
        publishedAt: new Date(article.published_at),
        angle: deriveAngle(article),
        rawContent: article.snippet || article.description || undefined,
      }));
    },
  };
}
