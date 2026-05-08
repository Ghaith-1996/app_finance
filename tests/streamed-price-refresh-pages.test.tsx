import React from "react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadFeedPageData = vi.fn();
const loadPortfolioPageData = vi.fn();
const loadAnalysisPageData = vi.fn();
const loadFullPortfolioPageData = vi.fn();
const refreshPortfolioPricingSnapshot = vi.fn();
const createClient = vi.fn();
const getBillingSummaryForUser = vi.fn();
const getCurrentUserBillingSummary = vi.fn();

const ActivePortfolioValueCard = vi.fn(
  ({ initialOverview }: { initialOverview: { totalValue: number } }) => (
    <div>Active value {initialOverview.totalValue}</div>
  ),
);
const FeedView = vi.fn((props?: unknown) => <div>{props ? "Feed view" : "Feed view"}</div>);

vi.mock("@/lib/server/page-loaders", () => ({
  loadFeedPageData,
  loadPortfolioPageData,
  loadAnalysisPageData,
  loadFullPortfolioPageData,
}));

vi.mock("@/lib/actions/portfolio", () => ({
  refreshPortfolioPricingSnapshot,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient,
}));

vi.mock("@/lib/billing/subscriptions", () => ({
  getBillingSummaryForUser,
  getCurrentUserBillingSummary,
}));

vi.mock("@/components/app/active-portfolio-value-card", () => ({
  ActivePortfolioValueCard: (props: { initialOverview: { totalValue: number } }) =>
    ActivePortfolioValueCard(props),
}));

vi.mock("@/components/app/inline-refresh-prices-button", () => ({
  InlineRefreshPricesButton: () => <button type="button">Inline refresh</button>,
}));

vi.mock("@/components/app/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/app/feed-view", () => ({
  FeedView: (props: unknown) => FeedView(props),
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

describe("portfolio value surfaces render cached data and manual refresh controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
        }),
      },
    });
    getBillingSummaryForUser.mockResolvedValue(null);
    getCurrentUserBillingSummary.mockResolvedValue({
      allowedModelTiers: ["free", "premium", "ultimate"],
      defaultModelTier: "free",
      aiQuotaLimit: 100,
      aiQuotaWindow: "day",
      aiQuotaUsed: 0,
      aiQuotaRemaining: 100,
      aiQuotaResetsAt: "2026-04-05T04:00:00.000Z",
    });
    refreshPortfolioPricingSnapshot.mockResolvedValue({
      status: "no_quotes",
      updated: 0,
      message: "No live quotes were returned. Try again shortly.",
      overview: null,
      holdings: null,
    });

    loadFeedPageData.mockResolvedValue({
      showOnboardingNav: false,
      portfolioId: "portfolio-1",
      marketStoryCount24h: 330,
      matchedStoryCount24h: 30,
      portfolioOverview: {
        totalValue: 12345,
        dayChange: 1.2,
        monthlyChange: 2.1,
        lastSyncedAt: "1 min ago",
        lastAnalyzedAt: "2 hours ago",
        coverage: "4 high-signal stories",
        primaryGoal: "Stay balanced",
      },
      portfolioInsights: [],
      initialFeedPayload: {
        feed: [
          {
            id: "feed-1",
            newsItemId: "news-1",
            headline: "Hydrated story",
            source: "Source",
            publishedAt: "5 minutes ago",
            publishedMinutesAgo: 5,
            category: "technology",
            stockTags: ["AAPL"],
            globalSummary: "Summary",
            displayEffect: "bullish",
            tickerImpacts: [],
            sourceType: "newsapi",
            sourceConfidence: "standard",
            metadata: {},
            angle: "",
            holdings: ["AAPL"],
            sectors: ["Technology"],
            aiSummary: "Summary",
            whyItMatters: "Matters",
          },
        ],
        portfolioId: "portfolio-1",
        mode: "personal",
        appliedSort: "match",
        sortNotice: null,
        portfolioSymbols: ["AAPL"],
        portfolioSectors: ["Technology"],
        watchlistSymbols: ["TSLA"],
        page: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1,
      },
    });

    loadPortfolioPageData.mockResolvedValue({
      showOnboardingNav: false,
      portfolioId: "portfolio-1",
      portfolioData: {
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
            latestEarningsReportUrl: null,
            latestEarningsReportSource: null,
            latestEarningsReportDate: null,
          },
        ],
      },
      portfolioOverview: {
        totalValue: 12345,
        dayChange: 1.2,
        monthlyChange: 0,
        lastSyncedAt: "1 min ago",
        lastAnalyzedAt: "2 hours ago",
        coverage: "4 stories",
        primaryGoal: "Stay balanced",
      },
      feedHighlights: [
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
    });

    loadAnalysisPageData.mockResolvedValue({
      showOnboardingNav: false,
      portfolioId: "portfolio-1",
      portfolioOverview: {
        totalValue: 12345,
        dayChange: 1.2,
        monthlyChange: 0,
        lastSyncedAt: "1 min ago",
        lastAnalyzedAt: "2 hours ago",
        coverage: "4 stories",
        primaryGoal: "Stay balanced",
      },
      portfolioInsights: [],
    });

    loadFullPortfolioPageData.mockResolvedValue({
      showOnboardingNav: false,
      portfolioId: "portfolio-1",
      portfolioCreatedAt: "2026-03-20T00:00:00.000Z",
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
          latestEarningsReportUrl: null,
          latestEarningsReportSource: null,
          latestEarningsReportDate: null,
        },
      ],
      sourceType: "manual",
      portfolioOverview: {
        totalValue: 12345,
        dayChange: 1.2,
        monthlyChange: 0,
        lastSyncedAt: "1 min ago",
        lastAnalyzedAt: "2 hours ago",
        coverage: "4 stories",
        primaryGoal: "Stay balanced",
      },
      insights: [],
      feedHighlights: [],
    });
  });

  it("/feed renders cached active value data immediately", async () => {
    const { default: FeedPage } = await import("@/app/feed/page");

    const page = await FeedPage({
      searchParams: Promise.resolve({}),
    });
    await act(async () => {
      render(page);
    });

    expect(loadFeedPageData).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Intelligence coverage")).toBeTruthy();
    expect(screen.getByText("330")).toBeTruthy();
    expect(screen.getByText("market stories in the last 24 hours")).toBeTruthy();
    expect(screen.getByText("30 matched to your portfolio")).toBeTruthy();
    expect(screen.getByText("Active value 12345")).toBeTruthy();
    expect(screen.getByText("Feed view")).toBeTruthy();
    expect(ActivePortfolioValueCard).toHaveBeenCalledWith(
      expect.objectContaining({
        portfolioId: "portfolio-1",
        initialOverview: expect.objectContaining({ totalValue: 12345 }),
      }),
    );
    expect(FeedView).toHaveBeenCalledWith(
      expect.objectContaining({
        portfolioId: "portfolio-1",
        initialFeedPayload: expect.objectContaining({
          feed: expect.arrayContaining([
            expect.objectContaining({ headline: "Hydrated story" }),
          ]),
          portfolioSymbols: ["AAPL"],
        }),
      }),
    );
  });

  it("/portfolio renders cached total value and an inline refresh control", async () => {
    const { default: PortfolioPage } = await import("@/app/portfolio/page");

    const page = await PortfolioPage();
    await act(async () => {
      render(page);
    });

    expect(loadPortfolioPageData).toHaveBeenCalledTimes(1);
    expect(screen.getByText("IMPORT METHOD")).toBeTruthy();
    expect(screen.getByText("Top Stories")).toBeTruthy();
    expect(screen.getByText(/updated 1 min ago/i)).toBeTruthy();
    expect(screen.getByText("Inline refresh")).toBeTruthy();
    expect(screen.queryByText("Refreshing portfolio value...")).toBeNull();
  });

  it("/analysis renders cached snapshot data and a manual refresh control", async () => {
    const { default: AnalysisPage } = await import("@/app/analysis/page");

    const page = await AnalysisPage({
      searchParams: Promise.resolve({}),
    });
    await act(async () => {
      render(page);
    });

    expect(loadAnalysisPageData).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Analysis run panel")).toBeTruthy();
    expect(screen.getByText("Portfolio snapshot")).toBeTruthy();
    expect(screen.getByText("Inline refresh")).toBeTruthy();
    expect(screen.queryByText("Refreshing snapshot...")).toBeNull();
  });

  it("/portfolio/full renders cached holdings and chart immediately while keeping the large refresh button", async () => {
    const { default: FullPortfolioPage } = await import("@/app/portfolio/full/page");

    const page = await FullPortfolioPage();
    await act(async () => {
      render(page);
    });

    expect(loadFullPortfolioPageData).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Insight Summary")).toBeTruthy();
    expect(screen.getByText("Performance chart")).toBeTruthy();
    expect(screen.getByText("Holdings table")).toBeTruthy();
    expect(screen.getByText("Refresh prices")).toBeTruthy();
    expect(screen.queryByText("Refreshing performance chart...")).toBeNull();
    expect(screen.queryByText("Loading synced holdings...")).toBeNull();
  });
});
