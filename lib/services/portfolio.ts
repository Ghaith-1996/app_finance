import type { SupabaseClient } from "@supabase/supabase-js";

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
    .select("symbol, price, daily_change, allocation, quantity, current_price, average_cost")
    .eq("portfolio_id", portfolioId);

  const rows = holdings ?? [];

  const enriched = rows.map((h) => {
    const qty = Number(h.quantity ?? 0);
    const price = Number(h.current_price ?? h.price ?? 0);
    const dailyChange = Number(h.daily_change ?? 0);

    return {
      price,
      dailyChange,
      quantity: qty,
      allocation: Number(h.allocation ?? 0),
      value: qty > 0 ? qty * price : price * (Number(h.allocation ?? 0) / 100) * 1000,
    };
  });

  const totalValue = enriched.reduce((sum, h) => sum + h.value, 0);

  const weightedDayChange =
    totalValue > 0
      ? enriched.reduce(
          (sum, h) => sum + h.dailyChange * (h.value / totalValue),
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
