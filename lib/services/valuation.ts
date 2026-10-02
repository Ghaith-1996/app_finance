/**
 * Canonical portfolio valuation (audit B2, B3, B5, H9).
 *
 * Contract:
 * - Every aggregate is in BASE_CURRENCY (USD). A position is converted with the FX rate
 *   that was stored alongside its quote (`fxRateToBase`, quote currency → USD). A position
 *   without a positive price or without an FX rate is "unavailable": it is excluded from
 *   totals and allocations and reported, never summed in its local currency.
 * - Day change is aggregate: (Σ current value − Σ previous-close value) / Σ previous-close
 *   value, over positions with a known previous close. Both legs use the same FX rate, so
 *   the figure is the local-price move expressed in USD (FX moves are not attributed).
 *   Intraday contributions/withdrawals are not tracked: today's quantity is applied to the
 *   previous close. Splits are reflected only once the quote provider adjusts previousClose.
 * - Allocations are each position's share of the valued total, so they always sum to
 *   ~100% of what was valued; `status: "partial"` says some positions were not valued.
 * - A price is "fresh" when its quote is newer than QUOTE_FRESH_WINDOW_MS, otherwise
 *   "stale" (last known).
 */

export const BASE_CURRENCY = "USD";
export const QUOTE_FRESH_WINDOW_MS = 30 * 60_000;

export type PriceStatus = "fresh" | "stale" | "unavailable";
export type UnavailableReason = "no_price" | "no_fx";
export type ValuationStatus = "complete" | "partial" | "unavailable" | "empty";

export type ValuationHoldingInput = {
  symbol: string;
  quantity: number;
  /** Latest price in the quote currency. */
  price: number;
  /** Previous close in the quote currency, when the provider supplied it. */
  previousClose?: number | null;
  /** Fallback when previousClose is missing: today's percentage move. */
  dailyChangePercent?: number | null;
  averageCost?: number | null;
  currency?: string | null;
  /** Quote-currency → BASE_CURRENCY multiplier stored with the quote. */
  fxRateToBase?: number | null;
  quoteAsOf?: string | null;
};

export type PositionValuation = {
  symbol: string;
  currency: string;
  status: PriceStatus;
  unavailableReason: UnavailableReason | null;
  valueBase: number | null;
  previousValueBase: number | null;
  costBasisBase: number | null;
  allocationPercent: number | null;
};

export type PortfolioValuation = {
  baseCurrency: string;
  status: ValuationStatus;
  totalValue: number;
  costBasis: number;
  previousCloseValue: number;
  dayChangeAmount: number | null;
  dayChangePercent: number | null;
  positions: PositionValuation[];
  freshCount: number;
  staleCount: number;
  unavailableSymbols: string[];
  missingFxCurrencies: string[];
  currencies: string[];
  oldestQuoteAsOf: string | null;
  newestQuoteAsOf: string | null;
};

/** Client-safe subset carried on PortfolioOverview. */
export type PortfolioValuationSummary = Pick<
  PortfolioValuation,
  | "baseCurrency"
  | "status"
  | "dayChangeAmount"
  | "dayChangePercent"
  | "freshCount"
  | "staleCount"
  | "unavailableSymbols"
  | "missingFxCurrencies"
  | "currencies"
  | "oldestQuoteAsOf"
  | "newestQuoteAsOf"
>;

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

export function normalizeCurrencyCode(currency: string | null | undefined): string {
  const code = (currency ?? "").trim();
  return code || BASE_CURRENCY;
}

function previousCloseFor(input: ValuationHoldingInput, price: number): number | null {
  const previousClose = finite(input.previousClose);
  if (previousClose !== null && previousClose > 0) return previousClose;
  const pct = finite(input.dailyChangePercent);
  if (pct === null || pct <= -100) return null;
  return price / (1 + pct / 100);
}

export function valuePortfolio(
  holdings: ValuationHoldingInput[],
  options: { now?: Date } = {},
): PortfolioValuation {
  const nowMs = (options.now ?? new Date()).getTime();
  const currencies = new Set<string>();
  const missingFx = new Set<string>();
  const unavailableSymbols: string[] = [];
  let freshCount = 0;
  let staleCount = 0;
  let totalValue = 0;
  let costBasis = 0;
  let currentForReturn = 0;
  let previousForReturn = 0;
  let oldestMs = Number.POSITIVE_INFINITY;
  let newestMs = Number.NEGATIVE_INFINITY;

  const positions: PositionValuation[] = holdings.map((holding) => {
    const symbol = holding.symbol.trim().toUpperCase();
    const currency = normalizeCurrencyCode(holding.currency);
    currencies.add(currency);
    const quantity = Math.max(0, finite(holding.quantity) ?? 0);
    const price = finite(holding.price) ?? 0;
    const fx = currency === BASE_CURRENCY ? 1 : finite(holding.fxRateToBase);

    const unavailable = (reason: UnavailableReason): PositionValuation => {
      unavailableSymbols.push(symbol);
      if (reason === "no_fx") missingFx.add(currency);
      return {
        symbol,
        currency,
        status: "unavailable",
        unavailableReason: reason,
        valueBase: null,
        previousValueBase: null,
        costBasisBase: null,
        allocationPercent: null,
      };
    };

    if (price <= 0) return unavailable("no_price");
    if (fx === null || fx <= 0) return unavailable("no_fx");

    const quoteMs = holding.quoteAsOf ? Date.parse(holding.quoteAsOf) : Number.NaN;
    const status: PriceStatus =
      Number.isFinite(quoteMs) && nowMs - quoteMs <= QUOTE_FRESH_WINDOW_MS ? "fresh" : "stale";
    if (status === "fresh") freshCount += 1;
    else staleCount += 1;
    if (Number.isFinite(quoteMs)) {
      oldestMs = Math.min(oldestMs, quoteMs);
      newestMs = Math.max(newestMs, quoteMs);
    }

    const valueBase = quantity * price * fx;
    const averageCost = finite(holding.averageCost);
    const costBasisBase = averageCost !== null && averageCost >= 0 ? quantity * averageCost * fx : null;
    const previousClose = previousCloseFor(holding, price);
    const previousValueBase = previousClose !== null ? quantity * previousClose * fx : null;

    totalValue += valueBase;
    if (costBasisBase !== null) costBasis += costBasisBase;
    if (previousValueBase !== null) {
      currentForReturn += valueBase;
      previousForReturn += previousValueBase;
    }

    return {
      symbol,
      currency,
      status,
      unavailableReason: null,
      valueBase,
      previousValueBase,
      costBasisBase,
      allocationPercent: null,
    };
  });

  for (const position of positions) {
    if (position.valueBase !== null && totalValue > 0) {
      position.allocationPercent = (position.valueBase / totalValue) * 100;
    }
  }

  const valuedCount = freshCount + staleCount;
  const status: ValuationStatus =
    holdings.length === 0
      ? "empty"
      : valuedCount === 0
        ? "unavailable"
        : unavailableSymbols.length > 0
          ? "partial"
          : "complete";

  const dayChangeAmount = previousForReturn > 0 ? currentForReturn - previousForReturn : null;
  const dayChangePercent =
    previousForReturn > 0 ? ((currentForReturn - previousForReturn) / previousForReturn) * 100 : null;

  return {
    baseCurrency: BASE_CURRENCY,
    status,
    totalValue,
    costBasis,
    previousCloseValue: previousForReturn,
    dayChangeAmount,
    dayChangePercent,
    positions,
    freshCount,
    staleCount,
    unavailableSymbols,
    missingFxCurrencies: [...missingFx].sort(),
    currencies: [...currencies].sort(),
    oldestQuoteAsOf: Number.isFinite(oldestMs) ? new Date(oldestMs).toISOString() : null,
    newestQuoteAsOf: Number.isFinite(newestMs) ? new Date(newestMs).toISOString() : null,
  };
}

export function summarizeValuation(valuation: PortfolioValuation): PortfolioValuationSummary {
  return {
    baseCurrency: valuation.baseCurrency,
    status: valuation.status,
    dayChangeAmount: valuation.dayChangeAmount,
    dayChangePercent: valuation.dayChangePercent,
    freshCount: valuation.freshCount,
    staleCount: valuation.staleCount,
    unavailableSymbols: valuation.unavailableSymbols,
    missingFxCurrencies: valuation.missingFxCurrencies,
    currencies: valuation.currencies,
    oldestQuoteAsOf: valuation.oldestQuoteAsOf,
    newestQuoteAsOf: valuation.newestQuoteAsOf,
  };
}

type HoldingRowLike = {
  symbol?: unknown;
  quantity?: unknown;
  current_price?: unknown;
  price?: unknown;
  previous_close?: unknown;
  daily_change?: unknown;
  average_cost?: unknown;
  quote_currency?: unknown;
  fx_rate_to_usd?: unknown;
  quote_as_of?: unknown;
};

/** Maps a `holdings` row (snake_case) to valuation input. */
export function valuationInputFromHoldingRow(row: HoldingRowLike): ValuationHoldingInput {
  const currentPrice = finite(row.current_price) ?? 0;
  return {
    symbol: String(row.symbol ?? ""),
    quantity: finite(row.quantity) ?? 0,
    price: currentPrice > 0 ? currentPrice : (finite(row.price) ?? 0),
    previousClose: finite(row.previous_close),
    dailyChangePercent: finite(row.daily_change),
    averageCost: finite(row.average_cost),
    currency: typeof row.quote_currency === "string" ? row.quote_currency : null,
    fxRateToBase: finite(row.fx_rate_to_usd),
    quoteAsOf: typeof row.quote_as_of === "string" ? row.quote_as_of : null,
  };
}

/** Columns needed by valuationInputFromHoldingRow. */
export const VALUATION_HOLDING_COLUMNS =
  "symbol, quantity, current_price, price, previous_close, daily_change, average_cost, quote_currency, fx_rate_to_usd, quote_as_of";

type HoldingLike = {
  symbol: string;
  quantity: number;
  currentPrice: number;
  price: number;
  previousClose?: number | null;
  dailyChange: number;
  averageCost: number;
  quoteCurrency: string;
  fxRateToUsd?: number | null;
  quoteAsOf: string | null;
};

/** Maps an app-level Holding (camelCase) to valuation input. */
export function valuationInputFromHolding(holding: HoldingLike): ValuationHoldingInput {
  return {
    symbol: holding.symbol,
    quantity: holding.quantity,
    price: holding.currentPrice > 0 ? holding.currentPrice : holding.price,
    previousClose: holding.previousClose ?? null,
    dailyChangePercent: holding.dailyChange,
    averageCost: holding.averageCost,
    currency: holding.quoteCurrency,
    fxRateToBase: holding.fxRateToUsd ?? null,
    quoteAsOf: holding.quoteAsOf,
  };
}

/**
 * Values app-level holdings with the canonical contract (audit H9). `positions[i]` corresponds to
 * `holdings[i]`, so per-row surfaces read the same USD figures the portfolio totals are built from.
 */
export function valueHoldings(holdings: HoldingLike[], options: { now?: Date } = {}): PortfolioValuation {
  return valuePortfolio(holdings.map(valuationInputFromHolding), options);
}

/** Formats an amount in its own quote currency (e.g. "CA$45.00"); USD amounts keep "$". */
export function formatQuoteAmount(amount: number, currency: string | null | undefined): string {
  const code = normalizeCurrencyCode(currency);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${code}`;
  }
}
