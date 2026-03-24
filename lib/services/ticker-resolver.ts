import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the global ticker universe from all holdings across all portfolios
 * **plus** all watchlist symbols across all users.
 * Used by the unattended market-ingest cron job.
 */
export async function resolveGlobalTickers(
  supabase: SupabaseClient,
): Promise<{ tickers: string[]; error?: string }> {
  const [holdingsResult, watchlistResult] = await Promise.all([
    supabase.from("holdings").select("symbol"),
    supabase.from("watchlist_items").select("symbol"),
  ]);

  if (holdingsResult.error) {
    return { tickers: [], error: holdingsResult.error.message };
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
