import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Holding, PortfolioValueSnapshot } from "@/lib/types";

// Review R5: the "Since" change and the live "Now" point compare the current total with stored
// full-portfolio snapshots, so they must be suspended when the current valuation is unavailable
// (total 0) or partial (a subtotal), instead of showing a fictitious loss.

const chartData = vi.hoisted(() => ({ current: [] as { label: string; value: number }[] }));

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    AreaChart: ({ data }: { data: { label: string; value: number }[] }) => {
      chartData.current = data;
      return null;
    },
  };
});

import { PortfolioPerformanceChart } from "@/components/app/portfolio-performance-chart";
import { valueHoldings } from "@/lib/services/valuation";

function holding(overrides: Partial<Holding>): Holding {
  return {
    id: "h1",
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
    unrealizedGainPercent: 11.11,
    quoteCurrency: "USD",
    previousClose: 100,
    quoteAsOf: "2026-10-03T15:00:00.000Z",
    importSource: "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
    ...overrides,
  };
}

function snapshot(bucket: string, totalValue: number): PortfolioValueSnapshot {
  return {
    id: bucket,
    capturedAt: bucket,
    bucketStart: bucket,
    totalValue,
    costBasis: 900,
    dayChangePercent: 0,
    quoteCurrency: "USD",
    positionsCount: 2,
  };
}

const unpricedPrice = { price: 0, currentPrice: 0, currentValue: 0, previousClose: null };

function renderChart(holdings: Holding[], history: PortfolioValueSnapshot[]) {
  const valuation = valueHoldings(holdings);
  render(
    <PortfolioPerformanceChart
      totalValue={valuation.totalValue}
      dayChange={valuation.dayChangePercent ?? 0}
      valuation={valuation}
      portfolioCreatedAt="2026-09-01T00:00:00.000Z"
      holdings={holdings}
      historicalSnapshots={history}
    />,
  );
}

describe("performance chart compares only like-for-like values (R5)", () => {
  it("unavailable current prices: no 'Since' change and no 'Now' point", () => {
    renderChart(
      [holding({ ...unpricedPrice })],
      [snapshot("2026-10-01T10:00:00.000Z", 1000), snapshot("2026-10-02T10:00:00.000Z", 1010)],
    );

    expect(screen.queryByText(/Since Oct 1/)).toBeNull();
    expect(screen.queryByText(/-\$1,000|−\$1,000/)).toBeNull();
    expect(chartData.current.map((point) => point.label)).not.toContain("Now");
  });

  it("partial valuation: the subtotal is not appended as a drop from the full history", () => {
    renderChart(
      [holding({}), holding({ id: "h2", symbol: "XYZ", company: "Unpriced", ...unpricedPrice })],
      [snapshot("2026-10-01T10:00:00.000Z", 2500), snapshot("2026-10-02T10:00:00.000Z", 2500)],
    );

    expect(chartData.current.map((point) => point.label)).not.toContain("Now");
    expect(chartData.current.some((point) => point.value === 1000)).toBe(false);
    expect(screen.queryByText(/Since Oct 1/)).toBeNull();
  });

  it("complete valuation keeps the 'Since' change and the 'Now' point", () => {
    renderChart(
      [holding({}), holding({ id: "h2", symbol: "MSFT", company: "Microsoft" })],
      [snapshot("2026-10-01T10:00:00.000Z", 1900), snapshot("2026-10-02T10:00:00.000Z", 1950)],
    );

    expect(screen.getByText(/Since Oct 1: \+\$100/)).toBeTruthy();
    expect(chartData.current.at(-1)).toMatchObject({ label: "Now", value: 2000 });
  });
});
