import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Holding } from "@/lib/types";

// Audit H9: every surface reads the canonical USD valuation, so a non-USD position shows the same
// converted figures in the holdings table, health concentration and chart, and an unpriced
// position is shown as unknown rather than as its allocation % or cost basis posing as dollars.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("@/lib/actions/portfolio", () => ({ recordHoldingAdd: vi.fn(), recordHoldingSale: vi.fn() }));
vi.mock("@/lib/actions/investment-thesis", () => ({
  getInvestmentThesisState: vi.fn().mockResolvedValue({ ok: true, thesis: null }),
  saveInvestmentThesis: vi.fn(),
  deleteInvestmentThesis: vi.fn(),
}));

import { PortfolioHoldingsTable } from "@/components/app/portfolio-holdings-table";
import { PortfolioPerformanceChart } from "@/components/app/portfolio-performance-chart";
import { calculatePortfolioHealth } from "@/lib/services/portfolio-health";
import { valueHoldings } from "@/lib/services/valuation";

function holding(overrides: Partial<Holding>): Holding {
  return {
    id: "h",
    symbol: "AAPL",
    company: "Apple",
    sector: "Technology",
    market: "US",
    source: "Manual",
    price: 110,
    dailyChange: 10,
    allocation: 0,
    thesis: "",
    quantity: 10,
    averageCost: 90,
    costBasis: 900,
    currentPrice: 110,
    currentValue: 1100,
    unrealizedGainAmount: 200,
    unrealizedGainPercent: 22.22,
    quoteCurrency: "USD",
    previousClose: 100,
    quoteAsOf: "2026-10-02T12:00:00.000Z",
    importSource: "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
    ...overrides,
  };
}

// C$200 x 10 at 0.75 → US$1,500; previous close C$180 → US$1,350; cost C$150 x 10 → US$1,125.
const shop = holding({
  id: "h2",
  symbol: "SHOP",
  company: "Shopify",
  price: 200,
  currentPrice: 200,
  previousClose: 180,
  averageCost: 150,
  costBasis: 1500, // stored in quote currency
  currentValue: 2000, // stored in quote currency
  quoteCurrency: "CAD",
  fxRateToUsd: 0.75,
});
const aapl = holding({ id: "h1" });
const unpriced = holding({
  id: "h3",
  symbol: "XYZ",
  company: "Unpriced Co",
  price: 0,
  currentPrice: 0,
  currentValue: 0,
  costBasis: 5000,
  allocation: 40,
});

describe("canonical valuation across surfaces", () => {
  it("holdings table shows USD value/cost/gain and the price in its own currency", () => {
    render(<PortfolioHoldingsTable portfolioId="p1" holdings={[aapl, shop, unpriced]} />);

    const shopRow = screen.getByRole("button", { name: /SHOP/ });
    expect(within(shopRow).getByText("CA$200.00")).toBeTruthy();
    expect(within(shopRow).getByText("$1,500.00")).toBeTruthy();
    expect(within(shopRow).getByText("$1,125.00")).toBeTruthy();
    expect(within(shopRow).queryByText("$2,000.00")).toBeNull();

    const unpricedRow = screen.getByRole("button", { name: /XYZ/ });
    expect(within(unpricedRow).queryByText("$40.00")).toBeNull();
    expect(within(unpricedRow).getAllByText("—").length).toBeGreaterThan(0);
  });

  it("health concentration and the table agree on the largest position", () => {
    const valuation = valueHoldings([aapl, shop, unpriced]);
    expect(valuation.totalValue).toBe(2600);

    const health = calculatePortfolioHealth({
      holdings: [aapl, shop, unpriced],
      now: new Date("2026-10-02T12:05:00.000Z"),
    });
    expect(health.factors.find((factor) => factor.id === "position_concentration")?.value).toBe("SHOP 58%");
  });

  it("chart live fallback uses the converted previous close", () => {
    render(
      <PortfolioPerformanceChart
        totalValue={2600}
        dayChange={0}
        portfolioCreatedAt="2026-01-01T00:00:00.000Z"
        holdings={[aapl, shop, unpriced]}
      />,
    );
    // (1100 + 1500) − (1000 + 1350) = +$250 against a $2,350 previous close.
    expect(screen.getByText(/Prev close \$2,350/)).toBeTruthy();
  });
});
