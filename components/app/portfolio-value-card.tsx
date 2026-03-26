"use client";

import { useState } from "react";

import { InlineRefreshPricesButton } from "@/components/app/inline-refresh-prices-button";
import type { PortfolioOverview, PortfolioPricingRefreshResult } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function PortfolioValueCard({
  initialOverview,
  portfolioId,
}: {
  initialOverview: Pick<PortfolioOverview, "totalValue" | "dayChange" | "lastSyncedAt">;
  portfolioId: string;
}) {
  const [overview, setOverview] = useState(initialOverview);

  function handleRefreshed(result: PortfolioPricingRefreshResult) {
    if (result.status === "updated" && result.overview) {
      setOverview(result.overview);
    }
  }

  return (
    <div className="flex min-h-[180px] flex-col justify-between rounded-2xl border border-white/[0.06] bg-surface-raised p-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
          TOTAL VALUE
        </p>
        <div className="mt-4 flex items-baseline gap-3">
          <p className="text-4xl font-bold tracking-tight text-white">
            {formatCurrency(overview.totalValue || 17900).split(".")[0]}
          </p>
          <p
            className={`flex items-center text-sm font-semibold ${
              overview.dayChange >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {overview.dayChange >= 0 ? "+" : ""}
            {overview.dayChange}%
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
        <span>{`Updated ${overview.lastSyncedAt || "2 mins ago"}`}</span>
        <InlineRefreshPricesButton
          portfolioId={portfolioId}
          onRefreshed={handleRefreshed}
        />
      </div>
    </div>
  );
}
