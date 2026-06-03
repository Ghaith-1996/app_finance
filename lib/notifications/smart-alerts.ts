import "server-only";

import { createLogger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

type SupabaseLike = ReturnType<typeof createServiceClient>;

export type SmartAlertType =
  | "critical_news"
  | "earnings_report"
  | "price_move"
  | "concentration";

export type SmartAlertSeverity = "low" | "medium" | "high";

type PreferenceRow = {
  user_id: string;
  critical_news_alerts_enabled: boolean | null;
  earnings_report_alerts_enabled: boolean | null;
  price_move_alerts_enabled: boolean | null;
  price_move_threshold_percent: number | string | null;
  concentration_alerts_enabled: boolean | null;
  concentration_threshold_percent: number | string | null;
};

type PortfolioRow = {
  id: string;
  user_id: string;
  name: string;
};

type HoldingRow = {
  id: string;
  symbol: string;
  company: string | null;
  sector: string | null;
  quantity: number | string | null;
  current_price: number | string | null;
  price: number | string | null;
  current_value: number | string | null;
  cost_basis: number | string | null;
  daily_change: number | string | null;
};

type AnalysisRunRow = {
  id: string;
  completed_at: string | null;
};

type CriticalNewsRow = {
  id: string;
  relevance_score: number | null;
  why_it_matters: string | null;
  ai_summary: string | null;
  holdings: string[] | null;
  news_items:
    | {
        id: string;
        headline: string;
        source: string;
        published_at: string;
        category: string | null;
      }
    | Array<{
        id: string;
        headline: string;
        source: string;
        published_at: string;
        category: string | null;
      }>
    | null;
};

type EarningsReportRow = {
  symbol: string;
  preferred_url: string | null;
  url_source: string | null;
  report_date: string | null;
  title: string | null;
};

type NotificationAlertInsert = {
  user_id: string;
  portfolio_id: string | null;
  alert_type: SmartAlertType;
  severity: SmartAlertSeverity;
  title: string;
  message: string;
  action_href: string;
  source_table: string | null;
  source_id: string | null;
  dedupe_key: string;
  payload: Record<string, unknown>;
  triggered_at: string;
};

export type SmartAlertsCronResult = {
  ran: true;
  triggeredAt: string;
  usersScanned: number;
  portfoliosScanned: number;
  alertsGenerated: number;
  errors: Array<{ userId: string; message: string }>;
};

const log = createLogger("smart-alerts");
const CRITICAL_NEWS_CATEGORIES = new Set([
  "earnings",
  "geopolitics",
  "macro",
  "regulation",
]);

function asNumber(value: number | string | null | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function dayBucket(now: Date) {
  return now.toISOString().slice(0, 10);
}

function publishedSince(now: Date, hours: number) {
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

function normalizeSymbol(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase();
}

function holdingValue(holding: HoldingRow) {
  const currentValue = asNumber(holding.current_value);
  if (currentValue > 0) return currentValue;

  const price = asNumber(holding.current_price) || asNumber(holding.price);
  const quantity = asNumber(holding.quantity);
  if (price > 0 && quantity > 0) return price * quantity;

  const costBasis = asNumber(holding.cost_basis);
  return costBasis > 0 ? costBasis : 0;
}

function isCriticalNews(row: CriticalNewsRow) {
  const news = Array.isArray(row.news_items) ? row.news_items[0] : row.news_items;
  const category = String(news?.category ?? "other").toLowerCase();
  const text = `${news?.headline ?? ""} ${row.why_it_matters ?? ""} ${row.ai_summary ?? ""}`.toLowerCase();

  return (
    CRITICAL_NEWS_CATEGORIES.has(category) ||
    text.includes("risk") ||
    text.includes("pressure") ||
    text.includes("lawsuit") ||
    text.includes("downgrade") ||
    text.includes("regulation")
  );
}

function alertSeverityFromNews(row: CriticalNewsRow): SmartAlertSeverity {
  const news = Array.isArray(row.news_items) ? row.news_items[0] : row.news_items;
  const category = String(news?.category ?? "").toLowerCase();
  if (category === "geopolitics" || category === "regulation") return "high";
  return asNumber(row.relevance_score) >= 85 ? "high" : "medium";
}

async function loadAlertPreferences(supabase: SupabaseLike): Promise<PreferenceRow[]> {
  const { data, error } = await supabase
    .from("user_notification_preferences")
    .select(
      "user_id, critical_news_alerts_enabled, earnings_report_alerts_enabled, price_move_alerts_enabled, price_move_threshold_percent, concentration_alerts_enabled, concentration_threshold_percent",
    )
    .or(
      "critical_news_alerts_enabled.eq.true,earnings_report_alerts_enabled.eq.true,price_move_alerts_enabled.eq.true,concentration_alerts_enabled.eq.true",
    );

  if (error) throw new Error(error.message);
  return (data ?? []) as PreferenceRow[];
}

async function loadUserPortfolios(
  supabase: SupabaseLike,
  userId: string,
): Promise<PortfolioRow[]> {
  const { data, error } = await supabase
    .from("portfolios")
    .select("id, user_id, name")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);
  return (data ?? []) as PortfolioRow[];
}

async function loadHoldings(
  supabase: SupabaseLike,
  portfolioId: string,
): Promise<HoldingRow[]> {
  const { data, error } = await supabase
    .from("holdings")
    .select(
      "id, symbol, company, sector, quantity, current_price, price, current_value, cost_basis, daily_change",
    )
    .eq("portfolio_id", portfolioId);

  if (error) throw new Error(error.message);
  return (data ?? []) as HoldingRow[];
}

async function loadLatestAnalysisRun(
  supabase: SupabaseLike,
  portfolioId: string,
): Promise<AnalysisRunRow | null> {
  const { data, error } = await supabase
    .from("analysis_runs")
    .select("id, completed_at")
    .eq("portfolio_id", portfolioId)
    .in("status", ["complete", "degraded"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AnalysisRunRow | null) ?? null;
}

async function buildCriticalNewsAlerts(input: {
  supabase: SupabaseLike;
  preference: PreferenceRow;
  portfolio: PortfolioRow;
  now: Date;
}): Promise<NotificationAlertInsert[]> {
  if (!input.preference.critical_news_alerts_enabled) return [];

  const latestRun = await loadLatestAnalysisRun(input.supabase, input.portfolio.id);
  if (!latestRun) return [];

  const { data, error } = await input.supabase
    .from("feed_items")
    .select(`
      id,
      relevance_score,
      why_it_matters,
      ai_summary,
      holdings,
      news_items!inner (
        id,
        headline,
        source,
        published_at,
        category
      )
    `)
    .eq("analysis_run_id", latestRun.id)
    .eq("portfolio_id", input.portfolio.id)
    .gte("news_items.published_at", publishedSince(input.now, 24))
    .order("relevance_score", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);

  return ((data ?? []) as unknown as CriticalNewsRow[])
    .filter(isCriticalNews)
    .slice(0, 5)
    .map((row) => {
      const news = Array.isArray(row.news_items) ? row.news_items[0] : row.news_items;
      const newsItemId = news?.id ?? "";
      const headline = news?.headline ?? "Critical portfolio news";
      const symbols = (row.holdings ?? []).map(normalizeSymbol).filter(Boolean);

      return {
        user_id: input.preference.user_id,
        portfolio_id: input.portfolio.id,
        alert_type: "critical_news",
        severity: alertSeverityFromNews(row),
        title: symbols.length > 0 ? `${symbols.join(", ")} news risk` : "Portfolio news risk",
        message: row.why_it_matters || row.ai_summary || headline,
        action_href: newsItemId ? `/feed?story=${encodeURIComponent(newsItemId)}` : "/feed",
        source_table: "feed_items",
        source_id: row.id,
        dedupe_key: `${input.portfolio.id}:${row.id}`,
        payload: {
          newsItemId,
          headline,
          source: news?.source ?? null,
          category: news?.category ?? null,
          relevanceScore: row.relevance_score ?? null,
          symbols,
        },
        triggered_at: input.now.toISOString(),
      } satisfies NotificationAlertInsert;
    });
}

async function buildEarningsAlerts(input: {
  supabase: SupabaseLike;
  preference: PreferenceRow;
  portfolio: PortfolioRow;
  holdings: HoldingRow[];
  now: Date;
}): Promise<NotificationAlertInsert[]> {
  if (!input.preference.earnings_report_alerts_enabled) return [];

  const symbols = [
    ...new Set(input.holdings.map((holding) => normalizeSymbol(holding.symbol)).filter(Boolean)),
  ];
  if (symbols.length === 0) return [];

  const { data, error } = await input.supabase
    .from("ticker_earnings_reports")
    .select("symbol, preferred_url, url_source, report_date, title")
    .eq("is_active", true)
    .in("symbol", symbols);

  if (error) throw new Error(error.message);

  return ((data ?? []) as EarningsReportRow[])
    .filter((row) => row.preferred_url)
    .slice(0, 10)
    .map((row) => ({
      user_id: input.preference.user_id,
      portfolio_id: input.portfolio.id,
      alert_type: "earnings_report",
      severity: "medium",
      title: `${normalizeSymbol(row.symbol)} earnings report`,
      message: row.title || "A latest earnings-report link is available for this holding.",
      action_href: "/portfolio/full",
      source_table: "ticker_earnings_reports",
      source_id: normalizeSymbol(row.symbol),
      dedupe_key: `${input.portfolio.id}:${normalizeSymbol(row.symbol)}:${row.report_date ?? row.preferred_url}`,
      payload: {
        symbol: normalizeSymbol(row.symbol),
        reportDate: row.report_date,
        urlSource: row.url_source,
        preferredUrl: row.preferred_url,
      },
      triggered_at: input.now.toISOString(),
    }));
}

function buildPriceMoveAlerts(input: {
  preference: PreferenceRow;
  portfolio: PortfolioRow;
  holdings: HoldingRow[];
  now: Date;
}): NotificationAlertInsert[] {
  if (!input.preference.price_move_alerts_enabled) return [];

  const threshold = Math.abs(asNumber(input.preference.price_move_threshold_percent, 5));
  const bucket = dayBucket(input.now);

  return input.holdings
    .filter((holding) => Math.abs(asNumber(holding.daily_change)) >= threshold)
    .slice(0, 10)
    .map((holding) => {
      const symbol = normalizeSymbol(holding.symbol);
      const change = asNumber(holding.daily_change);
      const direction = change >= 0 ? "up" : "down";

      return {
        user_id: input.preference.user_id,
        portfolio_id: input.portfolio.id,
        alert_type: "price_move",
        severity: Math.abs(change) >= threshold * 1.5 ? "high" : "medium",
        title: `${symbol} moved ${direction} ${Math.abs(change).toFixed(2)}%`,
        message: `${symbol} crossed your ${threshold}% daily move alert threshold.`,
        action_href: `/feed?ticker=${encodeURIComponent(symbol)}`,
        source_table: "holdings",
        source_id: holding.id,
        dedupe_key: `${input.portfolio.id}:${symbol}:${bucket}`,
        payload: {
          symbol,
          dailyChange: change,
          thresholdPercent: threshold,
          company: holding.company,
        },
        triggered_at: input.now.toISOString(),
      } satisfies NotificationAlertInsert;
    });
}

function buildConcentrationAlerts(input: {
  preference: PreferenceRow;
  portfolio: PortfolioRow;
  holdings: HoldingRow[];
  now: Date;
}): NotificationAlertInsert[] {
  if (!input.preference.concentration_alerts_enabled) return [];

  const threshold = asNumber(input.preference.concentration_threshold_percent, 35);
  const valued = input.holdings
    .map((holding) => ({ holding, value: holdingValue(holding) }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value);
  const total = valued.reduce((sum, item) => sum + item.value, 0);
  const top = valued[0];
  if (!top || total <= 0) return [];

  const percent = (top.value / total) * 100;
  if (percent < threshold) return [];

  const symbol = normalizeSymbol(top.holding.symbol);
  return [
    {
      user_id: input.preference.user_id,
      portfolio_id: input.portfolio.id,
      alert_type: "concentration",
      severity: percent >= threshold * 1.25 ? "high" : "medium",
      title: `${symbol} concentration is ${Math.round(percent)}%`,
      message: `${symbol} is above your ${threshold}% largest-position alert threshold.`,
      action_href: "/portfolio/full",
      source_table: "holdings",
      source_id: top.holding.id,
      dedupe_key: `${input.portfolio.id}:${symbol}:${dayBucket(input.now)}`,
      payload: {
        symbol,
        percent,
        thresholdPercent: threshold,
        company: top.holding.company,
      },
      triggered_at: input.now.toISOString(),
    },
  ];
}

async function persistAlerts(
  supabase: SupabaseLike,
  alerts: NotificationAlertInsert[],
) {
  if (alerts.length === 0) return;

  const { error } = await supabase
    .from("notification_alerts")
    .upsert(alerts, {
      onConflict: "user_id,alert_type,dedupe_key",
      ignoreDuplicates: true,
    });

  if (error) throw new Error(error.message);
}

export async function runSmartAlertsCron(input?: {
  now?: Date;
  supabase?: SupabaseLike;
}): Promise<SmartAlertsCronResult> {
  const supabase = input?.supabase ?? createServiceClient();
  const now = input?.now ?? new Date();
  const preferences = await loadAlertPreferences(supabase);

  let portfoliosScanned = 0;
  let alertsGenerated = 0;
  const errors: SmartAlertsCronResult["errors"] = [];

  for (const preference of preferences) {
    try {
      const portfolios = await loadUserPortfolios(supabase, preference.user_id);

      for (const portfolio of portfolios) {
        portfoliosScanned += 1;
        const holdings = await loadHoldings(supabase, portfolio.id);
        const alertGroups = await Promise.all([
          buildCriticalNewsAlerts({ supabase, preference, portfolio, now }),
          buildEarningsAlerts({ supabase, preference, portfolio, holdings, now }),
          Promise.resolve(buildPriceMoveAlerts({ preference, portfolio, holdings, now })),
          Promise.resolve(buildConcentrationAlerts({ preference, portfolio, holdings, now })),
        ]);
        const alerts = alertGroups.flat();
        alertsGenerated += alerts.length;
        await persistAlerts(supabase, alerts);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ userId: preference.user_id, message });
      log.warn("Smart alert generation failed for user", {
        userId: preference.user_id,
        error: message,
      });
    }
  }

  return {
    ran: true,
    triggeredAt: now.toISOString(),
    usersScanned: preferences.length,
    portfoliosScanned,
    alertsGenerated,
    errors,
  };
}
