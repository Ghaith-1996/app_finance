import { cached } from "@/lib/services/cache";
import { createLogger } from "@/lib/logger";
import type {
  LatestEarningsReportSource,
} from "@/lib/types";

const TD_BASE = "https://api.twelvedata.com";
const TIMEOUT_MS = 10_000;
const QUOTE_CACHE_TTL = 60_000;
const PROFILE_CACHE_TTL = 30 * 60_000;
const TS_CACHE_TTL = 5 * 60_000;
const STATS_CACHE_TTL = 30 * 60_000;
const EARNINGS_CACHE_TTL = 60 * 60_000;
const FUNDAMENTALS_CACHE_TTL = 60 * 60_000;

const log = createLogger("twelvedata");

function apiKey(): string {
  return process.env.TWELVE_DATA_API_KEY ?? "";
}

type FailureCode = "missing_key" | "unauthorized" | "rate_limited" | "timeout" | "plan_not_supported" | "network" | "unknown";

function classifyError(err: unknown): FailureCode {
  if (!(err instanceof Error)) return "unknown";
  const msg = err.message;
  if (msg.includes("not configured")) return "missing_key";
  if (msg.includes("HTTP 401")) return "unauthorized";
  if (msg.includes("HTTP 429")) return "rate_limited";
  if (msg.includes("HTTP 403")) return "plan_not_supported";
  if (msg.includes("timed out")) return "timeout";
  if (msg.startsWith("TwelveData HTTP")) return "unknown";
  return "network";
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = apiKey();
  if (!key) throw new Error("TWELVE_DATA_API_KEY is not configured.");
  const url = new URL(`${TD_BASE}${path}`);
  url.searchParams.set("apikey", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      log.error(`HTTP ${res.status} for ${path}`, { symbol: params.symbol });
      throw new Error(`TwelveData HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("TwelveData HTTP")) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      log.error(`Timeout after ${TIMEOUT_MS}ms for ${path}`, { symbol: params.symbol });
      throw new Error("TwelveData request timed out.");
    }
    log.error(`Network error for ${path}`, { symbol: params.symbol, error: String(err) });
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Raw Twelve Data response types
// ---------------------------------------------------------------------------

export interface TDQuote {
  symbol?: string;
  name?: string;
  exchange?: string;
  currency?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  volume?: string;
  average_volume?: string;
  fifty_two_week?: { low?: string; high?: string };
  market_cap?: number;
  is_market_open?: boolean;
}

export interface TDProfile {
  symbol?: string;
  name?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  country?: string;
  description?: string;
  website?: string;
  CEO?: string;
  employees?: number;
  type?: string;
}

export interface TDTimeSeriesValue {
  datetime: string;
  close: string;
  open?: string;
  high?: string;
  low?: string;
  volume?: string;
}

interface TDStatistics {
  statistics_type?: string;
  statistics?: {
    valuations_metrics?: {
      market_capitalization?: number;
      enterprise_value?: number;
      trailing_pe?: number;
      forward_pe?: number;
      peg_ratio?: number;
      price_to_sales_ttm?: number;
      price_to_book_mrq?: number;
      enterprise_to_revenue?: number;
      enterprise_to_ebitda?: number;
    };
    financials?: {
      fiscal_year_ends?: string;
      most_recent_quarter?: string;
      profit_margin?: number;
      operating_margin?: number;
      return_on_assets_ttm?: number;
      return_on_equity_ttm?: number;
      revenue_ttm?: number;
      revenue_per_share_ttm?: number;
      quarterly_revenue_growth?: number;
      gross_profit_ttm?: number;
      ebitda?: number;
      net_income_to_common_ttm?: number;
      diluted_eps_ttm?: number;
      quarterly_earnings_growth_yoy?: number;
      total_cash_mrq?: number;
      total_cash_per_share_mrq?: number;
      total_debt_mrq?: number;
      total_debt_to_equity_mrq?: number;
      current_ratio_mrq?: number;
      book_value_per_share_mrq?: number;
      operating_cash_flow_ttm?: number;
      levered_free_cash_flow_ttm?: number;
    };
    stock_statistics?: {
      shares_outstanding?: number;
      float_shares?: number;
      avg_10_volume?: number;
      avg_90_volume?: number;
      shares_short?: number;
      short_ratio?: number;
      percent_held_by_insiders?: number;
      percent_held_by_institutions?: number;
    };
    stock_price_summary?: {
      fifty_two_week_low?: number;
      fifty_two_week_high?: number;
      fifty_two_week_change?: number;
      beta?: number;
      day_50_ma?: number;
      day_200_ma?: number;
    };
    dividends_and_splits?: {
      forward_annual_dividend_rate?: number;
      forward_annual_dividend_yield?: number;
      trailing_annual_dividend_rate?: number;
      trailing_annual_dividend_yield?: number;
      payout_ratio?: number;
      ex_dividend_date?: string;
      last_split_factor?: string;
      last_split_date?: string;
    };
  };
}

interface TDEarningsEntry {
  date?: string;
  time?: string;
  eps_estimate?: number;
  eps_actual?: number;
  difference?: number;
  surprise_prc?: number;
  revenue_estimate?: number;
  revenue_actual?: number;
}

interface TDFinancialStatement {
  fiscal_date?: string;
  quarter?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Normalized app-level types
// ---------------------------------------------------------------------------

export interface ChartPoint {
  timestamp: string;
  close: number;
}

export interface EarningsDataPoint {
  date: string;
  epsEstimate: number | null;
  epsActual: number | null;
  surprise: number | null;
  revenueEstimate: number | null;
  revenueActual: number | null;
}

export interface FinancialDataPoint {
  fiscalDate: string;
  quarter: number | null;
  revenue: number | null;
  netIncome: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  freeCashFlow: number | null;
}

export interface SectionWarning {
  section: string;
  code: FailureCode;
  message: string;
}

export interface WatchlistDetailData {
  symbol: string;
  summary: {
    company: string;
    exchange: string;
    currency: string;
    price: number | null;
    change: number | null;
    changePercent: number | null;
    isMarketOpen: boolean | null;
  };
  chart: ChartPoint[];
  stats: {
    open: number | null;
    high: number | null;
    low: number | null;
    previousClose: number | null;
    volume: number | null;
    averageVolume: number | null;
    marketCap: number | null;
    fiftyTwoWeekHigh: number | null;
    fiftyTwoWeekLow: number | null;
    beta: number | null;
    pe: number | null;
    forwardPe: number | null;
    eps: number | null;
    dividendYield: number | null;
    profitMargin: number | null;
    revenueGrowth: number | null;
  };
  profile: {
    sector: string | null;
    industry: string | null;
    country: string | null;
    website: string | null;
    description: string | null;
    ceo: string | null;
    employees: number | null;
  };
  earnings: EarningsDataPoint[];
  financials: FinancialDataPoint[];
  capabilities: {
    hasStats: boolean;
    hasProfile: boolean;
    hasEarnings: boolean;
    hasFinancials: boolean;
  };
  warnings: SectionWarning[];
  error: string | null;
  latestEarningsReportUrl: string | null;
  latestEarningsReportSource: LatestEarningsReportSource | null;
  latestEarningsReportDate: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: string | number | undefined | null): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toNumericInput(value: unknown): string | number | undefined | null {
  if (value == null) return value;
  if (typeof value === "string" || typeof value === "number") return value;
  return undefined;
}

function emptyDetail(symbol: string): WatchlistDetailData {
  return {
    symbol,
    summary: { company: "", exchange: "", currency: "USD", price: null, change: null, changePercent: null, isMarketOpen: null },
    chart: [],
    stats: { open: null, high: null, low: null, previousClose: null, volume: null, averageVolume: null, marketCap: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, beta: null, pe: null, forwardPe: null, eps: null, dividendYield: null, profitMargin: null, revenueGrowth: null },
    profile: { sector: null, industry: null, country: null, website: null, description: null, ceo: null, employees: null },
    earnings: [],
    financials: [],
    capabilities: { hasStats: false, hasProfile: false, hasEarnings: false, hasFinancials: false },
    warnings: [],
    error: null,
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
  };
}

async function getProfileForSymbol(symbol: string) {
  return cached<TDProfile>(
    `td:profile:${symbol}`,
    () => get<TDProfile>("/profile", { symbol }),
    PROFILE_CACHE_TTL,
  );
}

export async function getCompanyWebsiteSeed(symbol: string): Promise<string | null> {
  if (!apiKey()) return null;

  const normalizedSymbol = symbol.trim().toUpperCase();
  if (!normalizedSymbol) return null;

  try {
    const profile = await getProfileForSymbol(normalizedSymbol);
    const website = profile?.website?.trim();
    return website || null;
  } catch (error) {
    log.warn("Website seed unavailable", {
      symbol: normalizedSymbol,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main aggregator
// ---------------------------------------------------------------------------

export async function getWatchlistDetail(symbol: string): Promise<WatchlistDetailData> {
  const result = emptyDetail(symbol);

  if (!apiKey()) {
    return { ...result, error: "TWELVE_DATA_API_KEY is not configured." };
  }

  const sym = symbol.toUpperCase();
  const warnings: SectionWarning[] = [];

  const [quoteRes, profileRes, tsRes, statsRes, earningsRes, incomeRes, balanceRes, cashFlowRes] = await Promise.allSettled([
    cached<TDQuote>(`td:quote:${sym}`, () => get<TDQuote>("/quote", { symbol: sym }), QUOTE_CACHE_TTL),
    getProfileForSymbol(sym),
    cached<{ values?: TDTimeSeriesValue[] }>(
      `td:ts:${sym}`,
      () => get<{ values?: TDTimeSeriesValue[] }>("/time_series", { symbol: sym, interval: "1day", outputsize: "30", order: "ASC" }),
      TS_CACHE_TTL,
    ),
    cached<TDStatistics>(
      `td:stats:${sym}`,
      () => get<TDStatistics>("/statistics", { symbol: sym }),
      STATS_CACHE_TTL,
    ),
    cached<TDEarningsEntry[]>(
      `td:earnings:${sym}`,
      async () => {
        const raw = await get<{ earnings?: TDEarningsEntry[] }>("/earnings", { symbol: sym, outputsize: "8", order: "ASC" });
        return raw.earnings ?? [];
      },
      EARNINGS_CACHE_TTL,
    ),
    cached<TDFinancialStatement[]>(
      `td:income:${sym}`,
      async () => {
        const raw = await get<{ income_statement?: TDFinancialStatement[] }>("/income_statement", { symbol: sym, period: "quarter" });
        return raw.income_statement ?? [];
      },
      FUNDAMENTALS_CACHE_TTL,
    ),
    cached<TDFinancialStatement[]>(
      `td:balance:${sym}`,
      async () => {
        const raw = await get<{ balance_sheet?: TDFinancialStatement[] }>("/balance_sheet", { symbol: sym, period: "quarter" });
        return raw.balance_sheet ?? [];
      },
      FUNDAMENTALS_CACHE_TTL,
    ),
    cached<TDFinancialStatement[]>(
      `td:cashflow:${sym}`,
      async () => {
        const raw = await get<{ cash_flow?: TDFinancialStatement[] }>("/cash_flow", { symbol: sym, period: "quarter" });
        return raw.cash_flow ?? [];
      },
      FUNDAMENTALS_CACHE_TTL,
    ),
  ]);

  const quote = quoteRes.status === "fulfilled" ? quoteRes.value : null;
  const profile = profileRes.status === "fulfilled" ? profileRes.value : null;
  const ts = tsRes.status === "fulfilled" ? tsRes.value : null;
  const stats = statsRes.status === "fulfilled" ? statsRes.value : null;
  const earningsRaw = earningsRes.status === "fulfilled" ? earningsRes.value : null;
  const incomeRaw = incomeRes.status === "fulfilled" ? incomeRes.value : null;
  const balanceRaw = balanceRes.status === "fulfilled" ? balanceRes.value : null;
  const cashFlowRaw = cashFlowRes.status === "fulfilled" ? cashFlowRes.value : null;

  const endpoints = [
    { name: "quote", res: quoteRes },
    { name: "profile", res: profileRes },
    { name: "time_series", res: tsRes },
    { name: "statistics", res: statsRes },
    { name: "earnings", res: earningsRes },
    { name: "income_statement", res: incomeRes },
    { name: "balance_sheet", res: balanceRes },
    { name: "cash_flow", res: cashFlowRes },
  ];
  for (const ep of endpoints) {
    if (ep.res.status === "rejected") {
      const code = classifyError(ep.res.reason);
      warnings.push({ section: ep.name, code, message: String((ep.res.reason as Error)?.message ?? ep.res.reason) });
    }
  }

  if (!quote && !profile && !ts) {
    return { ...result, warnings, error: "Could not load details for this symbol." };
  }

  // Summary
  result.summary = {
    company: profile?.name ?? quote?.name ?? "",
    exchange: profile?.exchange ?? quote?.exchange ?? "",
    currency: quote?.currency ?? "USD",
    price: toNum(quote?.close),
    change: toNum(quote?.change),
    changePercent: toNum(quote?.percent_change),
    isMarketOpen: quote?.is_market_open ?? null,
  };

  // Chart
  if (ts?.values && Array.isArray(ts.values)) {
    for (const v of ts.values) {
      const c = toNum(v.close);
      if (v.datetime && c != null) result.chart.push({ timestamp: v.datetime, close: c });
    }
  }

  // Stats — merge quote + statistics
  const sv = stats?.statistics?.valuations_metrics;
  const sf = stats?.statistics?.financials;
  const ss = stats?.statistics?.stock_statistics;
  const sp = stats?.statistics?.stock_price_summary;
  const sd = stats?.statistics?.dividends_and_splits;

  result.stats = {
    open: toNum(quote?.open),
    high: toNum(quote?.high),
    low: toNum(quote?.low),
    previousClose: toNum(quote?.previous_close),
    volume: toNum(quote?.volume),
    averageVolume: toNum(quote?.average_volume) ?? toNum(ss?.avg_10_volume),
    marketCap: toNum(quote?.market_cap) ?? toNum(sv?.market_capitalization),
    fiftyTwoWeekHigh: toNum(quote?.fifty_two_week?.high) ?? toNum(sp?.fifty_two_week_high),
    fiftyTwoWeekLow: toNum(quote?.fifty_two_week?.low) ?? toNum(sp?.fifty_two_week_low),
    beta: toNum(sp?.beta),
    pe: toNum(sv?.trailing_pe),
    forwardPe: toNum(sv?.forward_pe),
    eps: toNum(sf?.diluted_eps_ttm),
    dividendYield: toNum(sd?.forward_annual_dividend_yield),
    profitMargin: toNum(sf?.profit_margin),
    revenueGrowth: toNum(sf?.quarterly_revenue_growth),
  };

  // Profile
  result.profile = {
    sector: profile?.sector ?? null,
    industry: profile?.industry ?? null,
    country: profile?.country ?? null,
    website: profile?.website ?? null,
    description: profile?.description ?? null,
    ceo: profile?.CEO ?? null,
    employees: profile?.employees ?? null,
  };

  // Earnings
  if (earningsRaw && earningsRaw.length > 0) {
    result.earnings = earningsRaw
      .filter((e) => e.date)
      .map((e) => ({
        date: e.date!,
        epsEstimate: toNum(e.eps_estimate),
        epsActual: toNum(e.eps_actual),
        surprise: toNum(e.surprise_prc),
        revenueEstimate: toNum(e.revenue_estimate),
        revenueActual: toNum(e.revenue_actual),
      }));
  }

  // Financials — merge income, balance, cash flow by fiscal_date
  const financialMap = new Map<string, FinancialDataPoint>();
  const ensureEntry = (fd: string, q: number | null): FinancialDataPoint => {
    if (!financialMap.has(fd)) {
      financialMap.set(fd, { fiscalDate: fd, quarter: q, revenue: null, netIncome: null, totalDebt: null, totalCash: null, freeCashFlow: null });
    }
    return financialMap.get(fd)!;
  };

  for (const row of incomeRaw ?? []) {
    if (!row.fiscal_date) continue;
    const entry = ensureEntry(row.fiscal_date, row.quarter ?? null);
    entry.revenue = toNum(toNumericInput(row.sales ?? row.revenue));
    entry.netIncome = toNum(toNumericInput(row.net_income));
  }
  for (const row of balanceRaw ?? []) {
    if (!row.fiscal_date) continue;
    const entry = ensureEntry(row.fiscal_date, row.quarter ?? null);
    entry.totalDebt = toNum(toNumericInput(row.total_debt ?? row.long_term_debt));
    entry.totalCash = toNum(
      toNumericInput(
        row.cash_and_short_term_investments ?? row.cash_and_cash_equivalents,
      ),
    );
  }
  for (const row of cashFlowRaw ?? []) {
    if (!row.fiscal_date) continue;
    const entry = ensureEntry(row.fiscal_date, row.quarter ?? null);
    entry.freeCashFlow = toNum(toNumericInput(row.free_cash_flow));
  }
  result.financials = [...financialMap.values()].sort((a, b) => a.fiscalDate.localeCompare(b.fiscalDate));

  // Capabilities
  result.capabilities = {
    hasStats: stats != null,
    hasProfile: profile != null,
    hasEarnings: result.earnings.length > 0,
    hasFinancials: result.financials.length > 0,
  };

  result.warnings = warnings;
  return result;
}
