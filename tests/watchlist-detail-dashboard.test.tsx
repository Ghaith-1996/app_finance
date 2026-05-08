import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getWatchlistItemDetails = vi.fn();

vi.mock("@/lib/actions/watchlist", () => ({
  getWatchlistItemDetails: (...args: unknown[]) => getWatchlistItemDetails(...args),
}));

import { WatchlistDetailDashboard } from "@/components/app/watchlist-detail-dashboard";

describe("WatchlistDetailDashboard", () => {
  beforeEach(() => {
    getWatchlistItemDetails.mockReset();
  });

  it("renders unsafe company websites as inert text instead of links", async () => {
    getWatchlistItemDetails.mockResolvedValue({
      symbol: "AAPL",
      summary: {
        company: "Apple Inc.",
        exchange: "NASDAQ",
        currency: "USD",
        price: 100,
        change: 1,
        changePercent: 1,
        isMarketOpen: true,
      },
      chart: [],
      stats: {
        open: null,
        high: null,
        low: null,
        previousClose: null,
        volume: null,
        averageVolume: null,
        marketCap: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        beta: null,
        pe: null,
        forwardPe: null,
        eps: null,
        dividendYield: null,
        profitMargin: null,
        revenueGrowth: null,
      },
      profile: {
        sector: "Technology",
        industry: "Hardware",
        country: "US",
        website: "javascript:alert(1)",
        description: "Company description",
        ceo: null,
        employees: null,
      },
      earnings: [],
      financials: [],
      capabilities: {
        hasStats: false,
        hasProfile: true,
        hasEarnings: false,
        hasFinancials: false,
      },
      warnings: [],
      error: null,
      latestEarningsReportUrl: null,
      latestEarningsReportSource: null,
      latestEarningsReportDate: null,
    });

    render(<WatchlistDetailDashboard symbol="AAPL" />);

    await waitFor(() => {
      expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
    });

    expect(screen.queryByRole("link", { name: /javascript:alert\(1\)/i })).toBeNull();
  });

  it("renders the latest earnings report CTA when a report link exists", async () => {
    getWatchlistItemDetails.mockResolvedValue({
      symbol: "MSFT",
      summary: {
        company: "Microsoft",
        exchange: "NASDAQ",
        currency: "USD",
        price: 300,
        change: 2,
        changePercent: 0.7,
        isMarketOpen: true,
      },
      chart: [],
      stats: {
        open: null,
        high: null,
        low: null,
        previousClose: null,
        volume: null,
        averageVolume: null,
        marketCap: null,
        fiftyTwoWeekHigh: null,
        fiftyTwoWeekLow: null,
        beta: null,
        pe: null,
        forwardPe: null,
        eps: null,
        dividendYield: null,
        profitMargin: null,
        revenueGrowth: null,
      },
      profile: {
        sector: "Technology",
        industry: "Software",
        country: "US",
        website: "https://microsoft.com",
        description: null,
        ceo: null,
        employees: null,
      },
      earnings: [],
      financials: [],
      capabilities: {
        hasStats: false,
        hasProfile: true,
        hasEarnings: false,
        hasFinancials: false,
      },
      warnings: [],
      error: null,
      latestEarningsReportUrl: "https://www.microsoft.com/en-us/Investor/earnings/FY-2026-Q3",
      latestEarningsReportSource: "company",
      latestEarningsReportDate: "2026-04-30",
    });

    render(<WatchlistDetailDashboard symbol="MSFT" />);

    expect(
      await screen.findByRole("link", { name: /latest earnings report/i }),
    ).toHaveAttribute(
      "href",
      "https://www.microsoft.com/en-us/Investor/earnings/FY-2026-Q3",
    );
    expect(screen.getByText(/COMPANY/i)).toBeTruthy();
    expect(screen.getByText(/2026-04-30/i)).toBeTruthy();
  });
});
