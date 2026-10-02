import type { SupabaseClient } from "@supabase/supabase-js";

import {
  summarizeValuation,
  VALUATION_HOLDING_COLUMNS,
  valuationInputFromHoldingRow,
  valuePortfolio,
  type PortfolioValuationSummary,
} from "@/lib/services/valuation";
import { formatRelativeTime } from "@/lib/time/format";

export interface PortfolioOverviewResult {
  totalValue: number;
  dayChange: number;
  monthlyChange: number;
  lastSyncedAt: string;
  lastAnalyzedAt: string;
  coverage: string;
  primaryGoal: string;
  valuation: PortfolioValuationSummary;
}

export async function computePortfolioOverview(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<PortfolioOverviewResult> {
  const { data: holdings } = await supabase
    .from("holdings")
    .select(VALUATION_HOLDING_COLUMNS)
    .eq("portfolio_id", portfolioId);

  const valuation = valuePortfolio((holdings ?? []).map(valuationInputFromHoldingRow));

  const { data: portfolioRow } = await supabase
    .from("portfolios")
    .select("last_synced_at")
    .eq("id", portfolioId)
    .single();

  const { data: run } = await supabase
    .from("analysis_runs")
    .select("completed_at")
    .eq("portfolio_id", portfolioId)
    .in("status", ["complete", "degraded"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: feedCount } = await supabase
    .from("feed_items")
    .select("id", { count: "exact", head: true })
    .eq("portfolio_id", portfolioId);

  const lastAnalyzedAt = run?.completed_at
    ? formatTimeAgo(run.completed_at)
    : "Never";
  const lastSyncedAt = portfolioRow?.last_synced_at
    ? formatTimeAgo(portfolioRow.last_synced_at)
    : "—";

  return {
    totalValue: Math.round(valuation.totalValue),
    dayChange: Math.round((valuation.dayChangePercent ?? 0) * 100) / 100,
    monthlyChange: 0,
    lastSyncedAt,
    lastAnalyzedAt,
    coverage: `${feedCount ?? 0} high-signal stories`,
    primaryGoal: "Compound around quality holdings and resilient names.",
    valuation: summarizeValuation(valuation),
  };
}

function formatTimeAgo(iso: string): string {
  return formatRelativeTime(iso);
}
