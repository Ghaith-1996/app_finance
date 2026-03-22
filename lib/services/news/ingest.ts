import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsCategory } from "@/lib/types";
import { getAIProvider } from "../ai";

/**
 * Run AI enrichment on recently ingested articles that have not yet been
 * classified (global_summary IS NULL).
 *
 * Called after raw articles are upserted from the Python worker (EDGAR +
 * headline sources like NewsAPI and GNews). This function fills in category,
 * global_summary, overall_effect, and ticker_impacts.
 *
 * Source-trust rules:
 * - edgar: provider stock_tags are authoritative (SEC-confirmed tickers).
 * - finnhub: provider stock_tags come from the targeted holding/news relationship and are kept as hints.
 * - newsapi / gnews: usually no provider tickers; AI derives stock_tags from text.
 */
export async function ingestNewsToSupabase(
  supabase: SupabaseClient,
  options?: {
    /** Only enrich articles from these source types. */
    sourceTypes?: string[];
    /** Max articles to enrich in one call (default 20). */
    limit?: number;
  }
): Promise<{ enriched: number; skipped: number; error?: string }> {
  const ai = getAIProvider();

  let query = supabase
    .from("news_items")
    .select("id, headline, source, raw_content, stock_tags, source_type, category_hint")
    .is("global_summary", null)
    .order("published_at", { ascending: false })
    .limit(options?.limit ?? 20);

  if (options?.sourceTypes?.length) {
    query = query.in("source_type", options.sourceTypes);
  }

  const { data: articles, error: fetchError } = await query;

  if (fetchError) {
    return { enriched: 0, skipped: 0, error: fetchError.message };
  }

  let enriched = 0;
  const skipped = 0;

  for (const article of articles ?? []) {
    const providerTags = (article.stock_tags as string[]) ?? [];

    let analysis;
    try {
      analysis = await ai.analyzeArticle(
        article.headline as string,
        article.raw_content as string ?? "",
        providerTags.length > 0 ? providerTags : undefined,
      );
    } catch {
      analysis = {
        category: (article.category_hint ?? "other") as NewsCategory,
        globalSummary:
          (article.raw_content as string | null)?.slice(0, 300) ?? (article.headline as string),
        overallEffect: "neutral" as const,
        stockTags: providerTags,
        tickerImpacts: [],
      };
    }

    // edgar: trust the provider's stock_tags entirely (SEC-confirmed tickers).
    // finnhub/newsapi/gnews: prefer AI tags, fall back to provider hints.
    const finalStockTags =
      article.source_type === "edgar" && providerTags.length > 0
        ? providerTags
        : analysis.stockTags.length > 0
          ? analysis.stockTags
          : providerTags;

    const { error: updateError } = await supabase
      .from("news_items")
      .update({
        category: analysis.category,
        stock_tags: finalStockTags,
        global_summary: analysis.globalSummary,
        overall_effect: analysis.overallEffect,
        ticker_impacts: analysis.tickerImpacts,
      })
      .eq("id", article.id as string);

    if (updateError) {
      return { enriched, skipped, error: updateError.message };
    }

    enriched++;
  }

  return { enriched, skipped };
}
