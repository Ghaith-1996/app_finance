"use client";

import { useState } from "react";

import { RefreshPricesButton } from "@/components/app/refresh-prices-button";
import { describeOverview, refreshedOverview } from "@/lib/portfolio/value-display";
import type { PortfolioOverview, PortfolioPricingRefreshResult } from "@/lib/types";

export function PortfolioValueCard({
  initialOverview,
  portfolioId,
}: {
  initialOverview: Pick<PortfolioOverview, "totalValue" | "dayChange" | "lastSyncedAt" | "valuation">;
  portfolioId: string;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const display = describeOverview(overview);

  function handleRefreshed(result: PortfolioPricingRefreshResult) {
    const next = refreshedOverview(result);
    if (next) setOverview(next);
  }

  return (
    <div className="flex min-h-[180px] flex-col justify-between rounded-2xl border border-white/[0.06] bg-surface-raised p-8">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
          TOTAL VALUE
        </p>
        <div className="mt-4 flex items-baseline gap-3">
          <p className="text-4xl font-bold tracking-tight text-white">{display.value}</p>
          <p
            className={`flex items-center text-sm font-semibold ${
              display.direction === "up"
                ? "text-emerald-400"
                : display.direction === "down"
                  ? "text-red-400"
                  : "text-slate-500"
            }`}
          >
            {display.dayChangePercent === "—" ? "Day change unavailable" : `${display.dayChangePercent} today`}
          </p>
        </div>
        {display.notes.map((note) => (
          <p key={note} className="mt-2 text-xs text-amber-300">
            {note}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
        <span>{overview.lastSyncedAt ? `Updated ${overview.lastSyncedAt}` : "Not synced yet"}</span>
        <RefreshPricesButton
          presentation="inline"
          portfolioId={portfolioId}
          onRefreshed={handleRefreshed}
        />
      </div>
    </div>
  );
}
