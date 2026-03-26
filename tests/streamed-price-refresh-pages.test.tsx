import React from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserPortfolios = vi.fn();
const getPortfolio = vi.fn();
const getPortfolioOverview = vi.fn();
const getPortfolioInsights = vi.fn();
const getPortfolioFeedHighlights = vi.fn();

const loadFreshOverviewAfterPriceSync = vi.fn();
const loadFreshFullPortfolioAfterPriceSync = vi.fn();

vi.mock("@/lib/actions/portfolio", () => ({
  getUserPortfolios,
  getPortfolio,
  getPortfolioOverview,
  getPortfolioInsights,
  getPortfolioFeedHighlights,
}));

vi.mock("@/lib/server/portfolio-refresh-loaders", () => ({
  loadFreshOverviewAfterPriceSync,
  loadFreshFullPortfolioAfterPriceSync,
}));

vi.mock("@/components/app/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/app/feed-view", () => ({
  FeedView: () => <div>Feed view</div>,
}));

vi.mock("@/components/app/analysis-run-trigger", () => ({
  AnalysisRunTrigger: () => <div>Analysis run panel</div>,
}));

vi.mock("@/components/app/add-position-form", () => ({
  AddPositionForm: () => <div>Add position form</div>,
}));

vi.mock("@/components/app/portfolio-csv-import-flow", () => ({
  PortfolioCsvImportFlow: () => <div>CSV import flow</div>,
}));

vi.mock("@/components/app/portfolio-copilot-panel", () => ({
  PortfolioCopilotPanel: () => <div>Copilot panel</div>,
}));

vi.mock("@/components/app/portfolio-holdings-table", () => ({
  PortfolioHoldingsTable: () => <div>Holdings table</div>,
}));

vi.mock("@/components/app/portfolio-performance-chart", () => ({
  PortfolioPerformanceChart: () => <div>Performance chart</div>,
}));

vi.mock("@/components/app/refresh-prices-button", () => ({
  RefreshPricesButton: () => <button type="button">Refresh prices</button>,
}));

const pendingPromise = new Promise<never>(() => {
  // Keep unresolved to force Suspense fallbacks in tests.
});

describe("streamed page-level price refresh surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getUserPortfolios.mockResolvedValue({
      data: [{ id: "portfolio-1", createdAt: "2026-03-20T00:00:00.000Z" }],
      error: null,
    });

    getPortfolioOverview.mockResolvedValue({
      data: {
        totalValue: 12345,
        dayChange: 1.2,
        monthlyChange: 2.1,
        lastSyncedAt: "1 min ago",
        lastAnalyzedAt: "2 hours ago",
        coverage: "4 stories",
        primaryGoal: "Stay balanced",
      },
      error: null,
    });

    getPortfolio.mockResolvedValue({
      data: {
        sourceType: "manual",
        holdings: [
          {
            id: "h1",
            symbol: "AAPL",
            company: "Apple",
            sector: "Technology",
            market: "US",
            source: "Manual",
            price: 100,
            dailyChange: 0.5,
            allocation: 50,
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
        ],
      },
      error: null,
    });

    getPortfolioInsights.mockResolvedValue({ data: [], error: null });
    getPortfolioFeedHighlights.mockResolvedValue({
      data: [
        {
          headline: "Story",
          source: "Source",
          publishedAt: "2026-03-25T10:00:00.000Z",
          category: "macro",
          relevanceScore: 80,
          whyItMatters: "Matters",
          holdings: ["AAPL"],
          sectors: ["Technology"],
          aiSummary: "Summary",
          matchReasonCodes: [],
        },
      ],
      error: null,
    });

    loadFreshOverviewAfterPriceSync.mockReturnValue(pendingPromise);
    loadFreshFullPortfolioAfterPriceSync.mockReturnValue(pendingPromise);
  });

  it("/feed renders shell content while active value card is loading", async () => {
    const { default: FeedPage } = await import("@/app/feed/page");

    const page = await FeedPage({
      searchParams: Promise.resolve({}),
    });
    await act(async () => {
      render(page);
    });

    expect(screen.getByText("Intelligence coverage")).toBeTruthy();
    expect(screen.getByText("Refreshing portfolio value...")).toBeTruthy();
    expect(screen.getByText("Feed view")).toBeTruthy();
  });

  it("/portfolio renders import method and top stories without waiting for refreshed total card", async () => {
    const { default: PortfolioPage } = await import("@/app/portfolio/page");

    const page = await PortfolioPage();
    await act(async () => {
      render(page);
    });

    expect(screen.getByText("IMPORT METHOD")).toBeTruthy();
    expect(screen.getByText("Top Stories")).toBeTruthy();
    expect(screen.getByText("Refreshing portfolio value...")).toBeTruthy();
  });

  it("/analysis renders analysis panel without waiting for refreshed snapshot panel", async () => {
    const { default: AnalysisPage } = await import("@/app/analysis/page");

    const page = await AnalysisPage({
      searchParams: Promise.resolve({}),
    });
    await act(async () => {
      render(page);
    });

    expect(screen.getByText("Analysis run panel")).toBeTruthy();
    expect(screen.getByText("Refreshing snapshot...")).toBeTruthy();
  });

  it("/portfolio/full keeps side panels visible while hero and holdings surfaces stream", async () => {
    const { default: FullPortfolioPage } = await import("@/app/portfolio/full/page");

    const page = await FullPortfolioPage();
    await act(async () => {
      render(page);
    });

    expect(screen.getByText("Insight Summary")).toBeTruthy();
    expect(screen.getByText("Refreshing performance chart...")).toBeTruthy();
    expect(screen.getByText("Loading synced holdings...")).toBeTruthy();
  });
});
