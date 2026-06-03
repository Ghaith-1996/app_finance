import { describe, expect, it } from "vitest";

import { buildWatchlistIntelligence } from "@/lib/watchlist/intelligence";
import type { WatchlistDetailData } from "@/lib/services/twelvedata";

const detail: WatchlistDetailData = {
  symbol: "AAPL",
  summary: {
    company: "Apple Inc.",
    exchange: "NASDAQ",
    currency: "USD",
    price: 210,
    change: 8,
    changePercent: 4.2,
    isMarketOpen: true,
  },
  chart: [],
  stats: {
    open: 202,
    high: 211,
    low: 200,
    previousClose: 202,
    volume: 1000,
    averageVolume: 1200,
    marketCap: 3_000_000_000_000,
    fiftyTwoWeekHigh: 230,
    fiftyTwoWeekLow: 160,
    beta: 1.2,
    pe: 32,
    forwardPe: 29,
    eps: 6,
    dividendYield: 0.005,
    profitMargin: 0.25,
    revenueGrowth: 0.08,
  },
  profile: {
    sector: "Technology",
    industry: "Consumer Electronics",
    country: "United States",
    website: "https://apple.com",
    description: "Consumer devices and services.",
    ceo: "Tim Cook",
    employees: 160000,
  },
  earnings: [
    {
      date: "2026-07-30",
      epsActual: null,
      epsEstimate: 1.42,
      surprise: null,
      revenueEstimate: null,
      revenueActual: null,
    },
  ],
  financials: [],
  capabilities: {
    hasStats: true,
    hasProfile: true,
    hasEarnings: true,
    hasFinancials: false,
  },
  warnings: [],
  error: null,
  latestEarningsReportUrl: "https://investor.apple.com/report",
  latestEarningsReportSource: "company",
  latestEarningsReportDate: "2026-05-01",
};

describe("buildWatchlistIntelligence", () => {
  it("summarizes watchlist catalysts from price, earnings, profile, and valuation", () => {
    const intelligence = buildWatchlistIntelligence(detail);

    expect(intelligence.summary).toContain("Watch AAPL through");
    expect(intelligence.signals.map((signal) => signal.label)).toEqual(
      expect.arrayContaining([
        "Price pressure",
        "Earnings catalyst",
        "Business context",
        "Size profile",
        "Valuation read",
      ]),
    );
    expect(
      intelligence.signals.find((signal) => signal.id === "price-move")?.tone,
    ).toBe("watch");
  });
});
