import "server-only";

import {
  attachLatestEarningsReportFields,
  loadActiveEarningsReportsBySymbols,
} from "@/lib/services/earnings-reports";
import { isAdminUser } from "@/lib/security/admin";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_FEED_PAGE_SIZE,
  type FeedResponsePayload,
  resolveFeedPayload,
} from "@/lib/server/feed";
import { newsWindowCutoffIso } from "@/lib/services/news/pool-snapshot";
import { loadPortfolioValueSnapshots } from "@/lib/services/portfolio-value-snapshots";
import {
  calculatePortfolioHealth,
  type PortfolioHealthResult,
} from "@/lib/services/portfolio-health";
import type {
  Holding,
  PortfolioFeedHighlight,
  PortfolioInsight,
  PortfolioOverview,
  PortfolioValueSnapshot,
} from "@/lib/types";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

type PortfolioSummary = {
  id: string;
  name: string;
  sourceType: string;
  syncStatus: string;
  lastSyncedAt: string | null;
  createdAt: string;
};

export type HomeDashboardEarningsItem = {
  symbol: string;
  title: string;
  reportDate: string | null;
  source: string | null;
  href: string;
};

export type HomeDashboardDigest = {
  id: string;
  digestDate: string;
  summaryLine: string;
  storyCount: number;
  bullishSymbols: string[];
  bearishSymbols: string[];
};

export type HomeDashboardNotificationState = {
  emailDigestEnabled: boolean;
  smsDigestEnabled: boolean;
  hasPhoneNumber: boolean;
  smartAlertRuleCount: number;
};

export type HomeDashboardAlert = {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  actionHref: string;
  createdAt: string;
};

export type HomeDashboardChangeItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "good" | "watch" | "risk" | "neutral";
};

export type HomeDashboardActivityItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  occurredAt: string;
  type: "sync" | "analysis" | "digest" | "alert" | "earnings" | "thesis" | "saved";
};

export type HomeDashboardTimelineItem = HomeDashboardActivityItem;

export type HomeDashboardRiskRadarItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "good" | "watch" | "risk" | "neutral";
};

export type HomeDashboardFreshnessItem = {
  id: string;
  label: string;
  value: string;
  detail: string;
  href: string;
  tone: "good" | "watch" | "risk" | "neutral";
};

export type HomeDashboardData = {
  portfolioId: string | null;
  portfolioName: string | null;
  overview: PortfolioOverview;
  health: PortfolioHealthResult;
  insights: PortfolioInsight[];
  topStories: PortfolioFeedHighlight[];
  earnings: HomeDashboardEarningsItem[];
  latestDigest: HomeDashboardDigest | null;
  notifications: HomeDashboardNotificationState;
  recentAlerts: HomeDashboardAlert[];
  whatChanged: HomeDashboardChangeItem[];
  activity: HomeDashboardActivityItem[];
  timeline: HomeDashboardTimelineItem[];
  riskRadar: HomeDashboardRiskRadarItem[];
  freshness: HomeDashboardFreshnessItem[];
  marketStoryCount24h: number;
  matchedStoryCount24h: number;
};

type HoldingRow = {
  id: string;
  symbol: string;
  company: string;
  sector: string;
  market: string;
  source: string;
  price: number | null;
  daily_change: number | null;
  allocation: number | null;
  thesis: string | null;
  quantity: number | null;
  average_cost: number | null;
  cost_basis: number | null;
  current_price: number | null;
  current_value: number | null;
  unrealized_gain_amount: number | null;
  unrealized_gain_percent: number | null;
  quote_currency: string | null;
  quote_as_of: string | null;
  import_source: string | null;
};

type AuthenticatedPageContext = {
  supabase: ServerSupabase;
  userId: string | null;
  showOnboardingNav: boolean;
  showAdminLink: boolean;
  portfolios: PortfolioSummary[];
  primaryPortfolioId: string | null;
};

const FEED_OVERVIEW_FALLBACK: PortfolioOverview = {
  totalValue: 0,
  dayChange: 0,
  monthlyChange: 0,
  lastSyncedAt: "-",
  lastAnalyzedAt: "Never",
  coverage: "0 high-signal stories",
  primaryGoal: "Add a portfolio and run analysis.",
};

const PORTFOLIO_OVERVIEW_FALLBACK: PortfolioOverview = {
  totalValue: 17900,
  dayChange: -1.92,
  monthlyChange: 0,
  lastSyncedAt: "2 mins ago",
  lastAnalyzedAt: "21 hours ago",
  coverage: "0 stories",
  primaryGoal: "Add holdings and run analysis.",
};

const ANALYSIS_OVERVIEW_FALLBACK: PortfolioOverview = {
  totalValue: 0,
  dayChange: 0,
  monthlyChange: 0,
  lastSyncedAt: "-",
  lastAnalyzedAt: "Never",
  coverage: "0 stories",
  primaryGoal: "Add a portfolio and run analysis.",
};

const FULL_OVERVIEW_FALLBACK: PortfolioOverview = {
  totalValue: 0,
  dayChange: 0,
  monthlyChange: 0,
  lastSyncedAt: "Not synced",
  lastAnalyzedAt: "Never",
  coverage: "0 stories",
  primaryGoal: "Add holdings and run analysis.",
};

const HOME_OVERVIEW_FALLBACK: PortfolioOverview = {
  totalValue: 0,
  dayChange: 0,
  monthlyChange: 0,
  lastSyncedAt: "-",
  lastAnalyzedAt: "Never",
  coverage: "0 stories",
  primaryGoal: "Add a portfolio to unlock today's dashboard.",
};

function isDevTimingEnabled() {
  return process.env.NODE_ENV !== "production";
}

function createTimingLogger(label: string) {
  const enabled = isDevTimingEnabled();
  const start = enabled ? performance.now() : 0;
  let last = start;

  return {
    mark(phase: string) {
      if (!enabled) return;
      const now = performance.now();
      console.info(`[page-loader:${label}] ${phase} ${Math.round(now - last)}ms`);
      last = now;
    },
    done() {
      if (!enabled) return;
      const now = performance.now();
      console.info(`[page-loader:${label}] total ${Math.round(now - start)}ms`);
    },
  };
}

function formatTimeAgo(iso: string | null | undefined): string {
  if (!iso) return "-";
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return "-";
  const minutes = Math.floor((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} minutes ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hours ago`;
  return `${Math.floor(minutes / 1440)} days ago`;
}

function mapHoldingFromRow(row: HoldingRow): Holding {
  return {
    id: row.id,
    symbol: row.symbol,
    company: row.company,
    sector: row.sector,
    market: row.market,
    source: row.source,
    price: Number(row.price ?? 0),
    dailyChange: Number(row.daily_change ?? 0),
    allocation: Number(row.allocation ?? 0),
    thesis: row.thesis ?? "",
    quantity: Number(row.quantity ?? 0),
    averageCost: Number(row.average_cost ?? 0),
    costBasis: Number(row.cost_basis ?? 0),
    currentPrice: Number(row.current_price ?? 0),
    currentValue: Number(row.current_value ?? 0),
    unrealizedGainAmount: Number(row.unrealized_gain_amount ?? 0),
    unrealizedGainPercent: Number(row.unrealized_gain_percent ?? 0),
    quoteCurrency: row.quote_currency ?? "USD",
    quoteAsOf: row.quote_as_of ?? null,
    importSource: row.import_source ?? "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
  };
}

async function resolveAuthenticatedPageContext(
  label: string,
): Promise<AuthenticatedPageContext> {
  const timer = createTimingLogger(label);
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    timer.mark("auth/context");
    timer.done();
    return {
      supabase,
      userId: null,
      showOnboardingNav: true,
      showAdminLink: false,
      portfolios: [],
      primaryPortfolioId: null,
    };
  }

  const { data: rows } = await supabase
    .from("portfolios")
    .select("id, name, source_type, sync_status, last_synced_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  timer.mark("auth/context");

  const portfolios: PortfolioSummary[] = (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sourceType: row.source_type,
    syncStatus: row.sync_status,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
  }));

  return {
    supabase,
    userId: user.id,
    showOnboardingNav: portfolios.length === 0,
    showAdminLink: isAdminUser(user),
    portfolios,
    primaryPortfolioId: portfolios[0]?.id ?? null,
  };
}

async function loadHoldingRows(
  supabase: ServerSupabase,
  portfolioId: string,
): Promise<HoldingRow[]> {
  const { data } = await supabase
    .from("holdings")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: true });

  return (data ?? []) as HoldingRow[];
}

async function loadLatestAnalysisRun(
  supabase: ServerSupabase,
  portfolioId: string,
): Promise<{ id: string; completedAt: string } | null> {
  const { data } = await supabase
    .from("analysis_runs")
    .select("id, completed_at")
    .eq("portfolio_id", portfolioId)
    .in("status", ["complete", "degraded"])
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.id) return null;
  return { id: data.id, completedAt: data.completed_at };
}

async function loadFeedItemCount(
  supabase: ServerSupabase,
  portfolioId: string,
): Promise<number> {
  const { count } = await supabase
    .from("feed_items")
    .select("id", { count: "exact", head: true })
    .eq("portfolio_id", portfolioId);

  return count ?? 0;
}

export async function loadMarketStoryCount24h(
  supabase: ServerSupabase,
): Promise<number> {
  const cutoff = newsWindowCutoffIso();
  const { count } = await supabase
    .from("news_items")
    .select("id", { count: "exact", head: true })
    .gte("published_at", cutoff);

  return count ?? 0;
}

export async function loadMatchedStoryCount24hForRun(
  supabase: ServerSupabase,
  portfolioId: string,
  analysisRunId: string | null,
): Promise<number> {
  if (!analysisRunId) return 0;

  const cutoff = newsWindowCutoffIso();
  const { count } = await supabase
    .from("feed_items")
    .select("id, news_items!inner(published_at)", { count: "exact", head: true })
    .eq("portfolio_id", portfolioId)
    .eq("analysis_run_id", analysisRunId)
    .gte("news_items.published_at", cutoff);

  return count ?? 0;
}

async function loadPortfolioInsightsForRun(
  supabase: ServerSupabase,
  analysisRunId: string | null,
): Promise<PortfolioInsight[]> {
  if (!analysisRunId) return [];

  const { data } = await supabase
    .from("portfolio_insights")
    .select("title, value, detail")
    .eq("analysis_run_id", analysisRunId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    title: row.title,
    value: row.value,
    detail: row.detail,
  }));
}

async function loadPortfolioFeedHighlightsForRun(
  supabase: ServerSupabase,
  portfolioId: string,
  analysisRunId: string | null,
): Promise<PortfolioFeedHighlight[]> {
  if (!analysisRunId) return [];

  const { data, error } = await supabase
    .from("feed_items")
    .select(`
      relevance_score,
      why_it_matters,
      holdings,
      sectors,
      ai_summary,
      match_reason_codes,
      news_items (
        headline,
        source,
        published_at,
        category
      )
    `)
    .eq("analysis_run_id", analysisRunId)
    .eq("portfolio_id", portfolioId)
    .order("relevance_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) return [];

  return (data ?? [])
    .map<PortfolioFeedHighlight | null>((row) => {
      const news = Array.isArray(row.news_items) ? row.news_items[0] : row.news_items;
      if (!news) return null;

      return {
        headline: (news.headline as string) ?? "Untitled story",
        source: (news.source as string) ?? "Unknown source",
        publishedAt: (news.published_at as string) ?? new Date().toISOString(),
        category:
          ((news.category as string) ?? "other") as PortfolioFeedHighlight["category"],
        relevanceScore: Number(row.relevance_score ?? 0),
        whyItMatters: (row.why_it_matters as string | null) ?? "",
        holdings: ((row.holdings as string[] | null) ?? []).map((item) =>
          item.toUpperCase(),
        ),
        sectors: (row.sectors as string[] | null) ?? [],
        aiSummary: (row.ai_summary as string | null) ?? "",
        matchReasonCodes:
          (row.match_reason_codes as PortfolioFeedHighlight["matchReasonCodes"]) ?? [],
      };
    })
    .filter((item): item is PortfolioFeedHighlight => item !== null);
}

async function loadLatestHomeDigest(
  supabase: ServerSupabase,
  userId: string,
): Promise<HomeDashboardDigest | null> {
  const { data } = await supabase
    .from("notification_digests")
    .select("id, digest_date, summary_line, bullish_symbols, bearish_symbols, top_stories")
    .eq("user_id", userId)
    .order("digest_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.id) return null;

  const topStories = Array.isArray(data.top_stories) ? data.top_stories : [];

  return {
    id: data.id,
    digestDate: data.digest_date,
    summaryLine: data.summary_line,
    storyCount: topStories.length,
    bullishSymbols: Array.isArray(data.bullish_symbols) ? data.bullish_symbols : [],
    bearishSymbols: Array.isArray(data.bearish_symbols) ? data.bearish_symbols : [],
  };
}

async function loadHomeNotificationState(
  supabase: ServerSupabase,
  userId: string,
): Promise<HomeDashboardNotificationState> {
  const { data } = await supabase
    .from("user_notification_preferences")
    .select(
      "email_digest_enabled, sms_digest_enabled, phone_number, critical_news_alerts_enabled, earnings_report_alerts_enabled, price_move_alerts_enabled, concentration_alerts_enabled",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const smartAlertRuleCount = [
    data?.critical_news_alerts_enabled,
    data?.earnings_report_alerts_enabled,
    data?.price_move_alerts_enabled,
    data?.concentration_alerts_enabled,
  ].filter(Boolean).length;

  return {
    emailDigestEnabled: Boolean(data?.email_digest_enabled),
    smsDigestEnabled: Boolean(data?.sms_digest_enabled),
    hasPhoneNumber: Boolean(String(data?.phone_number ?? "").trim()),
    smartAlertRuleCount,
  };
}

async function loadLatestHomeAlerts(
  supabase: ServerSupabase,
  userId: string,
): Promise<HomeDashboardAlert[]> {
  const { data } = await supabase
    .from("notification_alerts")
    .select("id, alert_type, severity, title, message, action_href, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  return (data ?? []).map((row) => ({
    id: row.id,
    alertType: row.alert_type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    actionHref: row.action_href,
    createdAt: row.created_at,
  }));
}

function mapHomeEarningsItems(holdings: Holding[]): HomeDashboardEarningsItem[] {
  return holdings
    .filter((holding) => holding.latestEarningsReportUrl)
    .map((holding) => ({
      symbol: holding.symbol,
      title: holding.company || `${holding.symbol} latest report`,
      reportDate: holding.latestEarningsReportDate,
      source: holding.latestEarningsReportSource,
      href: holding.latestEarningsReportUrl ?? "#",
    }))
    .sort((left, right) => {
      const leftTime = left.reportDate ? Date.parse(left.reportDate) : 0;
      const rightTime = right.reportDate ? Date.parse(right.reportDate) : 0;
      return rightTime - leftTime || left.symbol.localeCompare(right.symbol);
    })
    .slice(0, 4);
}

function buildHomeChangeItems(input: {
  overview: PortfolioOverview;
  health: PortfolioHealthResult;
  matchedStoryCount24h: number;
  marketStoryCount24h: number;
  recentAlerts: HomeDashboardAlert[];
  earnings: HomeDashboardEarningsItem[];
  latestDigest: HomeDashboardDigest | null;
}): HomeDashboardChangeItem[] {
  const changes: HomeDashboardChangeItem[] = [];
  const unreadHighAlert = input.recentAlerts.find((alert) => alert.severity === "high");

  if (unreadHighAlert) {
    changes.push({
      id: "high-alert",
      title: "High-priority alert generated",
      detail: unreadHighAlert.title,
      href: "/alerts",
      tone: "risk",
    });
  }

  if (input.matchedStoryCount24h > 0) {
    changes.push({
      id: "matched-news",
      title: `${input.matchedStoryCount24h} portfolio stories matched`,
      detail: `${input.marketStoryCount24h} market stories were screened in the last 24 hours.`,
      href: "/feed",
      tone: input.matchedStoryCount24h >= 5 ? "watch" : "neutral",
    });
  }

  if (Math.abs(input.overview.dayChange) >= 1) {
    changes.push({
      id: "portfolio-move",
      title: `Portfolio moved ${input.overview.dayChange > 0 ? "up" : "down"} today`,
      detail: `Current weighted daily move is ${input.overview.dayChange.toFixed(2)}%.`,
      href: "/portfolio/full",
      tone: input.overview.dayChange >= 0 ? "good" : "watch",
    });
  }

  if (input.health.score < 70) {
    changes.push({
      id: "health-watch",
      title: "Health score needs attention",
      detail: input.health.summary,
      href: "/portfolio/full",
      tone: input.health.score < 55 ? "risk" : "watch",
    });
  }

  if (input.earnings.length > 0) {
    changes.push({
      id: "earnings-linked",
      title: `${input.earnings.length} earnings report link${input.earnings.length === 1 ? "" : "s"} ready`,
      detail: input.earnings.map((item) => item.symbol).slice(0, 4).join(", "),
      href: "/portfolio/full",
      tone: "good",
    });
  }

  if (input.latestDigest) {
    changes.push({
      id: "digest-ready",
      title: "Latest digest is available",
      detail: input.latestDigest.summaryLine,
      href: `/digest/${input.latestDigest.id}`,
      tone: "neutral",
    });
  }

  return changes.slice(0, 5);
}

function buildHomeActivityItems(input: {
  portfolio: PortfolioSummary | null;
  latestRun: { id: string; completedAt: string } | null;
  latestDigest: HomeDashboardDigest | null;
  recentAlerts: HomeDashboardAlert[];
  earnings: HomeDashboardEarningsItem[];
  thesisActivity?: Array<{ id: string; symbol: string; updatedAt: string; detail: string }>;
  savedActivity?: Array<{ id: string; title: string; savedAt: string; newsItemId: string }>;
}): HomeDashboardActivityItem[] {
  const items: HomeDashboardActivityItem[] = [];

  if (input.portfolio?.lastSyncedAt) {
    items.push({
      id: "price-sync",
      title: "Prices synced",
      detail: input.portfolio.name,
      href: "/portfolio/full",
      occurredAt: input.portfolio.lastSyncedAt,
      type: "sync",
    });
  }

  if (input.latestRun?.completedAt) {
    items.push({
      id: "analysis-run",
      title: "Analysis completed",
      detail: "Latest portfolio scoring run is ready.",
      href: "/analysis",
      occurredAt: input.latestRun.completedAt,
      type: "analysis",
    });
  }

  if (input.latestDigest) {
    items.push({
      id: `digest-${input.latestDigest.id}`,
      title: "Digest generated",
      detail: `${input.latestDigest.storyCount} stories in the latest digest.`,
      href: `/digest/${input.latestDigest.id}`,
      occurredAt: input.latestDigest.digestDate,
      type: "digest",
    });
  }

  for (const alert of input.recentAlerts.slice(0, 3)) {
    items.push({
      id: `alert-${alert.id}`,
      title: alert.title,
      detail: alert.message,
      href: "/alerts",
      occurredAt: alert.createdAt,
      type: "alert",
    });
  }

  for (const earning of input.earnings.slice(0, 2)) {
    if (!earning.reportDate) continue;
    items.push({
      id: `earnings-${earning.symbol}`,
      title: `${earning.symbol} report link found`,
      detail: earning.title,
      href: earning.href,
      occurredAt: earning.reportDate,
      type: "earnings",
    });
  }

  for (const thesis of input.thesisActivity ?? []) {
    items.push({
      id: `thesis-${thesis.id}`,
      title: `${thesis.symbol} thesis updated`,
      detail: thesis.detail || "Investment thesis note changed.",
      href: "/portfolio/full",
      occurredAt: thesis.updatedAt,
      type: "thesis",
    });
  }

  for (const saved of input.savedActivity ?? []) {
    items.push({
      id: `saved-${saved.id}`,
      title: "Article saved",
      detail: saved.title,
      href: `/feed?story=${saved.newsItemId}`,
      occurredAt: saved.savedAt,
      type: "saved",
    });
  }

  return items
    .filter((item) => !Number.isNaN(Date.parse(item.occurredAt)))
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, 6);
}

async function loadHomeThesisActivity(
  supabase: ServerSupabase,
  userId: string,
): Promise<Array<{ id: string; symbol: string; updatedAt: string; detail: string }>> {
  const { data } = await supabase
    .from("user_investment_theses")
    .select("id, symbol, thesis, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(4);

  return (data ?? []).map((row) => ({
    id: row.id,
    symbol: row.symbol,
    updatedAt: row.updated_at,
    detail: row.thesis ?? "",
  }));
}

async function loadHomeSavedArticleActivity(
  supabase: ServerSupabase,
  userId: string,
): Promise<Array<{ id: string; title: string; savedAt: string; newsItemId: string }>> {
  const { data } = await supabase
    .from("user_saved_articles")
    .select("id, saved_at, news_items(id, headline)")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false })
    .limit(3);

  return (data ?? [])
    .map((row) => {
      const news = Array.isArray(row.news_items) ? row.news_items[0] : row.news_items;
      if (!news?.id) return null;
      return {
        id: row.id,
        title: news.headline ?? "Saved article",
        savedAt: row.saved_at,
        newsItemId: news.id,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

async function loadLatestNewsTimestamp(supabase: ServerSupabase): Promise<string | null> {
  const { data } = await supabase
    .from("news_items")
    .select("published_at")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.published_at ?? null;
}

async function loadLatestPortfolioSnapshotTimestamp(
  supabase: ServerSupabase,
  portfolioId: string | null,
): Promise<string | null> {
  if (!portfolioId) return null;
  const { data } = await supabase
    .from("portfolio_value_snapshots")
    .select("captured_at")
    .eq("portfolio_id", portfolioId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.captured_at ?? null;
}

function freshnessTone(iso: string | null, goodMinutes: number, watchMinutes: number) {
  if (!iso) return "risk" as const;
  const ageMinutes = (Date.now() - Date.parse(iso)) / 60_000;
  if (!Number.isFinite(ageMinutes)) return "risk" as const;
  if (ageMinutes <= goodMinutes) return "good" as const;
  if (ageMinutes <= watchMinutes) return "watch" as const;
  return "risk" as const;
}

function buildHomeFreshnessItems(input: {
  portfolio: PortfolioSummary | null;
  latestRun: { completedAt: string } | null;
  latestNewsAt: string | null;
  latestAlertAt: string | null;
  latestSnapshotAt: string | null;
}): HomeDashboardFreshnessItem[] {
  return [
    {
      id: "prices",
      label: "Prices",
      value: formatTimeAgo(input.portfolio?.lastSyncedAt),
      detail: "Holding quotes and portfolio value.",
      href: "/portfolio/full",
      tone: freshnessTone(input.portfolio?.lastSyncedAt ?? null, 15, 120),
    },
    {
      id: "news",
      label: "News",
      value: formatTimeAgo(input.latestNewsAt),
      detail: "Latest article in the shared market pool.",
      href: "/feed",
      tone: freshnessTone(input.latestNewsAt, 45, 180),
    },
    {
      id: "analysis",
      label: "Analysis",
      value: formatTimeAgo(input.latestRun?.completedAt),
      detail: "Latest portfolio scoring run.",
      href: "/analysis",
      tone: freshnessTone(input.latestRun?.completedAt ?? null, 1440, 2880),
    },
    {
      id: "snapshots",
      label: "Snapshots",
      value: formatTimeAgo(input.latestSnapshotAt),
      detail: "Stored portfolio value snapshots.",
      href: "/portfolio/full",
      tone: freshnessTone(input.latestSnapshotAt, 90, 240),
    },
    {
      id: "alerts",
      label: "Alerts",
      value: formatTimeAgo(input.latestAlertAt),
      detail: "Latest generated smart alert.",
      href: "/alerts",
      tone: input.latestAlertAt ? "good" : "neutral",
    },
  ];
}

function buildRiskRadarItems(input: {
  health: PortfolioHealthResult;
  recentAlerts: HomeDashboardAlert[];
  earnings: HomeDashboardEarningsItem[];
  thesisActivity: Array<{ id: string; symbol: string; updatedAt: string; detail: string }>;
  holdings: Holding[];
}): HomeDashboardRiskRadarItem[] {
  const items: HomeDashboardRiskRadarItem[] = [];

  for (const alert of input.recentAlerts.filter((item) => item.severity === "high").slice(0, 2)) {
    items.push({
      id: `alert-${alert.id}`,
      title: alert.title,
      detail: alert.message,
      href: alert.actionHref || "/alerts",
      tone: "risk",
    });
  }

  for (const risk of input.health.risks.slice(0, 3)) {
    items.push({
      id: `health-${risk.title}`,
      title: risk.title,
      detail: risk.detail,
      href: risk.href,
      tone: risk.tone,
    });
  }

  const thesisSymbols = new Set(input.thesisActivity.map((item) => item.symbol));
  const missingThesis = input.holdings
    .filter((holding) => !thesisSymbols.has(holding.symbol))
    .slice(0, 2);
  for (const holding of missingThesis) {
    items.push({
      id: `missing-thesis-${holding.symbol}`,
      title: `${holding.symbol} has no thesis`,
      detail: "Add a thesis and review trigger so news can be matched against your own reasoning.",
      href: "/portfolio/full",
      tone: "watch",
    });
  }

  for (const earning of input.earnings.slice(0, 2)) {
    items.push({
      id: `earnings-${earning.symbol}`,
      title: `${earning.symbol} earnings link ready`,
      detail: "Review the latest report before relying on article summaries.",
      href: earning.href,
      tone: "neutral",
    });
  }

  return items.slice(0, 6);
}

function buildPortfolioOverview(
  holdings: Holding[],
  options: {
    lastSyncedAt: string | null;
    lastAnalyzedAt: string | null;
    feedCount: number;
    emptyLastSyncedLabel?: string;
    emptyCoverageLabel?: string;
  },
): PortfolioOverview {
  const enriched = holdings.map((holding) => {
    const price = Number(holding.currentPrice || holding.price || 0);
    const quantity = Number(holding.quantity ?? 0);
    const value =
      quantity > 0
        ? quantity * price
        : price * (Number(holding.allocation ?? 0) / 100) * 1000;

    return {
      dailyChange: Number(holding.dailyChange ?? 0),
      value,
    };
  });

  const totalValue = enriched.reduce((sum, holding) => sum + holding.value, 0);
  const weightedDayChange =
    totalValue > 0
      ? enriched.reduce(
          (sum, holding) => sum + holding.dailyChange * (holding.value / totalValue),
          0,
        )
      : 0;

  return {
    totalValue: Math.round(totalValue),
    dayChange: Math.round(weightedDayChange * 100) / 100,
    monthlyChange: 0,
    lastSyncedAt: options.lastSyncedAt
      ? formatTimeAgo(options.lastSyncedAt)
      : (options.emptyLastSyncedLabel ?? "-"),
    lastAnalyzedAt: options.lastAnalyzedAt
      ? formatTimeAgo(options.lastAnalyzedAt)
      : "Never",
    coverage:
      options.feedCount > 0
        ? `${options.feedCount} high-signal stories`
        : (options.emptyCoverageLabel ?? "0 stories"),
    primaryGoal: "Compound around quality holdings and resilient names.",
  };
}

function selectRequestedOrPrimaryPortfolio(
  portfolios: PortfolioSummary[],
  requestedPortfolioId?: string | null,
): PortfolioSummary | null {
  if (!requestedPortfolioId) return portfolios[0] ?? null;
  return portfolios.find((portfolio) => portfolio.id === requestedPortfolioId) ?? null;
}

export async function loadOnboardingNavState(): Promise<boolean> {
  const context = await resolveAuthenticatedPageContext("shell-nav");
  return context.showOnboardingNav;
}

export async function loadShellChromeState(): Promise<{
  showOnboardingNav: boolean;
  showAdminLink: boolean;
}> {
  const context = await resolveAuthenticatedPageContext("shell-chrome");
  return {
    showOnboardingNav: context.showOnboardingNav,
    showAdminLink: context.showAdminLink,
  };
}

export async function loadHomeDashboardData(): Promise<{
  showOnboardingNav: boolean;
  showAdminLink: boolean;
  dashboard: HomeDashboardData;
}> {
  const timer = createTimingLogger("/home");
  const context = await resolveAuthenticatedPageContext("/home:context");

  if (!context.userId) {
    timer.done();
    return {
      showOnboardingNav: true,
      showAdminLink: false,
      dashboard: {
        portfolioId: null,
        portfolioName: null,
        overview: HOME_OVERVIEW_FALLBACK,
        health: calculatePortfolioHealth({ holdings: [] }),
        insights: [],
        topStories: [],
        earnings: [],
        latestDigest: null,
        notifications: {
          emailDigestEnabled: false,
          smsDigestEnabled: false,
          hasPhoneNumber: false,
          smartAlertRuleCount: 0,
        },
        recentAlerts: [],
        whatChanged: [],
        activity: [],
        timeline: [],
        riskRadar: [],
        freshness: [],
        marketStoryCount24h: 0,
        matchedStoryCount24h: 0,
      },
    };
  }

  const portfolio = context.portfolios[0] ?? null;
  const portfolioId = portfolio?.id ?? null;

  const [
    latestDigest,
    notifications,
    recentAlerts,
    marketStoryCount24h,
    latestNewsAt,
    thesisActivity,
    savedActivity,
  ] = await Promise.all([
    loadLatestHomeDigest(context.supabase, context.userId),
    loadHomeNotificationState(context.supabase, context.userId),
    loadLatestHomeAlerts(context.supabase, context.userId),
    loadMarketStoryCount24h(context.supabase),
    loadLatestNewsTimestamp(context.supabase),
    loadHomeThesisActivity(context.supabase, context.userId),
    loadHomeSavedArticleActivity(context.supabase, context.userId),
  ]);

  if (!portfolioId || !portfolio) {
    timer.mark("empty dashboard context");
    timer.done();
    return {
      showOnboardingNav: context.showOnboardingNav,
      showAdminLink: context.showAdminLink,
      dashboard: {
        portfolioId: null,
        portfolioName: null,
        overview: HOME_OVERVIEW_FALLBACK,
        health: calculatePortfolioHealth({ holdings: [] }),
        insights: [],
        topStories: [],
        earnings: [],
        latestDigest,
        notifications,
        recentAlerts,
        whatChanged: buildHomeChangeItems({
          overview: HOME_OVERVIEW_FALLBACK,
          health: calculatePortfolioHealth({ holdings: [] }),
          matchedStoryCount24h: 0,
          marketStoryCount24h,
          recentAlerts,
          earnings: [],
          latestDigest,
        }),
        activity: buildHomeActivityItems({
          portfolio: null,
          latestRun: null,
          latestDigest,
          recentAlerts,
          earnings: [],
          thesisActivity,
          savedActivity,
        }),
        timeline: buildHomeActivityItems({
          portfolio: null,
          latestRun: null,
          latestDigest,
          recentAlerts,
          earnings: [],
          thesisActivity,
          savedActivity,
        }),
        riskRadar: [],
        freshness: buildHomeFreshnessItems({
          portfolio: null,
          latestRun: null,
          latestNewsAt,
          latestAlertAt: recentAlerts[0]?.createdAt ?? null,
          latestSnapshotAt: null,
        }),
        marketStoryCount24h,
        matchedStoryCount24h: 0,
      },
    };
  }

  const [holdingRows, latestRun] = await Promise.all([
    loadHoldingRows(context.supabase, portfolioId),
    loadLatestAnalysisRun(context.supabase, portfolioId),
  ]);
  timer.mark("dashboard holdings/run");

  const [
    feedHighlights,
    insights,
    matchedStoryCount24h,
    reportsBySymbol,
    latestSnapshotAt,
  ] = await Promise.all([
    loadPortfolioFeedHighlightsForRun(context.supabase, portfolioId, latestRun?.id ?? null),
    loadPortfolioInsightsForRun(context.supabase, latestRun?.id ?? null),
    loadMatchedStoryCount24hForRun(
      context.supabase,
      portfolioId,
      latestRun?.id ?? null,
    ),
    loadActiveEarningsReportsBySymbols(
      context.supabase,
      holdingRows.map((row) => row.symbol),
    ),
    loadLatestPortfolioSnapshotTimestamp(context.supabase, portfolioId),
  ]);
  timer.mark("dashboard signals");

  const holdings = attachLatestEarningsReportFields(
    holdingRows.map(mapHoldingFromRow),
    reportsBySymbol,
  );
  const overview = buildPortfolioOverview(holdings, {
    lastSyncedAt: portfolio.lastSyncedAt,
    lastAnalyzedAt: latestRun?.completedAt ?? null,
    feedCount: matchedStoryCount24h,
    emptyLastSyncedLabel: "Not synced",
    emptyCoverageLabel: "0 high-signal stories",
  });
  const earnings = mapHomeEarningsItems(holdings);
  const health = calculatePortfolioHealth({
    holdings,
    feedHighlights,
    latestAnalysisAt: latestRun?.completedAt ?? null,
  });

  timer.done();
  return {
    showOnboardingNav: context.showOnboardingNav,
    showAdminLink: context.showAdminLink,
    dashboard: {
      portfolioId,
      portfolioName: portfolio.name,
      overview,
      health,
      insights,
      topStories: feedHighlights.slice(0, 5),
      earnings,
      latestDigest,
      notifications,
      recentAlerts,
      whatChanged: buildHomeChangeItems({
        overview,
        health,
        matchedStoryCount24h,
        marketStoryCount24h,
        recentAlerts,
        earnings,
        latestDigest,
      }),
      activity: buildHomeActivityItems({
        portfolio,
        latestRun: latestRun ?? null,
        latestDigest,
        recentAlerts,
        earnings,
        thesisActivity,
        savedActivity,
      }),
      timeline: buildHomeActivityItems({
        portfolio,
        latestRun: latestRun ?? null,
        latestDigest,
        recentAlerts,
        earnings,
        thesisActivity,
        savedActivity,
      }),
      riskRadar: buildRiskRadarItems({
        health,
        recentAlerts,
        earnings,
        thesisActivity,
        holdings,
      }),
      freshness: buildHomeFreshnessItems({
        portfolio,
        latestRun: latestRun ?? null,
        latestNewsAt,
        latestAlertAt: recentAlerts[0]?.createdAt ?? null,
        latestSnapshotAt,
      }),
      marketStoryCount24h,
      matchedStoryCount24h,
    },
  };
}

export async function loadFeedPageData(): Promise<{
  showOnboardingNav: boolean;
  showAdminLink: boolean;
  portfolioId: string | null;
  portfolioOverview: PortfolioOverview;
  portfolioInsights: PortfolioInsight[];
  initialFeedPayload: FeedResponsePayload | null;
  marketStoryCount24h: number;
  matchedStoryCount24h: number;
}> {
  const timer = createTimingLogger("/feed");
  const context = await resolveAuthenticatedPageContext("/feed:context");

  if (!context.userId) {
    timer.mark("resolve context");
    timer.done();
    return {
      showOnboardingNav: true,
      showAdminLink: false,
      portfolioId: null,
      portfolioOverview: FEED_OVERVIEW_FALLBACK,
      portfolioInsights: [],
      initialFeedPayload: null,
      marketStoryCount24h: 0,
      matchedStoryCount24h: 0,
    };
  }

  const portfolio = context.portfolios[0] ?? null;
  const portfolioId = portfolio?.id ?? null;
  if (!portfolioId) {
    const [initialFeedResult, marketStoryCount24h] = await Promise.all([
      resolveFeedPayload({
        supabase: context.supabase,
        userId: context.userId,
        mode: "personal",
        page: 1,
        pageSize: DEFAULT_FEED_PAGE_SIZE,
      }),
      loadMarketStoryCount24h(context.supabase),
    ]);
    timer.mark("resolve context/feed payload");
    timer.done();
    return {
      showOnboardingNav: context.showOnboardingNav,
      showAdminLink: context.showAdminLink,
      portfolioId: null,
      portfolioOverview: FEED_OVERVIEW_FALLBACK,
      portfolioInsights: [],
      initialFeedPayload: initialFeedResult.ok ? initialFeedResult.data : null,
      marketStoryCount24h,
      matchedStoryCount24h: 0,
    };
  }

  const [holdingRows, latestRun, watchlistRows, marketStoryCount24h] = await Promise.all([
    loadHoldingRows(context.supabase, portfolioId),
    loadLatestAnalysisRun(context.supabase, portfolioId),
    context.supabase.from("watchlist_items").select("symbol").eq("user_id", context.userId),
    loadMarketStoryCount24h(context.supabase),
  ]);
  timer.mark("overview/feed context");

  const holdings = holdingRows.map(mapHoldingFromRow);
  const portfolioSymbols = [
    ...new Set(holdingRows.map((row) => String(row.symbol ?? "").toUpperCase()).filter(Boolean)),
  ];
  const portfolioSectors = [
    ...new Set(holdingRows.map((row) => String(row.sector ?? "")).filter(Boolean)),
  ];
  const watchlistSymbols = [
    ...new Set(
      (watchlistRows.data ?? [])
        .map((row) => String(row.symbol ?? "").toUpperCase())
        .filter(Boolean),
    ),
  ];

  const [portfolioInsights, initialFeedResult, matchedStoryCount24h] = await Promise.all([
    loadPortfolioInsightsForRun(context.supabase, latestRun?.id ?? null),
    resolveFeedPayload({
      supabase: context.supabase,
      userId: context.userId,
      mode: "personal",
      portfolioId,
      portfolioSymbols,
      portfolioSectors,
      watchlistSymbols,
      page: 1,
      pageSize: DEFAULT_FEED_PAGE_SIZE,
      contextValidated: true,
    }),
    loadMatchedStoryCount24hForRun(
      context.supabase,
      portfolioId,
      latestRun?.id ?? null,
    ),
  ]);
  timer.mark("feed payload/insights");

  timer.done();
  return {
    showOnboardingNav: context.showOnboardingNav,
    showAdminLink: context.showAdminLink,
    portfolioId,
    portfolioOverview: buildPortfolioOverview(holdings, {
      lastSyncedAt: portfolio.lastSyncedAt,
      lastAnalyzedAt: latestRun?.completedAt ?? null,
      feedCount: matchedStoryCount24h,
      emptyCoverageLabel: "0 high-signal stories",
    }),
    portfolioInsights,
    initialFeedPayload: initialFeedResult.ok ? initialFeedResult.data : null,
    marketStoryCount24h,
    matchedStoryCount24h,
  };
}

export async function loadPortfolioPageData(): Promise<{
  showOnboardingNav: boolean;
  showAdminLink: boolean;
  portfolioId: string | null;
  portfolioData: { sourceType: string; holdings: Holding[] } | null;
  portfolioOverview: PortfolioOverview;
  feedHighlights: PortfolioFeedHighlight[];
}> {
  const timer = createTimingLogger("/portfolio");
  const context = await resolveAuthenticatedPageContext("/portfolio:context");
  const portfolio = context.portfolios[0] ?? null;
  const portfolioId = portfolio?.id ?? null;

  if (!portfolioId || !portfolio) {
    timer.done();
    return {
      showOnboardingNav: context.showOnboardingNav,
      showAdminLink: context.showAdminLink,
      portfolioId: null,
      portfolioData: null,
      portfolioOverview: PORTFOLIO_OVERVIEW_FALLBACK,
      feedHighlights: [],
    };
  }

  const [holdingRows, latestRun, feedCount] = await Promise.all([
    loadHoldingRows(context.supabase, portfolioId),
    loadLatestAnalysisRun(context.supabase, portfolioId),
    loadFeedItemCount(context.supabase, portfolioId),
  ]);
  timer.mark("holdings/overview context");

  const [feedHighlights, reportsBySymbol] = await Promise.all([
    loadPortfolioFeedHighlightsForRun(context.supabase, portfolioId, latestRun?.id ?? null),
    loadActiveEarningsReportsBySymbols(
      context.supabase,
      holdingRows.map((row) => row.symbol),
    ),
  ]);
  timer.mark("feed highlights");

  const holdings = attachLatestEarningsReportFields(
    holdingRows.map(mapHoldingFromRow),
    reportsBySymbol,
  );
  timer.done();

  return {
    showOnboardingNav: context.showOnboardingNav,
    showAdminLink: context.showAdminLink,
    portfolioId,
    portfolioData: {
      sourceType: portfolio.sourceType,
      holdings,
    },
    portfolioOverview: buildPortfolioOverview(holdings, {
      lastSyncedAt: portfolio.lastSyncedAt,
      lastAnalyzedAt: latestRun?.completedAt ?? null,
      feedCount,
      emptyLastSyncedLabel: "2 mins ago",
      emptyCoverageLabel: "0 stories",
    }),
    feedHighlights,
  };
}

export async function loadAnalysisPageData(
  requestedPortfolioId?: string | null,
): Promise<{
  showOnboardingNav: boolean;
  showAdminLink: boolean;
  portfolioId: string | null;
  portfolioOverview: PortfolioOverview;
  portfolioInsights: PortfolioInsight[];
}> {
  const timer = createTimingLogger("/analysis");
  const context = await resolveAuthenticatedPageContext("/analysis:context");
  const portfolio = selectRequestedOrPrimaryPortfolio(
    context.portfolios,
    requestedPortfolioId,
  );
  const portfolioId = portfolio?.id ?? null;

  if (!portfolioId || !portfolio) {
    timer.done();
    return {
      showOnboardingNav: context.showOnboardingNav,
      showAdminLink: context.showAdminLink,
      portfolioId: null,
      portfolioOverview: ANALYSIS_OVERVIEW_FALLBACK,
      portfolioInsights: [],
    };
  }

  const [holdingRows, latestRun, feedCount] = await Promise.all([
    loadHoldingRows(context.supabase, portfolioId),
    loadLatestAnalysisRun(context.supabase, portfolioId),
    loadFeedItemCount(context.supabase, portfolioId),
  ]);
  timer.mark("holdings/overview context");

  const portfolioInsights = await loadPortfolioInsightsForRun(
    context.supabase,
    latestRun?.id ?? null,
  );
  timer.mark("insights");

  const holdings = holdingRows.map(mapHoldingFromRow);
  timer.done();

  return {
    showOnboardingNav: context.showOnboardingNav,
    showAdminLink: context.showAdminLink,
    portfolioId,
    portfolioOverview: buildPortfolioOverview(holdings, {
      lastSyncedAt: portfolio.lastSyncedAt,
      lastAnalyzedAt: latestRun?.completedAt ?? null,
      feedCount,
      emptyCoverageLabel: "0 stories",
    }),
    portfolioInsights,
  };
}

export async function loadFullPortfolioPageData(): Promise<{
  showOnboardingNav: boolean;
  showAdminLink: boolean;
  portfolioId: string | null;
  portfolioCreatedAt: string | null;
  holdings: Holding[];
  watchlistSymbols: string[];
  sourceType: string | null;
  portfolioOverview: PortfolioOverview;
  portfolioValueSnapshots: PortfolioValueSnapshot[];
  insights: PortfolioInsight[];
  feedHighlights: PortfolioFeedHighlight[];
}> {
  const timer = createTimingLogger("/portfolio/full");
  const context = await resolveAuthenticatedPageContext("/portfolio/full:context");
  const portfolio = context.portfolios[0] ?? null;
  const portfolioId = portfolio?.id ?? null;

  if (!portfolioId || !portfolio || !context.userId) {
    timer.done();
    return {
      showOnboardingNav: context.showOnboardingNav,
      showAdminLink: context.showAdminLink,
      portfolioId: null,
      portfolioCreatedAt: null,
      holdings: [],
      watchlistSymbols: [],
      sourceType: null,
      portfolioOverview: FULL_OVERVIEW_FALLBACK,
      portfolioValueSnapshots: [],
      insights: [],
      feedHighlights: [],
    };
  }

  const [
    holdingRows,
    latestRun,
    feedCount,
    portfolioValueSnapshots,
    watchlistResult,
  ] = await Promise.all([
    loadHoldingRows(context.supabase, portfolioId),
    loadLatestAnalysisRun(context.supabase, portfolioId),
    loadFeedItemCount(context.supabase, portfolioId),
    loadPortfolioValueSnapshots(context.supabase, portfolioId, { limit: 72 }),
    context.supabase.from("watchlist_items").select("symbol").eq("user_id", context.userId),
  ]);
  timer.mark("holdings/overview context");

  const watchlistSymbols = [
    ...new Set(
      (watchlistResult.data ?? [])
        .map((row) => String(row.symbol ?? "").trim().toUpperCase())
        .filter(Boolean),
    ),
  ].slice(0, 25);

  const [insights, feedHighlights, reportsBySymbol] = await Promise.all([
    loadPortfolioInsightsForRun(context.supabase, latestRun?.id ?? null),
    loadPortfolioFeedHighlightsForRun(context.supabase, portfolioId, latestRun?.id ?? null),
    loadActiveEarningsReportsBySymbols(
      context.supabase,
      holdingRows.map((row) => row.symbol),
    ),
  ]);
  timer.mark("insights/highlights");

  const holdings = attachLatestEarningsReportFields(
    holdingRows.map(mapHoldingFromRow),
    reportsBySymbol,
  );
  timer.done();

  return {
    showOnboardingNav: context.showOnboardingNav,
    showAdminLink: context.showAdminLink,
    portfolioId,
    portfolioCreatedAt: portfolio.createdAt,
    holdings,
    watchlistSymbols,
    sourceType: portfolio.sourceType,
    portfolioOverview: buildPortfolioOverview(holdings, {
      lastSyncedAt: portfolio.lastSyncedAt,
      lastAnalyzedAt: latestRun?.completedAt ?? null,
      feedCount,
      emptyLastSyncedLabel: "Not synced",
      emptyCoverageLabel: "0 stories",
    }),
    portfolioValueSnapshots,
    insights,
    feedHighlights,
  };
}
