"use client";

import { useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

import { InlineRefreshPricesButton } from "@/components/app/inline-refresh-prices-button";
import { describeOverview, refreshedOverview } from "@/lib/portfolio/value-display";
import type { PortfolioOverview, PortfolioPricingRefreshResult } from "@/lib/types";

export function ActivePortfolioValueCard({
  portfolioId,
  initialOverview,
}: {
  portfolioId: string | null;
  initialOverview: PortfolioOverview;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const display = describeOverview(overview, 2);

  function handleRefreshed(result: PortfolioPricingRefreshResult) {
    const next = refreshedOverview(result);
    if (next) setOverview(next);
  }

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Active portfolio value
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
          {display.value}
        </p>
        {display.notes.map((note) => (
          <p key={note} className="mt-1 text-xs text-amber-300">
            {note}
          </p>
        ))}
      </div>
      <div
        className={`mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold ${
          display.direction === "down"
            ? "text-red-400"
            : display.direction === "up"
              ? "text-emerald-400"
              : "text-slate-500"
        }`}
      >
        {display.direction === "down" ? (
          <TrendingDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : display.direction === "up" ? (
          <TrendingUp className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : null}
        <span>
          {display.direction === "unknown"
            ? "Day change unavailable"
            : `${display.dayChangePercent}${display.dayChangeAmount ? ` (${display.dayChangeAmount})` : ""} today`}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>{overview.lastSyncedAt ? `Updated ${overview.lastSyncedAt}` : "Not synced yet"}</span>
        {portfolioId ? (
          <InlineRefreshPricesButton
            portfolioId={portfolioId}
            onRefreshed={handleRefreshed}
          />
        ) : null}
      </div>
    </div>
  );
}
