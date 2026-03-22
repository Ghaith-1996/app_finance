import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the global ticker universe from all holdings across all portfolios.
 * Used by the unattended market-ingest cron job.
 */
export async function resolveGlobalTickers(
  supabase: SupabaseClient,
): Promise<{ tickers: string[]; error?: string }> {
  const { data, error } = await supabase
    .from("holdings")
    .select("symbol");

  if (error) {
    return { tickers: [], error: error.message };
  }

  const tickers = [
    ...new Set(
      (data ?? [])
        .map((row) => (row.symbol as string).toUpperCase())
        .filter(Boolean),
    ),
  ].sort();

  return { tickers };
}
