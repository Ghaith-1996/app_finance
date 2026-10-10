import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAllRows } from "@/lib/supabase/paginate";

export type LatestUsableRun = { portfolio_id: string; started_at: string | null; completed_at: string | null };

/**
 * Each portfolio's newest usable (complete or degraded) run, one row per portfolio (migration 044),
 * read in pages. Service-role only: it spans every user's portfolios.
 */
export function fetchLatestUsableRuns(supabase: SupabaseClient) {
  return fetchAllRows<LatestUsableRun>((from, to) =>
    supabase.rpc("latest_usable_analysis_runs").order("portfolio_id", { ascending: true }).range(from, to),
  );
}
