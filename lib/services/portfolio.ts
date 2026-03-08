import type { SupabaseClient } from "@supabase/supabase-js";
import { getQuotes } from "@/lib/services/yahoo-finance";

export interface PortfolioOverviewResult {
  totalValue: number;
  dayChange: number;
  monthlyChange: number;
  lastSyncedAt: string;
  lastAnalyzedAt: string;
  coverage: string;
  primaryGoal: string;
}

export async function computePortfolioOverview(
  supabase: SupabaseClient,
  portfolioId: string
): Promise<PortfolioOverviewResult> {
  const { data: holdings } = await supabase
    .from("holdings")
    .select("symbol, price, daily_change, allocation")
    .eq("portfolio_id", portfolioId);

  const rows = holdings ?? [];
  const symbols = rows.map((h) => h.symbol as string);

  let quotes = new Map<string, { price: number; dailyChange: number }>();
  if (symbols.length > 0) {
    try {
      quotes = await getQuotes(symbols);
    } catch {
      // Yahoo Finance unavailable; fall through to DB prices
    }
  }

  const enriched = rows.map((h) => {
    const live = quotes.get((h.symbol as string).toUpperCase());
    return {
      price: live?.price ?? Number(h.price),
      dailyChange: live?.dailyChange ?? Number(h.daily_change),
      allocation: Number(h.allocation),
    };
  });

  const totalValue = enriched.reduce(
    (sum, h) => sum + h.price * (h.allocation / 100) * 1000,
    0
  );

  const weightedDayChange =
    totalValue > 0
      ? enriched.reduce(
          (sum, h) => sum + h.dailyChange * (h.allocation / 100),
          0
        )
      : 0;

  const { data: portfolioRow } = await supabase
    .from("portfolios")
    .select("last_synced_at")
    .eq("id", portfolioId)
    .single();

  const { data: run } = await supabase
    .from("analysis_runs")
    .select("completed_at")
    .eq("portfolio_id", portfolioId)
    .eq("status", "complete")
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
    : quotes.size > 0
      ? "Just now"
      : "—";

  return {
    totalValue: Math.round(totalValue),
    dayChange: Math.round(weightedDayChange * 100) / 100,
    monthlyChange: 0,
    lastSyncedAt,
    lastAnalyzedAt,
    coverage: `${feedCount ?? 0} high-signal stories`,
    primaryGoal: "Compound around quality holdings and resilient names.",
  };
}

function formatTimeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} minutes ago`;
  if (min < 1440) return `${Math.floor(min / 60)} hours ago`;
  return `${Math.floor(min / 1440)} days ago`;
}
