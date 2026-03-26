"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Activity } from "lucide-react";

import { InlineRefreshPricesButton } from "@/components/app/inline-refresh-prices-button";
import { Panel } from "@/components/ui/panel";
import type { PortfolioOverview, PortfolioPricingRefreshResult } from "@/lib/types";
import { formatCurrency, formatPercent } from "@/lib/utils";

export function PortfolioSnapshotPanel({
  initialOverview,
  portfolioId,
}: {
  initialOverview: Pick<
    PortfolioOverview,
    "totalValue" | "dayChange" | "monthlyChange" | "lastSyncedAt" | "coverage"
  >;
  portfolioId: string | null;
}) {
  const [overview, setOverview] = useState(initialOverview);

  function handleRefreshed(result: PortfolioPricingRefreshResult) {
    if (result.status === "updated" && result.overview) {
      setOverview(result.overview);
    }
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
            {formatCurrency(overview.totalValue)}
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Day change" value={formatPercent(overview.dayChange)} />
        <Metric label="30 day move" value={formatPercent(overview.monthlyChange)} />
        <Metric
          label="Last sync"
          value={
            <div className="flex flex-wrap items-center gap-2">
              <span>{overview.lastSyncedAt}</span>
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
