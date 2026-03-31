import { createClient } from "@/lib/supabase/server";
import type {
  FeedMode,
  MatchReasonCode,
  MatchSource,
  NewsItem,
  TickerImpact,
} from "@/lib/types";
import { resolveDirectStockMatch } from "@/lib/services/news/direct-match";
import { isMarketHeadlineSource } from "@/lib/services/news/source-config";

/** Hard cap: only articles from the last 24 hours appear in either feed mode. */
const FEED_MAX_AGE_MINUTES = 24 * 60;
export const DEFAULT_FEED_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 500;

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export type FeedResponsePayload = {
  feed: NewsItem[];
  portfolioId: string | null;
  mode: FeedMode;
  portfolioSymbols: string[];
  portfolioSectors: string[];
  watchlistSymbols: string[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type FeedResolverResult =
  | { ok: true; data: FeedResponsePayload }
  | { ok: false; status: number; error: string };

export function effectiveRecencyCap(maxMinutesParam: string | null): number {
  if (!maxMinutesParam) return FEED_MAX_AGE_MINUTES;
  const parsed = parseInt(maxMinutesParam, 10);
  if (Number.isNaN(parsed) || parsed < 0) return FEED_MAX_AGE_MINUTES;
  return Math.min(parsed, FEED_MAX_AGE_MINUTES);
}

export function parseFeedPage(pageParam: string | null): number {
  const parsed = parseInt(pageParam ?? "", 10);
  if (Number.isNaN(parsed) || parsed < 1) return 1;
  return parsed;
}

export function parseFeedPageSize(pageSizeParam: string | null): number {
  const parsed = parseInt(pageSizeParam ?? "", 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_FEED_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, parsed));
}

function paginateRows<T>(rows: T[], page: number, pageSize: number) {
  const totalCount = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = totalCount > 0 ? Math.min(page, totalPages) : 1;
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  return {
    pageRows: rows.slice(start, end),
    page: currentPage,
    pageSize,
    totalCount,
    totalPages,
  };
}

function minutesAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

function formatPublishedAt(iso: string): string {
  const min = minutesAgo(iso);
  if (min < 60) return `${min} minutes ago`;
  if (min < 120) return "1 hour ago";
  if (min < 180) return "2 hours ago";
  if (min < 1440) return `${Math.floor(min / 60)} hours ago`;
  return `${Math.floor(min / 1440)} days ago`;
}

export async function resolveFeedPayload({
  supabase,
  userId,
  mode,
  portfolioId,
  portfolioSymbols: preloadedPortfolioSymbols,
  portfolioSectors: preloadedPortfolioSectors,
  watchlistSymbols: preloadedWatchlistSymbols,
  holding = null,
  sector = null,
  category = null,
  maxMinutes = null,
  ticker = null,
  sourceType = null,
  page,
  pageSize,
  contextValidated = false,
}: {
  supabase: ServerSupabase;
  userId: string;
  mode: FeedMode;
  portfolioId?: string | null;
  portfolioSymbols?: string[];
  portfolioSectors?: string[];
  watchlistSymbols?: string[];
  holding?: string | null;
  sector?: string | null;
  category?: string | null;
  maxMinutes?: string | null;
  ticker?: string | null;
  sourceType?: string | null;
  page: number;
  pageSize: number;
  contextValidated?: boolean;
}): Promise<FeedResolverResult> {
  let resolvedPortfolioId = portfolioId ?? null;
  if (!resolvedPortfolioId) {
    const { data: portfolios } = await supabase
      .from("portfolios")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    resolvedPortfolioId = portfolios?.[0]?.id ?? null;
  }

  let portfolioSymbols: string[] = preloadedPortfolioSymbols ?? [];
  let portfolioSectors: string[] = preloadedPortfolioSectors ?? [];
  const needsPortfolioContext =
    !!resolvedPortfolioId &&
    (!contextValidated ||
      preloadedPortfolioSymbols == null ||
      preloadedPortfolioSectors == null);

  if (resolvedPortfolioId && needsPortfolioContext) {
    const { data: portfolio } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", resolvedPortfolioId)
      .eq("user_id", userId)
      .single();

    if (!portfolio) {
      return { ok: false, status: 404, error: "Portfolio not found" };
    }

    const { data: holdingRows } = await supabase
      .from("holdings")
      .select("symbol, sector")
      .eq("portfolio_id", resolvedPortfolioId);

    portfolioSymbols = [
      ...new Set(
        (holdingRows ?? [])
          .map((portfolioHolding) =>
            String(portfolioHolding.symbol ?? "").toUpperCase(),
          )
          .filter(Boolean),
      ),
    ];
    portfolioSectors = [
      ...new Set(
        (holdingRows ?? [])
          .map((portfolioHolding) => String(portfolioHolding.sector ?? ""))
          .filter(Boolean),
      ),
    ];
  }

  const watchlistSymbols =
    preloadedWatchlistSymbols ??
    [
      ...new Set(
        (
          await supabase
            .from("watchlist_items")
            .select("symbol")
            .eq("user_id", userId)
        ).data
          ?.map((row) => String(row.symbol ?? "").toUpperCase())
          .filter(Boolean) ?? [],
      ),
    ];

  if (mode === "market") {
    return {
      ok: true,
      data: await buildMarketPayload(supabase, {
        portfolioId: resolvedPortfolioId,
        portfolioSymbols,
        portfolioSectors,
        watchlistSymbols,
        category,
        maxMinutes,
        sourceType,
        ticker,
        page,
        pageSize,
      }),
    };
  }

  if (resolvedPortfolioId) {
    return {
      ok: true,
      data: await buildPersonalPayload(supabase, {
        portfolioId: resolvedPortfolioId,
        portfolioSymbols,
        portfolioSectors,
        watchlistSymbols,
        holding,
        sector,
        category,
        maxMinutes,
        page,
        pageSize,
      }),
    };
  }

  if (watchlistSymbols.length > 0) {
    return {
      ok: true,
      data: await buildWatchlistOnlyPayload(supabase, {
        watchlistSymbols,
        category,
        maxMinutes,
        page,
        pageSize,
      }),
    };
  }

  return {
    ok: true,
    data: {
      feed: [],
      portfolioId: null,
      mode,
      portfolioSymbols: [],
      portfolioSectors: [],
      watchlistSymbols,
      page: 1,
      pageSize,
      totalCount: 0,
      totalPages: 1,
    },
  };
}

async function buildPersonalPayload(
  supabase: ServerSupabase,
  opts: {
    portfolioId: string;
    portfolioSymbols: string[];
    portfolioSectors: string[];
    watchlistSymbols: string[];
    holding: string | null;
    sector: string | null;
    category: string | null;
    maxMinutes: string | null;
    page: number;
    pageSize: number;
  },
): Promise<FeedResponsePayload> {
  const { data: latestRun } = await supabase
    .from("analysis_runs")
    .select("id")
    .eq("portfolio_id", opts.portfolioId)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRun) {
    return {
      feed: [],
      portfolioId: opts.portfolioId,
      mode: "personal",
      portfolioSymbols: opts.portfolioSymbols,
      portfolioSectors: opts.portfolioSectors,
      watchlistSymbols: opts.watchlistSymbols,
      page: 1,
      pageSize: opts.pageSize,
      totalCount: 0,
      totalPages: 1,
    };
  }

  let query = supabase
    .from("feed_items")
    .select(
      `
      id,
      relevance_score,
      sentiment,
      impact,
      holdings,
      sectors,
      ai_summary,
      why_it_matters,
      matched_stock_tags,
      match_reason_codes,
      match_sources,
      display_effect,
      source_confidence,
      news_items!inner (
        id,
        headline,
        source,
        url,
        published_at,
        angle,
        category,
        stock_tags,
        global_summary,
        overall_effect,
        ticker_impacts,
        source_type,
        metadata
      )
    `,
    )
    .eq("portfolio_id", opts.portfolioId)
    .eq("analysis_run_id", latestRun.id)
    .order("relevance_score", { ascending: false });

  if (opts.holding) {
    query = query.contains("holdings", [opts.holding]);
  }
  if (opts.sector) {
    query = query.contains("sectors", [opts.sector]);
  }

  const { data: rows } = await query;

  type Row = {
    id: string;
    relevance_score: number;
    sentiment: string;
    impact: string;
    holdings: string[];
    sectors: string[];
    ai_summary: string | null;
    why_it_matters: string | null;
    matched_stock_tags: string[];
    match_reason_codes: MatchReasonCode[] | null;
    match_sources: MatchSource[] | null;
    display_effect: string;
    source_confidence: string;
    news_items: {
      id: string;
      headline: string;
      source: string;
      url: string | null;
      published_at: string;
      angle: string | null;
      category: string;
      stock_tags: string[];
      global_summary: string | null;
      overall_effect: string;
      ticker_impacts: TickerImpact[] | null;
      source_type: string;
      metadata: Record<string, unknown> | null;
    } | null;
  };

  const rawRows = (rows ?? []) as unknown as Row[];
  let feed = rawRows.map((row) => {
    const news = row.news_items ?? null;
    const publishedAt = news?.published_at ?? new Date().toISOString();
    return {
      id: row.id,
      newsItemId: news?.id ?? "",
      headline: news?.headline ?? "",
      source: news?.source ?? "",
      url: news?.url ?? undefined,
      publishedAt: formatPublishedAt(publishedAt),
      publishedMinutesAgo: minutesAgo(publishedAt),
      relevanceScore: row.relevance_score,
      sentiment: row.sentiment as NewsItem["sentiment"],
      impact: row.impact as NewsItem["impact"],
      holdings: row.holdings ?? [],
      sectors: row.sectors ?? [],
      aiSummary: row.ai_summary ?? "",
      whyItMatters: row.why_it_matters ?? "",
      angle: news?.angle ?? "",
      category: (news?.category ?? "other") as NewsItem["category"],
      stockTags: news?.stock_tags ?? [],
      matchedStockTags: row.matched_stock_tags ?? [],
      matchReasonCodes: row.match_reason_codes ?? [],
      matchSources: row.match_sources ?? ["portfolio"],
      globalSummary: news?.global_summary ?? "",
      displayEffect: (row.display_effect ?? "neutral") as NewsItem["displayEffect"],
      tickerImpacts: news?.ticker_impacts ?? [],
      sourceType: (news?.source_type ?? "other") as NewsItem["sourceType"],
      sourceConfidence: (row.source_confidence ?? "standard") as NewsItem["sourceConfidence"],
      metadata: news?.metadata ?? {},
    } satisfies NewsItem;
  });

  if (opts.category) {
    feed = feed.filter((item) => item.category === opts.category);
  }

  const cap = effectiveRecencyCap(opts.maxMinutes);
  const filteredFeed = feed.filter((item) => item.publishedMinutesAgo <= cap);
  const paginated = paginateRows(filteredFeed, opts.page, opts.pageSize);

  return {
    feed: paginated.pageRows,
    portfolioId: opts.portfolioId,
    mode: "personal",
    portfolioSymbols: opts.portfolioSymbols,
    portfolioSectors: opts.portfolioSectors,
    watchlistSymbols: opts.watchlistSymbols,
    page: paginated.page,
    pageSize: paginated.pageSize,
    totalCount: paginated.totalCount,
    totalPages: paginated.totalPages,
  };
}

async function buildWatchlistOnlyPayload(
  supabase: ServerSupabase,
  opts: {
    watchlistSymbols: string[];
    category: string | null;
    maxMinutes: string | null;
    page: number;
    pageSize: number;
  },
): Promise<FeedResponsePayload> {
  const wlSet = new Set(opts.watchlistSymbols.map((symbol) => symbol.toUpperCase()));

  const publishedSince = new Date(
    Date.now() - FEED_MAX_AGE_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: rows } = await supabase
    .from("news_items")
    .select(
      "id, headline, source, url, published_at, angle, category, stock_tags, " +
        "global_summary, overall_effect, ticker_impacts, source_type, metadata, raw_content",
    )
    .gte("published_at", publishedSince)
    .order("published_at", { ascending: false });

  type NewsRow = {
    id: string;
    headline: string;
    source: string;
    url: string | null;
    published_at: string;
    angle: string | null;
    category: string;
    stock_tags: string[];
    global_summary: string | null;
    overall_effect: string;
    ticker_impacts: TickerImpact[] | null;
    source_type: string;
    metadata: Record<string, unknown> | null;
  };

  const rawRows = (rows ?? []) as unknown as NewsRow[];
  const categoryFilteredRows = opts.category
    ? rawRows.filter((row) => row.category === opts.category)
    : rawRows;
  const mappedRows: Array<NewsItem | null> = categoryFilteredRows.map((row) => {
    const publishedAt = row.published_at ?? new Date().toISOString();
    const directMatch = resolveDirectStockMatch(
      row.stock_tags ?? [],
      row.ticker_impacts ?? [],
      wlSet,
    );
    if (directMatch.matchedSymbols.length === 0) return null;

    return {
      id: row.id,
      newsItemId: row.id,
      headline: row.headline,
      source: row.source,
      url: row.url ?? undefined,
      publishedAt: formatPublishedAt(publishedAt),
      publishedMinutesAgo: minutesAgo(publishedAt),
      relevanceScore: 75,
      angle: row.angle ?? "",
      category: (row.category ?? "other") as NewsItem["category"],
      stockTags: row.stock_tags ?? [],
      globalSummary: row.global_summary ?? "",
      displayEffect: (row.overall_effect ?? "neutral") as NewsItem["displayEffect"],
      tickerImpacts: row.ticker_impacts ?? [],
      sourceType: (row.source_type ?? "other") as NewsItem["sourceType"],
      sourceConfidence: row.source_type === "edgar" ? "high" : "standard",
      metadata: row.metadata ?? {},
      matchedStockTags: directMatch.matchedSymbols,
      matchSources: ["watchlist"],
      matchReasonCodes:
        directMatch.matchedTags.length > 0
          ? ["watchlist_ticker_tag"]
          : ["watchlist_ticker_impact"],
      isWatchlistMatch: true,
      whyItMatters: `Matches watchlist symbol${directMatch.matchedSymbols.length > 1 ? "s" : ""} ${directMatch.matchedSymbols.join(", ")}.`,
    } satisfies NewsItem;
  });

  const filteredFeed: NewsItem[] = mappedRows.filter(
    (item): item is NewsItem => item !== null,
  );

  const cap = effectiveRecencyCap(opts.maxMinutes);
  const recencyFilteredFeed = filteredFeed.filter(
    (item) => item.publishedMinutesAgo <= cap,
  );
  const paginated = paginateRows(recencyFilteredFeed, opts.page, opts.pageSize);

  return {
    feed: paginated.pageRows,
    portfolioId: null,
    mode: "personal",
    portfolioSymbols: [],
    portfolioSectors: [],
    watchlistSymbols: opts.watchlistSymbols,
    page: paginated.page,
    pageSize: paginated.pageSize,
    totalCount: paginated.totalCount,
    totalPages: paginated.totalPages,
  };
}

async function buildMarketPayload(
  supabase: ServerSupabase,
  opts: {
    portfolioId: string | null;
    portfolioSymbols: string[];
    portfolioSectors: string[];
    watchlistSymbols: string[];
    category: string | null;
    maxMinutes: string | null;
    sourceType: string | null;
    ticker?: string | null;
    page: number;
    pageSize: number;
  },
): Promise<FeedResponsePayload> {
  const holdingSymbols = new Set(
    opts.portfolioSymbols.map((symbol) => symbol.toUpperCase()),
  );
  const wlSymbols = new Set(
    opts.watchlistSymbols.map((symbol) => symbol.toUpperCase()),
  );
  const ticker = opts.ticker?.trim().toUpperCase() || null;

  const publishedSince = new Date(
    Date.now() - FEED_MAX_AGE_MINUTES * 60 * 1000,
  ).toISOString();

  let query = supabase
    .from("news_items")
    .select(
      "id, headline, source, url, published_at, angle, category, stock_tags, " +
        "global_summary, overall_effect, ticker_impacts, source_type, metadata, raw_content",
    )
    .gte("published_at", publishedSince)
    .order("published_at", { ascending: false });

  if (opts.category) {
    query = query.eq("category", opts.category);
  }
  if (opts.sourceType && opts.sourceType !== "headlines") {
    query = query.eq("source_type", opts.sourceType);
  }

  const { data: rows } = await query;

  type NewsRow = {
    id: string;
    headline: string;
    source: string;
    url: string | null;
    published_at: string;
    angle: string | null;
    category: string;
    stock_tags: string[];
    global_summary: string | null;
    overall_effect: string;
    ticker_impacts: TickerImpact[] | null;
    source_type: string;
    metadata: Record<string, unknown> | null;
    raw_content: string | null;
  };

  const rawRows = (rows ?? []) as unknown as NewsRow[];
  const sourceFilteredRows = !opts.sourceType
    ? rawRows
    : opts.sourceType === "headlines"
      ? rawRows.filter((row) => isMarketHeadlineSource(row.source_type))
      : rawRows.filter((row) => row.source_type === opts.sourceType);
  const tickerFilteredRows = !ticker
    ? sourceFilteredRows
    : sourceFilteredRows.filter((row) => {
        const tags = (row.stock_tags ?? []).map((symbol) => symbol.toUpperCase());
        const impacts = (row.ticker_impacts ?? []).map((impact) =>
          impact.symbol.toUpperCase(),
        );
        return tags.includes(ticker) || impacts.includes(ticker);
      });
  const cap = effectiveRecencyCap(opts.maxMinutes);
  const recencyFilteredRows = tickerFilteredRows.filter((row) => {
    const publishedAt = row.published_at ?? new Date().toISOString();
    return minutesAgo(publishedAt) <= cap;
  });
  const paginated = paginateRows(recencyFilteredRows, opts.page, opts.pageSize);

  const feed = paginated.pageRows.map((row) => {
    const publishedAt = row.published_at ?? new Date().toISOString();
    const portfolioDirectMatch = resolveDirectStockMatch(
      row.stock_tags ?? [],
      row.ticker_impacts ?? [],
      holdingSymbols,
    );
    const watchlistDirectMatch = resolveDirectStockMatch(
      row.stock_tags ?? [],
      row.ticker_impacts ?? [],
      wlSymbols,
    );
    const isPortfolioMatch = portfolioDirectMatch.matchedSymbols.length > 0;
    const isWatchlistMatch = watchlistDirectMatch.matchedSymbols.length > 0;

    return {
      id: row.id,
      newsItemId: row.id,
      headline: row.headline,
      source: row.source,
      url: row.url ?? undefined,
      publishedAt: formatPublishedAt(publishedAt),
      publishedMinutesAgo: minutesAgo(publishedAt),
      angle: row.angle ?? "",
      category: (row.category ?? "other") as NewsItem["category"],
      stockTags: row.stock_tags ?? [],
      globalSummary: row.global_summary ?? "",
      displayEffect: (row.overall_effect ?? "neutral") as NewsItem["displayEffect"],
      tickerImpacts: row.ticker_impacts ?? [],
      sourceType: (row.source_type ?? "other") as NewsItem["sourceType"],
      sourceConfidence:
        (row.source_type === "edgar" ? "high" : "standard") as NewsItem["sourceConfidence"],
      metadata: row.metadata ?? {},
      isPortfolioMatch,
      isWatchlistMatch,
      matchedStockTags: [
        ...new Set([
          ...portfolioDirectMatch.matchedSymbols,
          ...watchlistDirectMatch.matchedSymbols,
        ]),
      ],
    } satisfies NewsItem;
  });

  return {
    feed,
    portfolioId: opts.portfolioId,
    mode: "market",
    portfolioSymbols: opts.portfolioSymbols,
    portfolioSectors: opts.portfolioSectors,
    watchlistSymbols: opts.watchlistSymbols,
    page: paginated.page,
    pageSize: paginated.pageSize,
    totalCount: paginated.totalCount,
    totalPages: paginated.totalPages,
  };
}
