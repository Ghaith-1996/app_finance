import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Holding, PortfolioOverview } from "@/lib/types";

const mocked = vi.hoisted(() => ({
  refreshPortfolioPricingSnapshot: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocked.routerRefresh }),
}));

vi.mock("@/lib/actions/portfolio", () => ({
  refreshPortfolioPricingSnapshot: mocked.refreshPortfolioPricingSnapshot,
}));

vi.mock("@/components/app/portfolio-performance-chart", () => ({
  PortfolioPerformanceChart: ({
    totalValue,
  }: {
    totalValue: number;
  }) => <div>{`Chart ${totalValue}`}</div>,
}));

vi.mock("@/components/app/portfolio-holdings-table", () => ({
  PortfolioHoldingsTable: ({
    holdings,
  }: {
    holdings: Holding[];
  }) => <div>{`Holdings ${holdings.length}`}</div>,
}));

vi.mock("@/components/app/add-position-form", () => ({
  AddPositionForm: () => <div>Add position form</div>,
}));

vi.mock("@/components/app/portfolio-csv-import-flow", () => ({
  PortfolioCsvImportFlow: () => <div>CSV import flow</div>,
}));

import { PortfolioPricingSection } from "@/components/app/portfolio-pricing-section";

const initialHoldings: Holding[] = [
  {
    id: "holding-1",
    symbol: "AAPL",
    company: "Apple",
    sector: "Technology",
    market: "US",
    source: "Manual",
    price: 100,
    dailyChange: 1,
    allocation: 100,
    thesis: "",
    quantity: 2,
    averageCost: 90,
    costBasis: 180,
    currentPrice: 100,
    currentValue: 200,
    unrealizedGainAmount: 20,
    unrealizedGainPercent: 11.1,
    quoteCurrency: "USD",
    quoteAsOf: "2026-03-25T11:59:00.000Z",
    importSource: "manual",
  },
];

const initialOverview: PortfolioOverview = {
  totalValue: 20000,
  dayChange: 1,
  monthlyChange: 0,
  lastSyncedAt: "10 mins ago",
  lastAnalyzedAt: "2 hours ago",
  coverage: "4 stories",
  primaryGoal: "Stay balanced",
};

const refreshedOverview: PortfolioOverview = {
  totalValue: 24000,
  dayChange: 1.8,
  monthlyChange: 0,
  lastSyncedAt: "Just now",
  lastAnalyzedAt: "2 hours ago",
  coverage: "5 stories",
  primaryGoal: "Stay balanced",
};

const refreshedHoldings: Holding[] = [
  ...initialHoldings,
  {
    ...initialHoldings[0],
    id: "holding-2",
    symbol: "MSFT",
    company: "Microsoft",
  },
];

describe("PortfolioPricingSection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocked.refreshPortfolioPricingSnapshot.mockReset();
    mocked.routerRefresh.mockReset();
  });

  it("triggers one silent auto refresh on mount and updates chart and holdings", async () => {
    mocked.refreshPortfolioPricingSnapshot.mockResolvedValueOnce({
      status: "updated",
      updated: 2,
      message: "Updated 2 holdings.",
      overview: refreshedOverview,
      holdings: refreshedHoldings,
    });

    render(
      <PortfolioPricingSection
        portfolioId="portfolio-1"
        portfolioCreatedAt="2026-03-20T00:00:00.000Z"
        initialOverview={initialOverview}
        initialHoldings={initialHoldings}
      >
        <div>Sector cards</div>
      </PortfolioPricingSection>,
    );

    expect(screen.getByText("Chart 20000")).toBeTruthy();
    expect(screen.getByText("Holdings 1")).toBeTruthy();

    await waitFor(() => {
      expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledTimes(1);
    });

    expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledWith("portfolio-1", {
      includeHoldings: true,
    });
    expect(await screen.findByText("Chart 24000")).toBeTruthy();
    expect(screen.getByText("Holdings 2")).toBeTruthy();
    expect(screen.getByText(/synced just now/i)).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });

  it("keeps cached values and stays quiet when the auto refresh fails", async () => {
    mocked.refreshPortfolioPricingSnapshot.mockRejectedValueOnce(new Error("timeout"));

    render(
      <PortfolioPricingSection
        portfolioId="portfolio-1"
        portfolioCreatedAt="2026-03-20T00:00:00.000Z"
        initialOverview={initialOverview}
        initialHoldings={initialHoldings}
      >
        <div>Sector cards</div>
      </PortfolioPricingSection>,
    );

    await waitFor(() => {
      expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Chart 20000")).toBeTruthy();
    expect(screen.getByText("Holdings 1")).toBeTruthy();
    expect(screen.queryByText("Updated 2 holdings.")).toBeNull();
    expect(screen.queryByText(/failed to save refreshed holding prices/i)).toBeNull();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });

  it("still updates locally after a successful manual refresh", async () => {
    mocked.refreshPortfolioPricingSnapshot
      .mockResolvedValueOnce({
        status: "no_quotes",
        updated: 0,
        message: "No live quotes were returned. Try again shortly.",
        overview: null,
        holdings: null,
      })
      .mockResolvedValueOnce({
        status: "updated",
        updated: 2,
        message: "Updated 2 holdings.",
        overview: refreshedOverview,
        holdings: refreshedHoldings,
      });

    render(
      <PortfolioPricingSection
        portfolioId="portfolio-1"
        portfolioCreatedAt="2026-03-20T00:00:00.000Z"
        initialOverview={initialOverview}
        initialHoldings={initialHoldings}
      >
        <div>Sector cards</div>
      </PortfolioPricingSection>,
    );

    await waitFor(() => {
      expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole("button", { name: /refresh prices/i }));

    await waitFor(() => {
      expect(mocked.refreshPortfolioPricingSnapshot).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText("Chart 24000")).toBeTruthy();
    expect(screen.getByText("Holdings 2")).toBeTruthy();
    expect(screen.getByText(/synced just now/i)).toBeTruthy();
    expect(screen.getByText("Updated 2 holdings.")).toBeTruthy();
    expect(mocked.routerRefresh).not.toHaveBeenCalled();
  });
});
