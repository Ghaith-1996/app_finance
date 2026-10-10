import type { FxRate } from "@/lib/services/fx";
import {
  BASE_CURRENCY,
  normalizeCurrencyCode,
  valuationInputFromHoldingRow,
  valuePortfolio,
  type PortfolioValuation,
} from "@/lib/services/valuation";

/**
 * Builds one whole-portfolio price update (audit B3). Holdings without a new quote keep their
 * last-known price; allocations are recomputed over everything that can be valued, so they never
 * exceed 100%. `syncState` is "complete" only when every holding received a fresh quote and a
 * fresh USD conversion; a reused stored FX rate still values the position, but the portfolio must
 * then be marked stale, not freshly synced.
 */

export const PRICING_HOLDING_COLUMNS =
  "id, symbol, quantity, current_price, price, previous_close, daily_change, average_cost, quote_currency, fx_rate_to_usd, fx_as_of, quote_as_of";

export type PricingHoldingRow = {
  id: string;
  symbol: string;
  quantity: number | string | null;
  current_price: number | string | null;
  price: number | string | null;
  previous_close: number | string | null;
  daily_change: number | string | null;
  average_cost: number | string | null;
  quote_currency: string | null;
  fx_rate_to_usd: number | string | null;
  fx_as_of: string | null;
  quote_as_of: string | null;
};

export type PricingQuote = {
  price: number;
  previousClose?: number | null;
  dailyChange: number;
  currency?: string;
};

export type HoldingPriceUpdate = {
  id: string;
  allocation: number;
  price?: number;
  previousClose?: number | null;
  dailyChange?: number;
  currency?: string;
  quoteAsOf?: string;
  fxRateToUsd?: number | null;
  fxAsOf?: string | null;
};

export type HoldingPricingPlan = {
  updates: HoldingPriceUpdate[];
  refreshedSymbols: string[];
  missingQuoteSymbols: string[];
  /** Non-USD currencies whose fresh quotes were converted with a previously stored FX rate. */
  staleFxCurrencies: string[];
  syncState: "complete" | "partial";
  valuation: PortfolioValuation;
};

function roundAllocation(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function buildHoldingPricingPlan(
  rows: PricingHoldingRow[],
  quotes: Map<string, PricingQuote>,
  fxRates: Map<string, FxRate>,
  nowIso: string,
): HoldingPricingPlan {
  const refreshedSymbols: string[] = [];
  const missingQuoteSymbols: string[] = [];
  const staleFxCurrencies = new Set<string>();

  const merged = rows.map((row) => {
    const symbol = row.symbol.trim().toUpperCase();
    const quote = quotes.get(symbol);
    if (!quote || !(quote.price > 0)) {
      missingQuoteSymbols.push(symbol);
      return { row, quoteFields: null };
    }

    refreshedSymbols.push(symbol);
    const currency = normalizeCurrencyCode(quote.currency ?? row.quote_currency);
    const fx = fxRates.get(currency);
    const sameCurrency = normalizeCurrencyCode(row.quote_currency) === currency;
    // Without a new rate, a previously stored rate for the same currency is kept with its own
    // timestamp; a changed currency without a rate becomes unavailable (NULL).
    const fxRateToUsd = fx
      ? fx.rateToBase
      : currency === BASE_CURRENCY
        ? 1
        : sameCurrency && row.fx_rate_to_usd !== null
          ? Number(row.fx_rate_to_usd)
          : null;
    const fxAsOf = fx ? fx.asOf : currency === BASE_CURRENCY ? nowIso : sameCurrency ? row.fx_as_of : null;
    if (!fx && currency !== BASE_CURRENCY && fxRateToUsd !== null) staleFxCurrencies.add(currency);

    const quoteFields = {
      price: quote.price,
      previousClose: quote.previousClose && quote.previousClose > 0 ? quote.previousClose : null,
      dailyChange: quote.dailyChange,
      currency,
      quoteAsOf: nowIso,
      fxRateToUsd,
      fxAsOf,
    };

    return {
      row: {
        ...row,
        current_price: quote.price,
        price: quote.price,
        previous_close: quoteFields.previousClose,
        daily_change: quote.dailyChange,
        quote_currency: currency,
        fx_rate_to_usd: fxRateToUsd,
        fx_as_of: fxAsOf,
        quote_as_of: nowIso,
      },
      quoteFields,
    };
  });

  const valuation = valuePortfolio(
    merged.map(({ row }) => valuationInputFromHoldingRow(row)),
    { now: new Date(nowIso) },
  );

  const updates: HoldingPriceUpdate[] = merged.map(({ row, quoteFields }, index) => ({
    id: row.id,
    allocation: roundAllocation(valuation.positions[index]?.allocationPercent ?? null),
    ...(quoteFields ?? {}),
  }));

  const syncState =
    missingQuoteSymbols.length === 0 && staleFxCurrencies.size === 0 && valuation.status === "complete"
      ? "complete"
      : "partial";

  return {
    updates,
    refreshedSymbols,
    missingQuoteSymbols,
    staleFxCurrencies: [...staleFxCurrencies].sort(),
    syncState,
    valuation,
  };
}
