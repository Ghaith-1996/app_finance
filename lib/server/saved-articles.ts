import "server-only";

import { isAdminUser } from "@/lib/security/admin";
import { sanitizeExternalUrl } from "@/lib/security/external-url";
import { createClient } from "@/lib/supabase/server";
import type { NewsCategory, NewsSourceType, StockEffect, TickerImpact } from "@/lib/types";

type SavedArticleRow = {
  id: string;
  saved_at: string;
  news_items: {
    id: string;
    headline: string;
    source: string;
    url: string | null;
    published_at: string;
    category: string | null;
    stock_tags: string[] | null;
    global_summary: string | null;
    overall_effect: string | null;
    ticker_impacts: TickerImpact[] | null;
    source_type: string | null;
  } | null;
};

export type SavedArticleItem = {
  id: string;
  savedAt: string;
  newsItemId: string;
  headline: string;
  source: string;
  url: string | null;
  publishedAt: string;
  category: NewsCategory;
  stockTags: string[];
  summary: string;
  effect: StockEffect;
  tickerImpacts: TickerImpact[];
  sourceType: NewsSourceType;
};

export async function loadSavedArticlesPageData(): Promise<{
  showOnboardingNav: boolean;
  showAdminLink: boolean;
  articles: SavedArticleItem[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { showOnboardingNav: true, showAdminLink: false, articles: [] };
  }

  const [portfolioResult, savedResult] = await Promise.all([
    supabase
      .from("portfolios")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("user_saved_articles")
      .select(
        `
        id,
        saved_at,
        news_items (
          id,
          headline,
          source,
          url,
          published_at,
          category,
          stock_tags,
          global_summary,
          overall_effect,
          ticker_impacts,
          source_type
        )
      `,
      )
      .eq("user_id", user.id)
      .order("saved_at", { ascending: false })
      .limit(100),
  ]);

  const articles = ((savedResult.data ?? []) as unknown as SavedArticleRow[])
    .map<SavedArticleItem | null>((row) => {
      const news = Array.isArray(row.news_items) ? row.news_items[0] : row.news_items;
      if (!news?.id) return null;

      return {
        id: row.id,
        savedAt: row.saved_at,
        newsItemId: news.id,
        headline: news.headline,
        source: news.source,
        url: sanitizeExternalUrl(news.url),
        publishedAt: news.published_at,
        category: ((news.category ?? "other") as NewsCategory),
        stockTags: news.stock_tags ?? [],
        summary: news.global_summary ?? "",
        effect: ((news.overall_effect ?? "neutral") as StockEffect),
        tickerImpacts: news.ticker_impacts ?? [],
        sourceType: ((news.source_type ?? "other") as NewsSourceType),
      };
    })
    .filter((item): item is SavedArticleItem => item !== null);

  return {
    showOnboardingNav: (portfolioResult.count ?? 0) === 0,
    showAdminLink: isAdminUser(user),
    articles,
  };
}
