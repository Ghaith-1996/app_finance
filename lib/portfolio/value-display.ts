import type { PortfolioOverview, PortfolioPricingRefreshResult } from "@/lib/types";

/**
 * Display rules shared by every portfolio value surface (audit F10, F11, F19, B2, B3):
 * - a real 0 is shown as $0; an unknown value is shown as "—", never as sample money;
 * - signs are always explicit (+/−) so direction never depends on colour;
 * - the day change amount comes from the canonical valuation, not percentage × current total;
 * - partial valuations and USD conversion are stated.
 */

export const UNKNOWN_VALUE = "—";
const MINUS = "−";

const usd = (fractionDigits: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

export function formatSignedUsd(value: number, fractionDigits = 0): string {
  const rounded = Number(value.toFixed(fractionDigits));
  if (rounded === 0) return usd(fractionDigits).format(0);
  const sign = rounded > 0 ? "+" : MINUS;
  return `${sign}${usd(fractionDigits).format(Math.abs(rounded))}`;
}

export function formatSignedPercent(value: number, fractionDigits = 2): string {
  const rounded = Number(value.toFixed(fractionDigits));
  if (rounded === 0) return `${(0).toFixed(fractionDigits)}%`;
  const sign = rounded > 0 ? "+" : MINUS;
  return `${sign}${Math.abs(rounded).toFixed(fractionDigits)}%`;
}

export type ChangeDirection = "up" | "down" | "flat" | "unknown";

export type OverviewDisplay = {
  value: string;
  dayChangePercent: string;
  dayChangeAmount: string | null;
  direction: ChangeDirection;
  /** Plain-language qualifiers: partial valuation, conversion, missing rates. */
  notes: string[];
  /** Newest quote time the figures are based on (ISO), when known. */
  asOf: string | null;
};

type OverviewInput = Pick<PortfolioOverview, "totalValue" | "dayChange" | "valuation">;

export function describeOverview(overview: OverviewInput, fractionDigits = 0): OverviewDisplay {
  const valuation = overview.valuation;
  const unavailable = valuation?.status === "unavailable";
  const percent = valuation ? valuation.dayChangePercent : overview.dayChange;
  const amount = valuation ? valuation.dayChangeAmount : null;

  const notes: string[] = [];
  if (valuation?.status === "partial") {
    const count = valuation.unavailableSymbols.length;
    notes.push(
      `Excludes ${count} position${count === 1 ? "" : "s"} without a price or USD rate (${valuation.unavailableSymbols.join(", ")}).`,
    );
  }
  if (valuation?.missingFxCurrencies.length) {
    notes.push(`No USD exchange rate for ${valuation.missingFxCurrencies.join(", ")}.`);
  }
  if (valuation && valuation.currencies.some((currency) => currency !== valuation.baseCurrency)) {
    notes.push("Non-USD positions are converted to USD at the rate stored with each quote.");
  }

  return {
    value: unavailable ? UNKNOWN_VALUE : usd(fractionDigits).format(overview.totalValue),
    dayChangePercent: percent === null || unavailable ? UNKNOWN_VALUE : formatSignedPercent(percent),
    dayChangeAmount: amount === null || unavailable ? null : formatSignedUsd(amount, fractionDigits),
    direction:
      percent === null || unavailable ? "unknown" : percent > 0 ? "up" : percent < 0 ? "down" : "flat",
    notes,
    asOf: valuation?.newestQuoteAsOf ?? null,
  };
}

/** A refresh that saved prices (complete or partial) carries a fresh overview to show. */
export function refreshedOverview(result: PortfolioPricingRefreshResult): PortfolioOverview | null {
  return (result.status === "updated" || result.status === "partial") && result.overview
    ? result.overview
    : null;
}
