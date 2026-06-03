import "server-only";

import { isAdminUser } from "@/lib/security/admin";
import { sanitizeExternalUrl } from "@/lib/security/external-url";
import { createClient } from "@/lib/supabase/server";

export type GlobalSearchResult = {
  id: string;
  type: "holding" | "watchlist" | "article" | "saved" | "alert" | "thesis";
  title: string;
  detail: string;
  href: string;
  meta: string;
};

export type GlobalSearchPageData = {
  showOnboardingNav: boolean;
  showAdminLink: boolean;
  query: string;
  results: GlobalSearchResult[];
};

function normalizeQuery(query: string | null | undefined): string {
  return (query ?? "").trim().slice(0, 80);
}

function matchesNeedle(values: Array<string | null | undefined>, needle: string): boolean {
  const lowerNeedle = needle.toLowerCase();
  return values.some((value) => String(value ?? "").toLowerCase().includes(lowerNeedle));
}

function sortResults(results: GlobalSearchResult[], query: string): GlobalSearchResult[] {
  const needle = query.toUpperCase();
  return [...results].sort((left, right) => {
    const leftExact = left.title.toUpperCase() === needle ? 1 : 0;
    const rightExact = right.title.toUpperCase() === needle ? 1 : 0;
    return rightExact - leftExact || left.type.localeCompare(right.type) || left.title.localeCompare(right.title);
  });
}

export async function loadGlobalSearchPageData(
  rawQuery: string | null | undefined,
): Promise<GlobalSearchPageData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const query = normalizeQuery(rawQuery);
  if (!user) {
    return { showOnboardingNav: true, showAdminLink: false, query, results: [] };
  }

  const { count: portfolioCount } = await supabase
    .from("portfolios")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (query.length < 2) {
    return {
      showOnboardingNav: (portfolioCount ?? 0) === 0,
      showAdminLink: isAdminUser(user),
      query,
      results: [],
    };
  }

  const like = `%${query.replace(/[%_]/g, "")}%`;
  const [
    holdingsResult,
    watchlistResult,
    newsResult,
    savedResult,
    alertsResult,
    thesesResult,
  ] = await Promise.all([
    supabase
      .from("holdings")
      .select("id, symbol, company, sector, portfolios!inner(user_id)")
      .eq("portfolios.user_id", user.id)
      .or(`symbol.ilike.${like},company.ilike.${like},sector.ilike.${like}`)
      .limit(8),
    supabase
      .from("watchlist_items")
      .select("id, symbol, company, price, day_change")
      .eq("user_id", user.id)
      .or(`symbol.ilike.${like},company.ilike.${like}`)
      .limit(8),
    supabase
      .from("news_items")
      .select("id, headline, source, url, published_at, stock_tags")
      .or(`headline.ilike.${like},source.ilike.${like}`)
      .order("published_at", { ascending: false })
      .limit(8),
    supabase
      .from("user_saved_articles")
      .select("id, saved_at, news_items(id, headline, source, url, published_at)")
      .eq("user_id", user.id)
      .order("saved_at", { ascending: false })
      .limit(20),
    supabase
      .from("notification_alerts")
      .select("id, title, message, severity, action_href, created_at")
      .eq("user_id", user.id)
      .or(`title.ilike.${like},message.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("user_investment_theses")
      .select("id, symbol, scope, thesis, risks, invalidation_notes, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50),
  ]);

  const results: GlobalSearchResult[] = [];

  for (const row of holdingsResult.data ?? []) {
    results.push({
      id: `holding-${row.id}`,
      type: "holding",
      title: row.symbol,
      detail: row.company,
      href: `/portfolio/full`,
      meta: row.sector ?? "Holding",
    });
  }

  for (const row of watchlistResult.data ?? []) {
    results.push({
      id: `watchlist-${row.id}`,
      type: "watchlist",
      title: row.symbol,
      detail: row.company ?? "Watchlist symbol",
      href: `/watchlist?symbol=${encodeURIComponent(row.symbol)}`,
      meta: row.day_change != null ? `${Number(row.day_change).toFixed(2)}%` : "Watchlist",
    });
  }

  for (const row of newsResult.data ?? []) {
    const tags = ((row.stock_tags as string[] | null) ?? []).join(", ");
    results.push({
      id: `article-${row.id}`,
      type: "article",
      title: row.headline,
      detail: tags || row.source,
      href: `/feed?story=${encodeURIComponent(row.id)}`,
      meta: row.source,
    });
  }

  for (const row of savedResult.data ?? []) {
    const news = Array.isArray(row.news_items) ? row.news_items[0] : row.news_items;
    if (!news || !matchesNeedle([news.headline, news.source], query)) continue;
    results.push({
      id: `saved-${row.id}`,
      type: "saved",
      title: news.headline,
      detail: news.source,
      href: `/feed?story=${encodeURIComponent(news.id)}`,
      meta: "Saved article",
    });
  }

  for (const row of alertsResult.data ?? []) {
    results.push({
      id: `alert-${row.id}`,
      type: "alert",
      title: row.title,
      detail: row.message,
      href: row.action_href || "/alerts",
      meta: row.severity,
    });
  }

  for (const row of thesesResult.data ?? []) {
    const risks = ((row.risks as string[] | null) ?? []).join(" ");
    if (!matchesNeedle([row.symbol, row.thesis, risks, row.invalidation_notes], query)) continue;
    results.push({
      id: `thesis-${row.id}`,
      type: "thesis",
      title: `${row.symbol} thesis`,
      detail: row.thesis || row.invalidation_notes || risks || "Saved thesis",
      href: row.scope === "watchlist" ? `/watchlist?symbol=${encodeURIComponent(row.symbol)}` : "/portfolio/full",
      meta: row.scope,
    });
  }

  return {
    showOnboardingNav: (portfolioCount ?? 0) === 0,
    showAdminLink: isAdminUser(user),
    query,
    results: sortResults(
      results
        .map((result) => ({
          ...result,
          href: result.href.startsWith("http") ? sanitizeExternalUrl(result.href) ?? "/search" : result.href,
        }))
        .slice(0, 36),
      query,
    ),
  };
}
