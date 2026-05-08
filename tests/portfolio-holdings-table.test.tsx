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

  it("renders an external earnings report action when a link exists", () => {
    render(
      <PortfolioHoldingsTable
        portfolioId="portfolio-1"
        holdings={[
          {
            ...baseHolding,
            latestEarningsReportUrl: "https://investor.apple.com/q1-2026-results",
            latestEarningsReportSource: "company",
            latestEarningsReportDate: "2026-04-30",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("link", { name: /aapl latest earnings report/i }),
    ).toHaveAttribute("href", "https://investor.apple.com/q1-2026-results");
  });

  it("renders a disabled report action when no link exists", () => {
    render(
      <PortfolioHoldingsTable
        portfolioId="portfolio-1"
        holdings={[
          baseHolding,
          {
            ...baseHolding,
            id: "holding-2",
            symbol: "MSFT",
            company: "Microsoft",
          },
        ]}
      />,
    );

    expect(
      screen.getByLabelText(/msft latest earnings report unavailable/i),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("shows stock details above the sell and buy controls when a holding is opened", () => {
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

    expect(panel.getByText(/stock details/i)).toBeInTheDocument();
    expect(panel.getByText(/^symbol$/i)).toBeInTheDocument();
    expect(panel.getByText(/^company$/i)).toBeInTheDocument();
    expect(panel.getByText(/^current price$/i)).toBeInTheDocument();
    expect(panel.getByText(/^day %$/i)).toBeInTheDocument();
    expect(panel.getByText(/^current value$/i)).toBeInTheDocument();
    expect(panel.getAllByText("AAPL").length).toBeGreaterThan(0);
    expect(panel.getByText("Apple Inc.")).toBeInTheDocument();
    expect(panel.getByText("$100.00")).toBeInTheDocument();
    expect(panel.getByText("+1.20%")).toBeInTheDocument();
    expect(panel.getByText("$200.00")).toBeInTheDocument();
    expect(panel.getByText(/sold shares/i)).toBeInTheDocument();
    expect(panel.getByText(/added shares/i)).toBeInTheDocument();
  });
});
