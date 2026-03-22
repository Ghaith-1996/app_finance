import type { SupabaseClient } from "@supabase/supabase-js";

/** Rolling window aligned with analysis / market feed (24h). */
export function newsWindowCutoffIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

export interface NewsPoolSnapshot24h {
  /** Total `news_items` rows with `published_at` in the last 24 hours. */
  poolCount24h: number;
  /** Newest `published_at` in that window, or null if none. */
  latestPublishedAt24h: string | null;
  /** Optional counts by `source_type` for the same window. */
  bySource?: Record<string, number>;
}

/**
 * Current stored 24-hour news pool (not tied to any single fetch attempt).
 */
export async function getNewsPoolSnapshot24h(
  supabase: SupabaseClient,
): Promise<{ snapshot: NewsPoolSnapshot24h; error?: string }> {
  const cutoff = newsWindowCutoffIso();

  const { count, error: countError } = await supabase
    .from("news_items")
    .select("*", { count: "exact", head: true })
    .gte("published_at", cutoff);

  if (countError) {
    return {
      snapshot: { poolCount24h: 0, latestPublishedAt24h: null },
      error: countError.message,
    };
  }

  const { data: latestRow, error: latestError } = await supabase
    .from("news_items")
    .select("published_at")
    .gte("published_at", cutoff)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    return {
      snapshot: { poolCount24h: count ?? 0, latestPublishedAt24h: null },
      error: latestError.message,
    };
  }

  const bySource: Record<string, number> = {};
  const sourceTypes = ["edgar", "newsapi", "gnews", "finnhub", "yfinance", "marketaux", "seed", "other"];
  for (const st of sourceTypes) {
    const { count: c } = await supabase
      .from("news_items")
      .select("*", { count: "exact", head: true })
      .eq("source_type", st)
      .gte("published_at", cutoff);
    if (c && c > 0) bySource[st] = c;
  }

  return {
    snapshot: {
      poolCount24h: count ?? 0,
      latestPublishedAt24h: (latestRow?.published_at as string | undefined) ?? null,
      ...(Object.keys(bySource).length > 0 ? { bySource } : {}),
    },
  };
}
