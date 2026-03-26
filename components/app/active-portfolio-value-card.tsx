import { TrendingDown, TrendingUp } from "lucide-react";

import { InlineRefreshPricesButton } from "@/components/app/inline-refresh-prices-button";
import type { PortfolioOverview } from "@/lib/types";
import { formatCurrency, formatPercent, formatPrice } from "@/lib/utils";

export function ActivePortfolioValueCard({
  portfolioId,
  initialOverview,
}: {
  portfolioId: string | null;
  initialOverview: PortfolioOverview;
}) {
  const overview = initialOverview;
  const dayPct = overview.dayChange;
  const dayDollar = Math.round(overview.totalValue * (dayPct / 100) * 100) / 100;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Active portfolio value
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
          {formatPrice(overview.totalValue)}
        </p>
      </div>
      <div
        className={`mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold ${
          dayPct < 0 ? "text-red-400" : dayPct > 0 ? "text-emerald-400" : "text-slate-500"
        }`}
      >
        {dayPct < 0 ? (
          <TrendingDown className="h-4 w-4 shrink-0" />
        ) : dayPct > 0 ? (
          <TrendingUp className="h-4 w-4 shrink-0" />
        ) : null}
        <span>{`${formatPercent(dayPct)} (${formatCurrency(Math.abs(dayDollar))})`}</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <span>{`Updated ${overview.lastSyncedAt}`}</span>
        {portfolioId ? <InlineRefreshPricesButton portfolioId={portfolioId} /> : null}
      </div>
    </div>
  );
}
