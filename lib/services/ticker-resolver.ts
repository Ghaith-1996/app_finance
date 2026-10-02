import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllRows } from "@/lib/supabase/paginate";

/**
 * Resolve the global ticker universe from all holdings across all portfolios
 * **plus** all watchlist symbols across all users.
 * Used by the unattended market-ingest cron job.
 */
export async function resolveGlobalTickers(
  supabase: SupabaseClient,
): Promise<{ tickers: string[]; error?: string }> {
  // Audit H1: every page, so symbols held beyond the response row cap are still ingested.
  const [holdingsResult, watchlistResult] = await Promise.all([
    fetchAllRows<{ symbol: string | null }>((from, to) =>
      supabase.from("holdings").select("symbol").order("id", { ascending: true }).range(from, to),
    ),
    fetchAllRows<{ symbol: string | null }>((from, to) =>
      supabase.from("watchlist_items").select("symbol").order("id", { ascending: true }).range(from, to),
    ),
  ]);

  if (holdingsResult.error) {
    return { tickers: [], error: holdingsResult.error.message };
  }
  if (watchlistResult.error) {
    return { tickers: [], error: watchlistResult.error.message };
  }

  const symbols: string[] = [];
  for (const row of holdingsResult.data ?? []) {
    if (row.symbol) symbols.push((row.symbol as string).toUpperCase());
  }
  for (const row of watchlistResult.data ?? []) {
    if (row.symbol) symbols.push((row.symbol as string).toUpperCase());
  }

  const tickers = [...new Set(symbols)].sort();
  return { tickers };
}
