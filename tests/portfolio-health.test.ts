import { describe, expect, it } from "vitest";

import { calculatePortfolioHealth } from "@/lib/services/portfolio-health";
import type { Holding, PortfolioFeedHighlight } from "@/lib/types";

function makeHolding(overrides: Partial<Holding>): Holding {
  return {
    id: "holding-1",
    symbol: "AAPL",
    company: "Apple",
    sector: "Technology",
    market: "US",
    source: "Manual",
    price: 100,
    dailyChange: 0,
    allocation: 0,
    thesis: "",
    quantity: 10,
    averageCost: 90,
    costBasis: 900,
    currentPrice: 100,
    currentValue: 1000,
    unrealizedGainAmount: 100,
    unrealizedGainPercent: 11.1,
    quoteCurrency: "USD",
    quoteAsOf: "2026-05-31T13:00:00.000Z",
    importSource: "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
    ...overrides,
  };
}

function makeStory(overrides: Partial<PortfolioFeedHighlight>): PortfolioFeedHighlight {
  return {
    headline: "Regulators review AI chip exports",
    source: "MarketWire",
    publishedAt: "2026-05-31T12:00:00.000Z",
    category: "regulation",
    relevanceScore: 91,
    whyItMatters: "Could pressure semiconductor exposure.",
    holdings: ["NVDA"],
    sectors: ["Technology"],
    aiSummary: "Regulatory pressure may affect near-term sentiment.",
    matchReasonCodes: ["held_ticker_tag"],
    ...overrides,
  };
}

describe("portfolio health scoring", () => {
  it("measures concentration with the canonical USD valuation (audit H9)", () => {
    const result = calculatePortfolioHealth({
      holdings: [
        makeHolding({ id: "h1", symbol: "AAPL", quantity: 10, currentPrice: 100, currentValue: 1000 }),
        // CAD quote: C$200 x 10 at 0.75 = US$1,500, not the stored local C$2,000.
        makeHolding({
          id: "h2",
          symbol: "SHOP",
          quantity: 10,
          currentPrice: 200,
          currentValue: 2000,
          quoteCurrency: "CAD",
          fxRateToUsd: 0.75,
        }),
        // No usable price: excluded, never counted at its cost basis or allocation.
        makeHolding({ id: "h3", symbol: "XYZ", price: 0, currentPrice: 0, currentValue: 0, costBasis: 5000, allocation: 40 }),
      ],
      now: new Date("2026-05-31T13:10:00.000Z"),
    });

    const concentration = result.factors.find((factor) => factor.id === "position_concentration");
    expect(concentration?.value).toBe("SHOP 60%");
  });

  it("returns setup guidance when there are no holdings", () => {
    const result = calculatePortfolioHealth({
      holdings: [],
      now: new Date("2026-05-31T14:00:00.000Z"),
    });

    expect(result.score).toBe(0);
    expect(result.label).toBe("Needs setup");
    expect(result.risks[0]).toMatchObject({
      title: "Portfolio setup",
      href: "/onboarding",
    });
  });

  it("penalizes concentration, stale quotes, old analysis, and high-attention news", () => {
    const result = calculatePortfolioHealth({
      holdings: [
        makeHolding({
          symbol: "NVDA",
          company: "Nvidia",
          sector: "Technology",
          // Concentration comes from quantity x price (80 x $100), the canonical valuation (H9).
          quantity: 80,
          currentValue: 8000,
          quoteAsOf: "2026-05-29T13:00:00.000Z",
        }),
        makeHolding({
          id: "holding-2",
          symbol: "MSFT",
          company: "Microsoft",
          sector: "Technology",
          currentValue: 1000,
          quoteAsOf: "2026-05-31T13:00:00.000Z",
        }),
        makeHolding({
          id: "holding-3",
          symbol: "JNJ",
          company: "Johnson & Johnson",
          sector: "Healthcare",
          currentValue: 1000,
          quoteAsOf: "2026-05-31T13:00:00.000Z",
        }),
      ],
      feedHighlights: [makeStory({ holdings: ["NVDA"] })],
      latestAnalysisAt: "2026-05-27T13:00:00.000Z",
      now: new Date("2026-05-31T14:00:00.000Z"),
    });

    expect(result.score).toBeLessThan(55);
    expect(result.label).toBe("Needs attention");
    expect(result.factors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "position_concentration", tone: "risk" }),
        expect.objectContaining({ id: "sector_balance", tone: "risk" }),
        expect.objectContaining({ id: "analysis_freshness", tone: "risk" }),
        expect.objectContaining({ id: "news_pressure", tone: "watch" }),
      ]),
    );
  });

  it("keeps a diversified and fresh portfolio in a strong range", () => {
    const result = calculatePortfolioHealth({
      holdings: [
        makeHolding({
          symbol: "AAPL",
          sector: "Technology",
          currentValue: 2000,
          latestEarningsReportUrl: "https://investor.example.com/aapl",
          latestEarningsReportSource: "company",
        }),
        makeHolding({
          id: "holding-2",
          symbol: "XOM",
          company: "Exxon",
          sector: "Energy",
          currentValue: 1800,
          latestEarningsReportUrl: "https://investor.example.com/xom",
          latestEarningsReportSource: "company",
        }),
        makeHolding({
          id: "holding-3",
          symbol: "JNJ",
          company: "Johnson & Johnson",
          sector: "Healthcare",
          currentValue: 1700,
          latestEarningsReportUrl: "https://investor.example.com/jnj",
          latestEarningsReportSource: "company",
        }),
        makeHolding({
          id: "holding-4",
          symbol: "JPM",
          company: "JPMorgan",
          sector: "Financials",
          currentValue: 1500,
          latestEarningsReportUrl: "https://investor.example.com/jpm",
          latestEarningsReportSource: "company",
        }),
      ],
      feedHighlights: [
        makeStory({
          headline: "Cloud demand supports software names",
          category: "technology",
          whyItMatters: "Matches quality growth exposure.",
          aiSummary: "Demand remains resilient.",
        }),
      ],
      latestAnalysisAt: "2026-05-31T13:30:00.000Z",
      now: new Date("2026-05-31T14:00:00.000Z"),
    });

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.label).toBe("Strong");
    expect(result.opportunities[0]?.href).toBe("/feed");
  });
});
