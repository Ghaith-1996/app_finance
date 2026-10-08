import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Holding } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/actions/portfolio", () => ({
  recordHoldingAdd: vi.fn(),
  recordHoldingSale: vi.fn(),
}));

vi.mock("@/lib/actions/investment-thesis", () => ({
  getInvestmentThesisState: vi.fn().mockResolvedValue({ ok: true, thesis: null }),
  saveInvestmentThesis: vi.fn(),
  deleteInvestmentThesis: vi.fn(),
}));

import { PortfolioHoldingsTable } from "@/components/app/portfolio-holdings-table";

const baseHolding: Holding = {
  id: "holding-1",
  symbol: "AAPL",
  company: "Apple Inc.",
  sector: "Technology",
  market: "US",
  source: "Manual",
  price: 100,
  dailyChange: 1.2,
  allocation: 50,
  thesis: "",
  quantity: 2,
  averageCost: 90,
  costBasis: 180,
  currentPrice: 100,
  currentValue: 200,
  unrealizedGainAmount: 20,
  unrealizedGainPercent: 11.11,
  quoteCurrency: "USD",
  quoteAsOf: "2026-04-20T12:00:00.000Z",
  importSource: "manual",
  latestEarningsReportUrl: null,
  latestEarningsReportSource: null,
  latestEarningsReportDate: null,
};

describe("PortfolioHoldingsTable", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the selected holding's current price, day change, and value", () => {
    render(
      <PortfolioHoldingsTable
        portfolioId="portfolio-1"
        holdings={[baseHolding]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /aapl/i }));

    const adjustPanel = screen.getByRole("region", {
      name: /adjust position aapl/i,
    });
    const panel = within(adjustPanel);

    expect(panel.getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(panel.getByText("Apple Inc.")).toBeInTheDocument();
    expect(panel.getByText("$100.00")).toBeInTheDocument();
    expect(panel.getByText("+1.20%")).toBeInTheDocument();
    expect(panel.getByText("$200.00")).toBeInTheDocument();
  });
});
