import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getQuotes } from "@/lib/services/yahoo-finance";
import { createServiceClient } from "@/lib/supabase/service";
import type { PortfolioValueSnapshot } from "@/lib/types";

type PortfolioRow = {
  id: string;
  user_id: string;
};

type HoldingSnapshotRow = {
  id: string;
  portfolio_id: string;
  symbol: string;
  quantity: number | string | null;
  average_cost: number | string | null;
  cost_basis: number | string | null;
  current_price: number | string | null;
  current_value: number | string | null;
  price: number | string | null;
  daily_change: number | string | null;
  quote_currency: string | null;
};

type Quote = {
  price: number;
  dailyChange: number;
  currency?: string;
};

type SnapshotWrite = {
  portfolio_id: string;
  user_id: string;
  captured_at: string;
  bucket_start: string;
  total_value: number;
  cost_basis: number;
  day_change_percent: number;
  quote_currency: string;
  positions_count: number;
  updated_at: string;
};

type HoldingQuoteUpdate = {
  id: string;
  portfolioId: string;
  price: number;
  dailyChange: number;
  currency: string;
  positionValue: number;
};

export type PortfolioValueSnapshotCronResult = {
  ran: true;
  bucketStart: string;
  capturedAt: string;
  portfoliosScanned: number;
  portfoliosSnapshotted: number;
  portfoliosSkipped: number;
  holdingsUpdated: number;
  quoteFetchError: string | null;
  errors: string[];
};

function toNumber(value: unknown): number {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function startOfUtcHour(date: Date): string {
  const bucket = new Date(date);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.toISOString();
}

function mapSnapshotRow(row: {
  id: string;
  captured_at: string;
  bucket_start: string;
  total_value: number | string | null;
  cost_basis: number | string | null;
  day_change_percent: number | string | null;
  quote_currency: string | null;
  positions_count: number | string | null;
}): PortfolioValueSnapshot {
  return {
    id: row.id,
    capturedAt: row.captured_at,
    bucketStart: row.bucket_start,
    totalValue: toNumber(row.total_value),
    costBasis: toNumber(row.cost_basis),
    dayChangePercent: toNumber(row.day_change_percent),
    quoteCurrency: row.quote_currency ?? "USD",
    positionsCount: Math.max(0, Math.round(toNumber(row.positions_count))),
  };
}

export async function loadPortfolioValueSnapshots(
  supabase: SupabaseClient,
  portfolioId: string,
  options: { limit?: number } = {},
): Promise<PortfolioValueSnapshot[]> {
  const limit = Math.min(Math.max(options.limit ?? 72, 1), 240);
  const { data, error } = await supabase
    .from("portfolio_value_snapshots")
    .select("id, captured_at, bucket_start, total_value, cost_basis, day_change_percent, quote_currency, positions_count")
    .eq("portfolio_id", portfolioId)
    .order("bucket_start", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []).map(mapSnapshotRow).reverse();
}

export async function recordPortfolioValueSnapshots(options: {
  now?: Date;
  maxPortfolios?: number;
} = {}): Promise<PortfolioValueSnapshotCronResult> {
  const now = options.now ?? new Date();
  const capturedAt = now.toISOString();
  const bucketStart = startOfUtcHour(now);
  const supabase = createServiceClient();
  const errors: string[] = [];

  let portfolioQuery = supabase
    .from("portfolios")
    .select("id, user_id")
    .order("created_at", { ascending: true });

  if (options.maxPortfolios && options.maxPortfolios > 0) {
    portfolioQuery = portfolioQuery.limit(options.maxPortfolios);
  }

  const { data: portfoliosData, error: portfoliosError } = await portfolioQuery;
  if (portfoliosError) {
    return {
      ran: true,
      bucketStart,
      capturedAt,
      portfoliosScanned: 0,
      portfoliosSnapshotted: 0,
      portfoliosSkipped: 0,
      holdingsUpdated: 0,
      quoteFetchError: null,
      errors: [portfoliosError.message],
    };
  }

  const portfolios = (portfoliosData ?? []) as PortfolioRow[];
  const portfolioIds = portfolios.map((portfolio) => portfolio.id);
  if (portfolioIds.length === 0) {
    return {
      ran: true,
      bucketStart,
      capturedAt,
      portfoliosScanned: 0,
      portfoliosSnapshotted: 0,
      portfoliosSkipped: 0,
      holdingsUpdated: 0,
      quoteFetchError: null,
      errors,
    };
  }

  const { data: holdingsData, error: holdingsError } = await supabase
    .from("holdings")
    .select("id, portfolio_id, symbol, quantity, average_cost, cost_basis, current_price, current_value, price, daily_change, quote_currency")
    .in("portfolio_id", portfolioIds);

  if (holdingsError) {
    return {
      ran: true,
      bucketStart,
      capturedAt,
      portfoliosScanned: portfolios.length,
      portfoliosSnapshotted: 0,
      portfoliosSkipped: portfolios.length,
      holdingsUpdated: 0,
      quoteFetchError: null,
      errors: [holdingsError.message],
    };
  }

  const holdings = (holdingsData ?? []) as HoldingSnapshotRow[];
  const symbols = [
    ...new Set(
      holdings
        .map((holding) => holding.symbol?.trim().toUpperCase())
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
  ];

  let quotes = new Map<string, Quote>();
  let quoteFetchError: string | null = null;
  if (symbols.length > 0) {
    try {
      quotes = await getQuotes(symbols);
    } catch (error) {
      quoteFetchError = error instanceof Error ? error.message : String(error);
    }
  }

  const holdingsByPortfolio = new Map<string, HoldingSnapshotRow[]>();
  for (const holding of holdings) {
    const existing = holdingsByPortfolio.get(holding.portfolio_id) ?? [];
    existing.push(holding);
    holdingsByPortfolio.set(holding.portfolio_id, existing);
  }

  const snapshotRows: SnapshotWrite[] = [];
  const quoteUpdates: HoldingQuoteUpdate[] = [];
  const portfolioTotals = new Map<string, number>();
  let portfoliosSkipped = 0;

  for (const portfolio of portfolios) {
    const portfolioHoldings = holdingsByPortfolio.get(portfolio.id) ?? [];
    if (portfolioHoldings.length === 0) {
      portfoliosSkipped += 1;
      continue;
    }

    let totalValue = 0;
    let costBasis = 0;
    let weightedDayChange = 0;
    let positionsCount = 0;
    let quoteCurrency = "USD";

    for (const holding of portfolioHoldings) {
      const symbol = holding.symbol.trim().toUpperCase();
      const quote = quotes.get(symbol);
      const quantity = toNumber(holding.quantity);
      const savedCurrentPrice = toNumber(holding.current_price);
      const savedLegacyPrice = toNumber(holding.price);
      const price =
        quote?.price ??
        (savedCurrentPrice > 0 ? savedCurrentPrice : savedLegacyPrice);
      const positionValue =
        quantity > 0
          ? quantity * price
          : toNumber(holding.current_value);
      const positionCost =
        quantity > 0
          ? quantity * toNumber(holding.average_cost)
          : toNumber(holding.cost_basis);

      if (positionValue <= 0) continue;

      positionsCount += 1;
      totalValue += positionValue;
      costBasis += positionCost;

      const dailyChange = quote?.dailyChange ?? toNumber(holding.daily_change);
      weightedDayChange += dailyChange * positionValue;
      quoteCurrency = quote?.currency ?? holding.quote_currency ?? quoteCurrency;

      if (quote) {
        quoteUpdates.push({
          id: holding.id,
          portfolioId: portfolio.id,
          price: quote.price,
          dailyChange: quote.dailyChange,
          currency: quote.currency ?? holding.quote_currency ?? "USD",
          positionValue,
        });
      }
    }

    if (totalValue <= 0 || positionsCount === 0) {
      portfoliosSkipped += 1;
      continue;
    }

    portfolioTotals.set(portfolio.id, totalValue);
    snapshotRows.push({
      portfolio_id: portfolio.id,
      user_id: portfolio.user_id,
      captured_at: capturedAt,
      bucket_start: bucketStart,
      total_value: roundMoney(totalValue),
      cost_basis: roundMoney(costBasis),
      day_change_percent: roundMoney(weightedDayChange / totalValue),
      quote_currency: quoteCurrency,
      positions_count: positionsCount,
      updated_at: capturedAt,
    });
  }

  let holdingsUpdated = 0;
  for (const update of quoteUpdates) {
    const portfolioTotal = portfolioTotals.get(update.portfolioId) ?? 0;
    const allocation =
      portfolioTotal > 0
        ? Math.round((update.positionValue / portfolioTotal) * 10_000) / 100
        : 0;
    const { error } = await supabase
      .from("holdings")
      .update({
        price: update.price,
        current_price: update.price,
        daily_change: update.dailyChange,
        quote_currency: update.currency,
        quote_as_of: capturedAt,
        allocation,
      })
      .eq("id", update.id)
      .eq("portfolio_id", update.portfolioId);

    if (error) {
      errors.push(`holding ${update.id}: ${error.message}`);
      continue;
    }

    holdingsUpdated += 1;
  }

  const portfoliosWithQuoteUpdates = [
    ...new Set(quoteUpdates.map((update) => update.portfolioId)),
  ];
  if (portfoliosWithQuoteUpdates.length > 0) {
    const { error } = await supabase
      .from("portfolios")
      .update({ last_synced_at: capturedAt, sync_status: "active" })
      .in("id", portfoliosWithQuoteUpdates);
    if (error) errors.push(`portfolios timestamp update: ${error.message}`);
  }

  let portfoliosSnapshotted = 0;
  if (snapshotRows.length > 0) {
    const { error } = await supabase
      .from("portfolio_value_snapshots")
      .upsert(snapshotRows, { onConflict: "portfolio_id,bucket_start" });
    if (error) {
      errors.push(`snapshot upsert: ${error.message}`);
    } else {
      portfoliosSnapshotted = snapshotRows.length;
    }
  }

  return {
    ran: true,
    bucketStart,
    capturedAt,
    portfoliosScanned: portfolios.length,
    portfoliosSnapshotted,
    portfoliosSkipped,
    holdingsUpdated,
    quoteFetchError,
    errors,
  };
}
