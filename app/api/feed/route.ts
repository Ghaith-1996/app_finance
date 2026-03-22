import { createClient } from "@/lib/supabase/server";
import type { FeedMode, MatchReasonCode, TickerImpact } from "@/lib/types";
import { resolveDirectStockMatch } from "@/lib/services/news/direct-match";

/** Hard cap: only articles from the last 24 hours appear in either feed mode. */
const FEED_MAX_AGE_MINUTES = 24 * 60;

function effectiveRecencyCap(maxMinutesParam: string | null): number {
  if (!maxMinutesParam) return FEED_MAX_AGE_MINUTES;
  const parsed = parseInt(maxMinutesParam, 10);
  if (Number.isNaN(parsed) || parsed < 0) return FEED_MAX_AGE_MINUTES;
  return Math.min(parsed, FEED_MAX_AGE_MINUTES);
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * GET /api/feed?mode=personal|market&portfolioId=...&holding=...&sector=...
 *              &category=...&maxMinutes=...&ticker=...&sourceType=...
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { searchParams } = new URL(request.url);
  const mode: FeedMode =
    searchParams.get("mode") === "market" ? "market" : "personal";
  const category = searchParams.get("category");
  const maxMinutes = searchParams.get("maxMinutes");

  // --- Resolve portfolio (needed by both modes for context) ---
  let portfolioId = searchParams.get("portfolioId");
  if (!portfolioId) {
    const { data: portfolios } = await supabase
      .from("portfolios")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    portfolioId = portfolios?.[0]?.id ?? null;
  }

  if (!portfolioId) {
    return json({ feed: [], portfolioId: null, mode });
  }

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .single();

  if (!portfolio) {
    return json({ error: "Portfolio not found" }, 404);
  }

  const { data: holdingRows } = await supabase
    .from("holdings")
    .select("symbol, sector")
    .eq("portfolio_id", portfolioId);

  const portfolioSymbols = [...new Set(
    (holdingRows ?? [])
      .map((holding) => String(holding.symbol ?? "").toUpperCase())
      .filter(Boolean),
  )];
  const portfolioSectors = [...new Set(
    (holdingRows ?? [])
      .map((holding) => String(holding.sector ?? ""))
      .filter(Boolean),
  )];

  if (mode === "market") {
    return handleMarketMode(supabase, {
      portfolioId,
      portfolioSymbols,
      portfolioSectors,
      category,
      maxMinutes,
      sourceType: searchParams.get("sourceType"),
    });
  }

  return handlePersonalMode(supabase, {
    portfolioId,
    portfolioSymbols,
    portfolioSectors,
    holding: searchParams.get("holding"),
    sector: searchParams.get("sector"),
    category,
    maxMinutes,
  });
}

// ---------------------------------------------------------------------------
// Personal mode — scoped to the latest completed analysis run
// ---------------------------------------------------------------------------

async function handlePersonalMode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    portfolioId: string;
    portfolioSymbols: string[];
    portfolioSectors: string[];
    holding: string | null;
    sector: string | null;
    category: string | null;
    maxMinutes: string | null;
  },
) {
  const { data: latestRun } = await supabase
    .from("analysis_runs")
    .select("id")
    .eq("portfolio_id", opts.portfolioId)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRun) {
    return json({
      feed: [],
      portfolioId: opts.portfolioId,
      mode: "personal" as const,
      portfolioSymbols: opts.portfolioSymbols,
      portfolioSectors: opts.portfolioSectors,
    });
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

  const { data: rows, error } = await query;

  if (error) {
    return json({ error: error.message }, 500);
  }

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
      sentiment: row.sentiment,
      impact: row.impact,
      holdings: row.holdings ?? [],
      sectors: row.sectors ?? [],
      aiSummary: row.ai_summary ?? "",
      whyItMatters: row.why_it_matters ?? "",
      angle: news?.angle ?? "",
      category: news?.category ?? "other",
      stockTags: news?.stock_tags ?? [],
      matchedStockTags: row.matched_stock_tags ?? [],
      matchReasonCodes: row.match_reason_codes ?? [],
      globalSummary: news?.global_summary ?? "",
      displayEffect: row.display_effect ?? "neutral",
      tickerImpacts: news?.ticker_impacts ?? [],
      sourceType: news?.source_type ?? "other",
      sourceConfidence: row.source_confidence ?? "standard",
      metadata: news?.metadata ?? {},
    };
  });

  if (opts.category) {
    feed = feed.filter((item) => item.category === opts.category);
  }
  const cap = effectiveRecencyCap(opts.maxMinutes);
  feed = feed.filter((item) => item.publishedMinutesAgo <= cap);

  return json({
    feed,
    portfolioId: opts.portfolioId,
    mode: "personal" as const,
    portfolioSymbols: opts.portfolioSymbols,
    portfolioSectors: opts.portfolioSectors,
  });
}

// ---------------------------------------------------------------------------
// Market mode — reads from news_items directly, highlights portfolio matches
// ---------------------------------------------------------------------------

async function handleMarketMode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  opts: {
    portfolioId: string;
    portfolioSymbols: string[];
    portfolioSectors: string[];
    category: string | null;
    maxMinutes: string | null;
    sourceType: string | null;
  },
) {
  const holdingSymbols = new Set(opts.portfolioSymbols.map((symbol) => symbol.toUpperCase()));

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
    .order("published_at", { ascending: false })
    .limit(60);

  if (opts.category) {
    query = query.eq("category", opts.category);
  }
  if (opts.sourceType) {
    query = query.eq("source_type", opts.sourceType);
  }

  const { data: rows, error } = await query;

  if (error) {
    return json({ error: error.message }, 500);
  }

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
  let feed = rawRows.map((row) => {
    const publishedAt = row.published_at ?? new Date().toISOString();
    const directMatch = resolveDirectStockMatch(
      row.stock_tags ?? [],
      row.ticker_impacts ?? [],
      holdingSymbols,
    );
    const isPortfolioMatch = directMatch.matchedSymbols.length > 0;

    return {
      id: row.id,
      newsItemId: row.id,
      headline: row.headline,
      source: row.source,
      url: row.url ?? undefined,
      publishedAt: formatPublishedAt(publishedAt),
      publishedMinutesAgo: minutesAgo(publishedAt),
      angle: row.angle ?? "",
      category: row.category ?? "other",
      stockTags: row.stock_tags ?? [],
      globalSummary: row.global_summary ?? "",
      displayEffect: row.overall_effect ?? "neutral",
      tickerImpacts: row.ticker_impacts ?? [],
      sourceType: row.source_type ?? "other",
      sourceConfidence:
        row.source_type === "edgar" ? "high" : ("standard" as const),
      metadata: row.metadata ?? {},
      isPortfolioMatch,
      matchedStockTags: directMatch.matchedSymbols,
    };
  });

  const cap = effectiveRecencyCap(opts.maxMinutes);
  feed = feed.filter((item) => item.publishedMinutesAgo <= cap);

  return json({
    feed,
    portfolioId: opts.portfolioId,
    mode: "market" as const,
    portfolioSymbols: opts.portfolioSymbols,
    portfolioSectors: opts.portfolioSectors,
  });
}
