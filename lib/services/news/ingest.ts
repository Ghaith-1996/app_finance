import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchNews } from "./index";

/**
 * Fetch news from the configured provider and insert into news_items.
 * Passes tickers to the provider so results are relevant to the user's holdings.
 * Skips duplicates by headline + source + published_at.
 */
export async function ingestNewsToSupabase(
  supabase: SupabaseClient,
  options?: { tickers?: string[] }
): Promise<{ inserted: number; skipped: number; error?: string }> {
  const items = await fetchNews({ tickers: options?.tickers, limit: 20 });
  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const { data: existing } = await supabase
      .from("news_items")
      .select("id")
      .eq("headline", item.headline)
      .eq("source", item.source)
      .eq("published_at", item.publishedAt.toISOString())
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("news_items").insert({
      headline: item.headline,
      source: item.source,
      url: item.url ?? null,
      published_at: item.publishedAt.toISOString(),
      angle: item.angle ?? null,
      raw_content: item.rawContent ?? null,
    });

    if (error) {
      return { inserted, skipped, error: error.message };
    }
    inserted++;
  }

  return { inserted, skipped };
}
