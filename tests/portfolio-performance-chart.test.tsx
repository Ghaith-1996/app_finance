import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Holding } from "@/lib/types";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive-chart">{children}</div>
  ),
  AreaChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Area: () => null,
}));

import { PortfolioPerformanceChart } from "@/components/app/portfolio-performance-chart";

const holding: Holding = {
  id: "holding-1",
  symbol: "AAPL",
  company: "Apple",
  sector: "Technology",
  market: "US",
  source: "Manual",
  price: 100,
  dailyChange: 2,
  allocation: 100,
  thesis: "",
  quantity: 10,
  averageCost: 80,
  costBasis: 800,
  currentPrice: 100,
  currentValue: 1000,
  unrealizedGainAmount: 200,
  unrealizedGainPercent: 25,
  quoteCurrency: "USD",
  quoteAsOf: "2026-03-25T12:00:00.000Z",
  importSource: "manual",
  latestEarningsReportUrl: null,
  latestEarningsReportSource: null,
  latestEarningsReportDate: null,
};

describe("PortfolioPerformanceChart", () => {
  it("labels the chart as live quote data instead of simulated", () => {
    render(
      <PortfolioPerformanceChart
        totalValue={1000}
        dayChange={2}
        portfolioCreatedAt="2026-03-20T00:00:00.000Z"
        holdings={[holding]}
      />,
    );

    expect(screen.getByText("Portfolio Performance")).toBeTruthy();
    expect(screen.getByText("Live quotes")).toBeTruthy();
    expect(screen.getByText("Actual holdings")).toBeTruthy();
    expect(screen.queryByText(/simulated/i)).toBeNull();
    expect(screen.getByText(/cost basis, previous close, and latest quote value/i)).toBeTruthy();
  });

  it("uses stored hourly snapshots when enough history exists", () => {
    render(
      <PortfolioPerformanceChart
        totalValue={1060}
        dayChange={2}
        portfolioCreatedAt="2026-03-20T00:00:00.000Z"
        holdings={[holding]}
        historicalSnapshots={[
          {
            id: "snapshot-1",
            capturedAt: "2026-03-25T10:05:00.000Z",
            bucketStart: "2026-03-25T10:00:00.000Z",
            totalValue: 1000,
            costBasis: 800,
            dayChangePercent: 1.2,
            quoteCurrency: "USD",
            positionsCount: 1,
          },
          {
            id: "snapshot-2",
            capturedAt: "2026-03-25T11:05:00.000Z",
            bucketStart: "2026-03-25T11:00:00.000Z",
            totalValue: 1060,
            costBasis: 800,
            dayChangePercent: 2.1,
            quoteCurrency: "USD",
            positionsCount: 1,
          },
        ]}
      />,
    );

    expect(screen.getByText("Hourly snapshots")).toBeTruthy();
    expect(screen.getByText("Stored hourly values")).toBeTruthy();
    expect(screen.getByText(/hourly stored portfolio value history/i)).toBeTruthy();
    expect(screen.queryByText(/simulated/i)).toBeNull();
  });
});
