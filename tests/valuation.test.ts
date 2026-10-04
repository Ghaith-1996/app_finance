import { describe, expect, it } from "vitest";

import { buildHoldingPricingPlan, type PricingHoldingRow } from "@/lib/services/holding-pricing";
import { formatQuoteAmount, valuePortfolio, type ValuationHoldingInput } from "@/lib/services/valuation";

const NOW = new Date("2026-10-01T15:00:00.000Z");
const FRESH = "2026-10-01T14:55:00.000Z";
const OLD = "2026-09-30T20:00:00.000Z";

function usd(symbol: string, overrides: Partial<ValuationHoldingInput> = {}): ValuationHoldingInput {
  return { symbol, quantity: 1, price: 100, currency: "USD", quoteAsOf: FRESH, ...overrides };
}

describe("valuePortfolio — B5 aggregate day return", () => {
  it("equal prior values moving +20% and -20% net to 0%", () => {
    const valuation = valuePortfolio(
      [usd("UP", { price: 120, previousClose: 100 }), usd("DOWN", { price: 80, previousClose: 100 })],
      { now: NOW },
    );
    expect(valuation.dayChangePercent).toBeCloseTo(0, 10);
    expect(valuation.dayChangeAmount).toBeCloseTo(0, 10);
  });

  it("uses previous-close weights, not current weights (audit +25% case, was +70%)", () => {
    const valuation = valuePortfolio(
      [usd("A", { price: 200, dailyChangePercent: 100 }), usd("B", { price: 50, dailyChangePercent: -50 })],
      { now: NOW },
    );
    expect(valuation.dayChangePercent).toBeCloseTo(25, 10);
    expect(valuation.dayChangeAmount).toBeCloseTo(50, 10);
  });

  it("handles unequal weights", () => {
    // 3 × 100→110 and 1 × 100→60: prev 400, now 390.
    const valuation = valuePortfolio(
      [usd("A", { quantity: 3, price: 110, previousClose: 100 }), usd("B", { price: 60, previousClose: 100 })],
      { now: NOW },
    );
    expect(valuation.dayChangePercent).toBeCloseTo(-2.5, 10);
  });

  it("excludes positions with missing or zero previous close from both legs", () => {
    const valuation = valuePortfolio(
      [
        usd("A", { price: 110, previousClose: 100 }),
        usd("NEW", { price: 500, previousClose: null, dailyChangePercent: null }),
        usd("ZERO", { price: 50, previousClose: 0, dailyChangePercent: null }),
      ],
      { now: NOW },
    );
    expect(valuation.dayChangePercent).toBeCloseTo(10, 10);
    expect(valuation.totalValue).toBe(660);
  });

  it("reports unknown day change rather than 0 when no previous close exists", () => {
    const valuation = valuePortfolio([usd("A", { previousClose: null, dailyChangePercent: null })], { now: NOW });
    expect(valuation.dayChangePercent).toBeNull();
    expect(valuation.dayChangeAmount).toBeNull();
  });
});

describe("valuePortfolio — B2 currency units", () => {
  const cad = (overrides: Partial<ValuationHoldingInput> = {}) =>
    usd("SHOP.TO", { currency: "CAD", fxRateToBase: 0.73, ...overrides });

  it("converts CAD to USD before aggregation", () => {
    const valuation = valuePortfolio([usd("AAPL"), cad()], { now: NOW });
    expect(valuation.totalValue).toBeCloseTo(173, 10);
    expect(valuation.baseCurrency).toBe("USD");
    expect(valuation.currencies).toEqual(["CAD", "USD"]);
    expect(valuation.status).toBe("complete");
  });

  it("is independent of holding order", () => {
    const a = valuePortfolio([usd("AAPL"), cad()], { now: NOW });
    const b = valuePortfolio([cad(), usd("AAPL")], { now: NOW });
    expect(b.totalValue).toBe(a.totalValue);
    expect(b.baseCurrency).toBe(a.baseCurrency);
  });

  it("never sums an unconverted amount: missing FX makes the position unavailable", () => {
    const valuation = valuePortfolio([usd("AAPL"), cad({ fxRateToBase: null })], { now: NOW });
    expect(valuation.totalValue).toBe(100);
    expect(valuation.status).toBe("partial");
    expect(valuation.missingFxCurrencies).toEqual(["CAD"]);
    expect(valuation.unavailableSymbols).toEqual(["SHOP.TO"]);
    expect(valuation.positions[1]).toMatchObject({ status: "unavailable", unavailableReason: "no_fx", valueBase: null });
  });

  it("converts cost basis with the same rate", () => {
    const valuation = valuePortfolio([cad({ averageCost: 50, quantity: 2 })], { now: NOW });
    expect(valuation.costBasis).toBeCloseTo(73, 10);
  });

  it("CAD-only portfolio is converted, not labelled as USD", () => {
    const valuation = valuePortfolio([cad({ quantity: 10 })], { now: NOW });
    expect(valuation.totalValue).toBeCloseTo(730, 10);
  });
});

describe("valuePortfolio — freshness and zero values", () => {
  it("distinguishes fresh, stale and unavailable prices", () => {
    const valuation = valuePortfolio(
      [usd("FRESH"), usd("STALE", { quoteAsOf: OLD }), usd("NONE", { price: 0 })],
      { now: NOW },
    );
    expect(valuation.positions.map((p) => p.status)).toEqual(["fresh", "stale", "unavailable"]);
    expect(valuation.freshCount).toBe(1);
    expect(valuation.staleCount).toBe(1);
    expect(valuation.oldestQuoteAsOf).toBe(OLD);
    expect(valuation.newestQuoteAsOf).toBe(FRESH);
  });

  it("a zero-quantity holding contributes zero, never an invented amount", () => {
    const valuation = valuePortfolio([usd("A", { quantity: 0 })], { now: NOW });
    expect(valuation.totalValue).toBe(0);
  });

  it("empty and fully unpriced portfolios are explicit", () => {
    expect(valuePortfolio([], { now: NOW }).status).toBe("empty");
    expect(valuePortfolio([usd("A", { price: 0 })], { now: NOW }).status).toBe("unavailable");
  });
});

function row(id: string, symbol: string, overrides: Partial<PricingHoldingRow> = {}): PricingHoldingRow {
  return {
    id,
    symbol,
    quantity: 1,
    current_price: 100,
    price: 100,
    previous_close: 100,
    daily_change: 0,
    average_cost: 90,
    quote_currency: "USD",
    fx_rate_to_usd: 1,
    fx_as_of: OLD,
    quote_as_of: OLD,
    ...overrides,
  };
}

const usdRates = new Map([["USD", { rateToBase: 1, asOf: NOW.toISOString() }]]);

describe("buildHoldingPricingPlan — B3 partial quote refresh", () => {
  it("keeps allocations coherent when only one of two equal holdings gets a quote", () => {
    const plan = buildHoldingPricingPlan(
      [row("a", "AAA"), row("b", "BBB")],
      new Map([["AAA", { price: 100, previousClose: 100, dailyChange: 0, currency: "USD" }]]),
      usdRates,
      NOW.toISOString(),
    );
    const allocations = plan.updates.map((update) => update.allocation);
    expect(allocations).toEqual([50, 50]);
    expect(allocations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 6);
    expect(plan.syncState).toBe("partial");
    expect(plan.missingQuoteSymbols).toEqual(["BBB"]);
    expect(plan.refreshedSymbols).toEqual(["AAA"]);
    // BBB is not re-stamped as freshly quoted.
    expect(plan.updates[1]).toEqual({ id: "b", allocation: 50 });
    expect(plan.valuation.positions[1].status).toBe("stale");
  });

  it("marks a complete refresh complete", () => {
    const plan = buildHoldingPricingPlan(
      [row("a", "AAA"), row("b", "BBB", { quantity: 3 })],
      new Map([
        ["AAA", { price: 100, previousClose: 100, dailyChange: 0, currency: "USD" }],
        ["BBB", { price: 100, previousClose: 100, dailyChange: 0, currency: "USD" }],
      ]),
      usdRates,
      NOW.toISOString(),
    );
    expect(plan.syncState).toBe("complete");
    expect(plan.updates.map((update) => update.allocation)).toEqual([25, 75]);
    expect(plan.updates[0]).toMatchObject({ price: 100, quoteAsOf: NOW.toISOString(), fxRateToUsd: 1 });
  });

  it("an unpriced holding has 0 allocation and the rest still sums to 100%", () => {
    const plan = buildHoldingPricingPlan(
      [row("a", "AAA"), row("b", "NEW", { current_price: 0, price: 0 })],
      new Map([["AAA", { price: 100, previousClose: 100, dailyChange: 0, currency: "USD" }]]),
      usdRates,
      NOW.toISOString(),
    );
    expect(plan.updates.map((update) => update.allocation)).toEqual([100, 0]);
    expect(plan.valuation.status).toBe("partial");
    expect(plan.syncState).toBe("partial");
  });

  it("stores the FX rate with a CAD quote and stays partial when the rate is missing", () => {
    const withRate = buildHoldingPricingPlan(
      [row("a", "SHOP.TO", { quote_currency: "CAD", fx_rate_to_usd: null, fx_as_of: null })],
      new Map([["SHOP.TO", { price: 100, previousClose: 98, dailyChange: 2.04, currency: "CAD" }]]),
      new Map([["CAD", { rateToBase: 0.73, asOf: "2026-10-01T14:59:00.000Z" }]]),
      NOW.toISOString(),
    );
    expect(withRate.updates[0]).toMatchObject({ fxRateToUsd: 0.73, fxAsOf: "2026-10-01T14:59:00.000Z", currency: "CAD" });
    expect(withRate.syncState).toBe("complete");

    const withoutRate = buildHoldingPricingPlan(
      [row("a", "SHOP.TO", { quote_currency: "CAD", fx_rate_to_usd: null, fx_as_of: null })],
      new Map([["SHOP.TO", { price: 100, previousClose: 98, dailyChange: 2.04, currency: "CAD" }]]),
      usdRates,
      NOW.toISOString(),
    );
    expect(withoutRate.updates[0]).toMatchObject({ fxRateToUsd: null });
    expect(withoutRate.syncState).toBe("partial");
    expect(withoutRate.valuation.missingFxCurrencies).toEqual(["CAD"]);
  });
});

describe("formatQuoteAmount — R4 minor currency units", () => {
  it("shows pence, cents and agorot in their major currency instead of 100x too high", () => {
    expect(formatQuoteAmount(100, "GBp")).toBe("£1.00");
    expect(formatQuoteAmount(12_345, "GBX")).toBe("£123.45");
    expect(formatQuoteAmount(250, "ZAc").replace(/\s/u, " ")).toBe("ZAR 2.50");
    expect(formatQuoteAmount(990, "ILA")).toBe("₪9.90");
  });

  it("leaves major currencies unchanged", () => {
    expect(formatQuoteAmount(100, "GBP")).toBe("£100.00");
    expect(formatQuoteAmount(45, "CAD")).toBe("CA$45.00");
    expect(formatQuoteAmount(45, null)).toBe("$45.00");
  });
});
