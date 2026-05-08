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
import type {
  Holding,
  PortfolioFeedHighlight,
  PortfolioInsight,
  PortfolioOverview,
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
  sourceType: string | null;
  portfolioOverview: PortfolioOverview;
  insights: PortfolioInsight[];
  feedHighlights: PortfolioFeedHighlight[];
}> {
  const timer = createTimingLogger("/portfolio/full");
  const context = await resolveAuthenticatedPageContext("/portfolio/full:context");
  const portfolio = context.portfolios[0] ?? null;
  const portfolioId = portfolio?.id ?? null;

  if (!portfolioId || !portfolio) {
    timer.done();
    return {
      showOnboardingNav: context.showOnboardingNav,
      showAdminLink: context.showAdminLink,
      portfolioId: null,
      portfolioCreatedAt: null,
      holdings: [],
      sourceType: null,
      portfolioOverview: FULL_OVERVIEW_FALLBACK,
      insights: [],
      feedHighlights: [],
    };
  }

  const [holdingRows, latestRun, feedCount] = await Promise.all([
    loadHoldingRows(context.supabase, portfolioId),
    loadLatestAnalysisRun(context.supabase, portfolioId),
    loadFeedItemCount(context.supabase, portfolioId),
  ]);
  timer.mark("holdings/overview context");

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
    sourceType: portfolio.sourceType,
    portfolioOverview: buildPortfolioOverview(holdings, {
      lastSyncedAt: portfolio.lastSyncedAt,
      lastAnalyzedAt: latestRun?.completedAt ?? null,
      feedCount,
      emptyLastSyncedLabel: "Not synced",
      emptyCoverageLabel: "0 stories",
    }),
    insights,
    feedHighlights,
  };
}
