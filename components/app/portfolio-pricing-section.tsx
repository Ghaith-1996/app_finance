"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { AddPositionForm } from "@/components/app/add-position-form";
import { PortfolioCsvImportFlow } from "@/components/app/portfolio-csv-import-flow";
import { PortfolioHoldingsTable } from "@/components/app/portfolio-holdings-table";
import { PortfolioPerformanceChart } from "@/components/app/portfolio-performance-chart";
import { RefreshPricesButton } from "@/components/app/refresh-prices-button";
import { refreshPortfolioPricingSnapshot } from "@/lib/actions/portfolio";
import type {
  Holding,
  PortfolioOverview,
  PortfolioPricingRefreshResult,
  PortfolioValueSnapshot,
} from "@/lib/types";

export function PortfolioPricingSection({
  portfolioId,
  portfolioCreatedAt,
  initialOverview,
  initialHoldings,
  initialValueSnapshots = [],
  children,
}: {
  portfolioId: string;
  portfolioCreatedAt: string;
  initialOverview: PortfolioOverview;
  initialHoldings: Holding[];
  initialValueSnapshots?: PortfolioValueSnapshot[];
  children?: ReactNode;
}) {
  const [overview, setOverview] = useState(initialOverview);
  const [holdings, setHoldings] = useState(initialHoldings);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const autoRefreshStartedRef = useRef(false);

  function handleRefreshed(result: PortfolioPricingRefreshResult) {
    if (result.status !== "updated") return;
    if (result.overview) {
      setOverview(result.overview);
    }
    if (result.holdings) {
      setHoldings(result.holdings);
    }
  }

  useEffect(() => {
    if (autoRefreshStartedRef.current || initialHoldings.length === 0) return;
    autoRefreshStartedRef.current = true;

    let active = true;
    queueMicrotask(() => {
      if (active) {
        setAutoRefreshing(true);
      }
    });

    void refreshPortfolioPricingSnapshot(portfolioId, { includeHoldings: true })
      .then((result) => {
        if (!active || result.status !== "updated") return;
        if (result.overview) {
          setOverview(result.overview);
        }
        if (result.holdings) {
          setHoldings(result.holdings);
        }
      })
      .catch(() => {
        // Keep the cached snapshot visible when background refresh fails.
      })
      .finally(() => {
        if (active) {
          setAutoRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [initialHoldings.length, portfolioId]);

  return (
    <div className="flex-1 space-y-10 lg:space-y-12">
      <div className="mb-8 sm:mb-10">
        <PortfolioPerformanceChart
          totalValue={overview.totalValue}
          dayChange={overview.dayChange ?? 0}
          portfolioCreatedAt={portfolioCreatedAt}
          holdings={holdings}
          historicalSnapshots={initialValueSnapshots}
        />
      </div>

      {children}

      <div>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight text-white">Active Holdings</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <p>Synced {overview.lastSyncedAt}</p>
              {autoRefreshing ? (
                <span className="text-[11px] font-medium text-slate-400">Auto-refreshing...</span>
              ) : null}
            </div>
          </div>
          <div className="flex w-full flex-col-reverse gap-3 sm:w-auto sm:flex-row sm:items-start">
            <p className="text-[12px] font-bold uppercase tracking-widest text-brand sm:pt-2">
              {holdings.length} positions
            </p>
            <RefreshPricesButton
              portfolioId={portfolioId}
              includeHoldings
              className="h-9 gap-1.5 px-3 text-[11px] font-bold uppercase tracking-wider"
              statusClassName="max-w-[220px]"
              onRefreshed={handleRefreshed}
            />
          </div>
        </div>

        <AddPositionForm portfolioId={portfolioId} />
        <div className="mt-4">
          <PortfolioCsvImportFlow
            portfolioId={portfolioId}
            saveBehavior="refresh"
            title="Bulk import holdings"
            description="Upload a broker CSV, review the parsed holdings, then choose whether to merge into this portfolio or replace it."
            showEntryButton
            entryLabel="Import CSV"
            defaultOpen={false}
          />
        </div>

        {holdings.length > 0 ? (
          <PortfolioHoldingsTable holdings={holdings} portfolioId={portfolioId} />
        ) : (
          <div className="rounded-[1.5rem] border border-white/[0.06] bg-surface-raised px-5 py-6 text-center text-sm text-slate-500 shadow-sm sm:px-6 sm:py-8">
            No holdings available yet.
          </div>
        )}
      </div>
    </div>
  );
}
