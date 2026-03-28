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
    });

    render(<WatchlistDetailDashboard symbol="AAPL" />);

    await waitFor(() => {
      expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
    });

    expect(screen.queryByRole("link", { name: /javascript:alert\(1\)/i })).toBeNull();
  });
});
