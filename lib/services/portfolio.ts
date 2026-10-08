import type { Holding } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  summarizeValuation,
  VALUATION_HOLDING_COLUMNS,
  valuationInputFromHoldingRow,
  valuePortfolio,
  type PortfolioValuationSummary,
} from "@/lib/services/valuation";
import { formatRelativeTime } from "@/lib/time/format";

export type PortfolioHoldingRow = {
  id: string;
  symbol: string;
  company: string;
  sector: string;
  market: string;
  source: string;
  price: number | string | null;
  daily_change: number | string | null;
  allocation: number | string | null;
  thesis: string | null;
  quantity: number | string | null;
  average_cost: number | string | null;
  cost_basis: number | string | null;
  current_price: number | string | null;
  current_value: number | string | null;
  unrealized_gain_amount: number | string | null;
  unrealized_gain_percent: number | string | null;
  quote_currency: string | null;
  quote_as_of: string | null;
  import_source: string | null;
  previous_close?: number | string | null;
  fx_rate_to_usd?: number | string | null;
};

export function mapHoldingFromDb(row: PortfolioHoldingRow): Holding {
  return {
    id: row.id,
    symbol: row.symbol,
    company: row.company,
    sector: row.sector,
    market: row.market,
    source: row.source,
    price: Number(row.price ?? 0),
    dailyChange: Number(row.daily_change ?? 0),
    allocation: Number(row.allocation ?? 0),
    thesis: row.thesis ?? "",
    quantity: Number(row.quantity ?? 0),
    averageCost: Number(row.average_cost ?? 0),
    costBasis: Number(row.cost_basis ?? 0),
    currentPrice: Number(row.current_price ?? 0),
    currentValue: Number(row.current_value ?? 0),
    unrealizedGainAmount: Number(row.unrealized_gain_amount ?? 0),
    unrealizedGainPercent: Number(row.unrealized_gain_percent ?? 0),
    quoteCurrency: row.quote_currency ?? "USD",
    quoteAsOf: row.quote_as_of ?? null,
    importSource: row.import_source ?? "manual",
    previousClose: row.previous_close == null ? null : Number(row.previous_close),
    fxRateToUsd: row.fx_rate_to_usd == null ? null : Number(row.fx_rate_to_usd),
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
  };
}

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
