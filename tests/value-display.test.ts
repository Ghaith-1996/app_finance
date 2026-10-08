import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { describeOverview, formatSignedPercent, formatSignedUsd } from "@/lib/portfolio/value-display";
import type { PortfolioValuationSummary } from "@/lib/services/valuation";

vi.mock("@/lib/actions/portfolio", () => ({ refreshPortfolioPricingSnapshot: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { PortfolioValueCard } from "@/components/app/portfolio-value-card";

// Audit F11 (signed losses), F19 (real zero, no invented money/recency), B2/B3 notes.

const valuation = (overrides: Partial<PortfolioValuationSummary> = {}): PortfolioValuationSummary => ({
  baseCurrency: "USD",
  status: "complete",
  dayChangeAmount: -85,
  dayChangePercent: -0.3,
  freshCount: 2,
  staleCount: 0,
  unavailableSymbols: [],
  missingFxCurrencies: [],
  currencies: ["USD"],
  oldestQuoteAsOf: "2026-10-01T14:00:00.000Z",
  newestQuoteAsOf: "2026-10-01T15:00:00.000Z",
  ...overrides,
});

describe("value display contract", () => {
  it("keeps the minus sign on losses without relying on colour", () => {
    const display = describeOverview({ totalValue: 28_000, dayChange: -0.3, valuation: valuation() });
    expect(display.dayChangePercent).toBe("−0.30%");
    expect(display.dayChangeAmount).toBe("−$85");
    expect(display.direction).toBe("down");
  });

  it("formats gains with + and zero without a sign", () => {
    expect(formatSignedUsd(85)).toBe("+$85");
    expect(formatSignedUsd(0)).toBe("$0");
    expect(formatSignedPercent(0)).toBe("0.00%");
    expect(formatSignedPercent(1.234)).toBe("+1.23%");
  });

  it("shows a real zero portfolio as $0", () => {
    const display = describeOverview({
      totalValue: 0,
      dayChange: 0,
      valuation: valuation({ dayChangeAmount: 0, dayChangePercent: 0 }),
    });
    expect(display.value).toBe("$0");
  });

  it("shows unknown values as unknown", () => {
    const display = describeOverview({
      totalValue: 0,
      dayChange: 0,
      valuation: valuation({ status: "unavailable", dayChangeAmount: null, dayChangePercent: null }),
    });
    expect(display.value).toBe("—");
    expect(display.direction).toBe("unknown");
  });

  it("states partial valuations and USD conversion", () => {
    const display = describeOverview({
      totalValue: 1_000,
      dayChange: 0,
      valuation: valuation({
        status: "partial",
        unavailableSymbols: ["SHOP.TO"],
        missingFxCurrencies: ["CAD"],
        currencies: ["CAD", "USD"],
      }),
    });
    expect(display.notes.join(" ")).toMatch(/Excludes 1 position.*SHOP\.TO/);
    expect(display.notes.join(" ")).toMatch(/No USD exchange rate for CAD/);
    expect(display.notes.join(" ")).toMatch(/converted to USD/);
  });

  it("PortfolioValueCard never substitutes sample money or invented recency (F19)", () => {
    render(
      createElement(PortfolioValueCard, {
        portfolioId: "p1",
        initialOverview: { totalValue: 0, dayChange: 0, lastSyncedAt: "", valuation: valuation({ dayChangeAmount: 0, dayChangePercent: 0 }) },
      }),
    );
    expect(screen.getByText("$0")).toBeTruthy();
    expect(screen.queryByText(/17,900/)).toBeNull();
    expect(screen.queryByText(/2 mins ago/)).toBeNull();
    expect(screen.getByText("Not synced yet")).toBeTruthy();
  });
});
