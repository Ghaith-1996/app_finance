"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Activity } from "lucide-react";

import { InlineRefreshPricesButton } from "@/components/app/inline-refresh-prices-button";
import { Panel } from "@/components/ui/panel";
import { describeOverview, refreshedOverview, UNKNOWN_VALUE } from "@/lib/portfolio/value-display";
import type { PortfolioOverview, PortfolioPricingRefreshResult } from "@/lib/types";

export function PortfolioSnapshotPanel({
  initialOverview,
  portfolioId,
}: {
  initialOverview: Pick<
    PortfolioOverview,
    "totalValue" | "dayChange" | "monthlyChange" | "lastSyncedAt" | "coverage" | "valuation"
  >;
  portfolioId: string | null;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const display = describeOverview(overview);

  function handleRefreshed(result: PortfolioPricingRefreshResult) {
    const next = refreshedOverview(result);
    if (next) setOverview(next);
  }

  return (
    <Panel className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/5 p-3 text-brand">
          <Activity className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
            Portfolio snapshot
          </p>
          <p className="text-lg font-semibold text-white">
            {display.value}
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric
          label="Day change"
          value={display.dayChangeAmount ? `${display.dayChangePercent} (${display.dayChangeAmount})` : display.dayChangePercent}
        />
        {/* 30-day change is not computed yet; show unknown rather than an invented 0%. */}
        <Metric label="30 day move" value={UNKNOWN_VALUE} />
        <Metric
          label="Last sync"
          value={
            <div className="flex flex-wrap items-center gap-2">
              <span>{overview.lastSyncedAt || "Not synced yet"}</span>
              {portfolioId ? (
                <InlineRefreshPricesButton
                  portfolioId={portfolioId}
                  className="h-6 px-1.5 text-[10px]"
                  onRefreshed={handleRefreshed}
                />
              ) : null}
            </div>
          }
        />
        <Metric label="Coverage" value={overview.coverage} />
      </div>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
