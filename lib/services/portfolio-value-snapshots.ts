import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getFxRatesToBase } from "@/lib/services/fx";
import {
  buildHoldingPricingPlan,
  PRICING_HOLDING_COLUMNS,
  type PricingHoldingRow,
  type PricingQuote,
} from "@/lib/services/holding-pricing";
import { getQuotes } from "@/lib/services/yahoo-finance";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { createServiceClient } from "@/lib/supabase/service";
import type { PortfolioValueSnapshot } from "@/lib/types";

type PortfolioRow = {
  id: string;
  user_id: string;
};

const PORTFOLIO_BATCH_SIZE = 50;

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
  valuation_version: number;
  updated_at: string;
};

/**
 * Unit of total_value/cost_basis (review R3). 2 = USD-normalized canonical valuation. Rows from
 * before migration 041 are NULL: per-holding currency sums that cannot be compared or converted,
 * so they are never charted next to current rows.
 */
export const SNAPSHOT_VALUATION_VERSION = 2;

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

function startOfUtcHour(date: Date): string {
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
    .eq("valuation_version", SNAPSHOT_VALUATION_VERSION)
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

  const maxPortfolios = options.maxPortfolios && options.maxPortfolios > 0
    ? Math.floor(options.maxPortfolios)
    : null;
  let portfoliosScanned = 0;
  let portfoliosSnapshotted = 0;
  let portfoliosSkipped = 0;
  let holdingsUpdated = 0;
  let quoteFetchError: string | null = null;
  let lastPortfolioId: string | null = null;

  while (maxPortfolios === null || portfoliosScanned < maxPortfolios) {
    const batchSize = maxPortfolios === null
      ? PORTFOLIO_BATCH_SIZE
      : Math.min(PORTFOLIO_BATCH_SIZE, maxPortfolios - portfoliosScanned);
    let query = supabase.from("portfolios").select("id, user_id")
      .order("id", { ascending: true }).limit(batchSize);
    if (lastPortfolioId) query = query.gt("id", lastPortfolioId);
    const { data, error: portfoliosError } = await query;
    if (portfoliosError) {
      errors.push(portfoliosError.message);
      break;
    }
    const portfolios = (data ?? []) as PortfolioRow[];
    if (portfolios.length === 0) break;
    portfoliosScanned += portfolios.length;
    lastPortfolioId = portfolios[portfolios.length - 1].id;

    // Read every holding, but only for this batch. Never value a truncated portfolio.
    const { data: holdings, error: holdingsError } = await fetchAllRows<
      PricingHoldingRow & { portfolio_id: string }
    >((from, to) =>
      supabase
        .from("holdings")
        .select(`portfolio_id, ${PRICING_HOLDING_COLUMNS}`)
        .in("portfolio_id", portfolios.map((portfolio) => portfolio.id))
        .order("id", { ascending: true })
        .range(from, to),
    );
    if (holdingsError) {
      errors.push(holdingsError.message);
      portfoliosSkipped += portfolios.length;
      continue;
    }

    const symbols = [
      ...new Set(
        holdings
          .map((holding) => holding.symbol?.trim().toUpperCase())
          .filter((symbol): symbol is string => Boolean(symbol)),
      ),
    ];
    let quotes: Map<string, PricingQuote> = new Map();
    if (symbols.length > 0) {
      try {
        quotes = await getQuotes(symbols);
      } catch (error) {
        quoteFetchError ??= error instanceof Error ? error.message : String(error);
      }
    }
    const fxRates = await getFxRatesToBase([
      ...[...quotes.values()].map((quote) => quote.currency),
      ...holdings.map((holding) => holding.quote_currency),
    ]);

    const holdingsByPortfolio = new Map<string, PricingHoldingRow[]>();
    for (const holding of holdings) {
      const existing = holdingsByPortfolio.get(holding.portfolio_id) ?? [];
      existing.push(holding);
      holdingsByPortfolio.set(holding.portfolio_id, existing);
    }

    const snapshotRows: SnapshotWrite[] = [];
    for (const portfolio of portfolios) {
      const portfolioHoldings = holdingsByPortfolio.get(portfolio.id) ?? [];
      if (portfolioHoldings.length === 0) {
        portfoliosSkipped += 1;
        continue;
      }

      const plan = buildHoldingPricingPlan(portfolioHoldings, quotes, fxRates, capturedAt);
      if (plan.refreshedSymbols.length > 0) {
        const { error } = await supabase.rpc("apply_holding_price_updates", {
          p_portfolio_id: portfolio.id,
          p_updates: plan.updates,
          p_sync_state: plan.syncState,
          p_synced_at: capturedAt,
        });
        if (error) {
          errors.push(`portfolio ${portfolio.id} price update: ${error.message}`);
        } else {
          holdingsUpdated += plan.refreshedSymbols.length;
        }
      }

      const valuation = plan.valuation;
      // A history point must describe the whole portfolio; skip rather than record a partial total.
      if (valuation.status !== "complete" || valuation.totalValue <= 0) {
        portfoliosSkipped += 1;
        if (valuation.status === "partial") {
          errors.push(
            `portfolio ${portfolio.id} snapshot skipped: no value for ${valuation.unavailableSymbols.join(", ")}`,
          );
        }
        continue;
      }

      snapshotRows.push({
        portfolio_id: portfolio.id,
        user_id: portfolio.user_id,
        captured_at: capturedAt,
        bucket_start: bucketStart,
        total_value: roundMoney(valuation.totalValue),
        cost_basis: roundMoney(valuation.costBasis),
        day_change_percent: roundMoney(valuation.dayChangePercent ?? 0),
        quote_currency: valuation.baseCurrency,
        positions_count: valuation.freshCount + valuation.staleCount,
        valuation_version: SNAPSHOT_VALUATION_VERSION,
        updated_at: capturedAt,
      });
    }

    // Persist this batch before fetching more portfolios, quotes or holdings.
    if (snapshotRows.length > 0) {
      const { error } = await supabase
        .from("portfolio_value_snapshots")
        .upsert(snapshotRows, { onConflict: "portfolio_id,bucket_start" });
      if (error) {
        errors.push(`snapshot upsert: ${error.message}`);
      } else {
        portfoliosSnapshotted += snapshotRows.length;
      }
    }
  }

  return {
    ran: true,
    bucketStart,
    capturedAt,
    portfoliosScanned,
    portfoliosSnapshotted,
    portfoliosSkipped,
    holdingsUpdated,
    quoteFetchError,
    errors,
  };
}
