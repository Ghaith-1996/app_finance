import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MatchReasonCode,
  MatchSource,
  StockEffect,
  TickerImpact,
} from "@/lib/types";
import { getAIProvider } from "./ai";
import type { HoldingContext, PortfolioMatchAssessment } from "./ai";
import {
  containsNormalizedTerm,
  normalizeMatchText,
} from "./ai/holding-name-utils";
import { resolveDirectStockMatch } from "./news/direct-match";
import { newsWindowCutoffIso } from "./news/pool-snapshot";

/** Newest-first cap on global `news_items` considered per analysis run. */
export const ANALYSIS_NEWS_POOL_LIMIT = 500;

/** Minimum boosted relevance to persist a `feed_item` (after EDGAR boost). */
export const ANALYSIS_RELEVANCE_MIN = 60;

/** Returned when analysis completes (or fails after creating a run). */
export interface AnalysisRunMetadata {
  /** Total `news_items` in the DB with `published_at` in the last 24 hours. */
  poolCount24h: number;
  /** Newest `published_at` in that window, or null if the pool is empty. */
  latestPublishedAt24h: string | null;
  /** Rows actually scored (up to {@link ANALYSIS_NEWS_POOL_LIMIT}). */
  candidatesScored: number;
  /** `feed_items` inserted for this run (relevance >= threshold). */
  feedItemsCreated: number;
  /** AI call attempts counted for this run (insights + per-article scoring/generation). */
  aiAttempts: number;
  /** AI failures observed while continuing a best-effort run. */
  aiFailures: number;
  /** Whether the run was marked degraded due to unreliable AI output quality. */
  degraded: boolean;
}

type AnalysisStatus =
  | "queued"
  | "processing_holdings"
  | "mapping_news"
  | "generating_insights"
  | "complete"
  | "degraded"
  | "failed";

export type AnalysisRunErrorCode =
  | "analysis_already_running"
  | "portfolio_not_found"
  | "analysis_failed";

const ACTIVE_ANALYSIS_RUN_STATUSES: AnalysisStatus[] = [
  "queued",
  "processing_holdings",
  "mapping_news",
  "generating_insights",
];
const ANALYSIS_HISTORY_RUN_LIMIT = 3;
const FEED_ITEM_RETENTION_DAYS = 14;
const ANALYSIS_ACTIVE_RUN_STALE_MS = 15 * 60 * 1000;


function toDbSentiment(s: string): "positive" | "watch" | "negative" | "neutral" {
  if (s === "positive" || s === "watch" || s === "negative" || s === "neutral") return s;
  return "neutral";
}

function toDbImpact(s: string): "High" | "Medium" | "Low" {
  if (s === "High" || s === "Medium" || s === "Low") return s;
  return "Low";
}

function effectToSentiment(effect: StockEffect): "positive" | "negative" | "neutral" {
  if (effect === "bullish") return "positive";
  if (effect === "bearish") return "negative";
  return "neutral";
}

function hasCausalLanguage(text: string): boolean {
  return [
    "because",
    "due to",
    "driven by",
    "sensitive to",
    "exposure",
    "benefit",
    "pressure",
    "demand",
    "supply",
    "margin",
    "revenue",
    "earnings",
    "rates",
    "tariff",
    "cost",
    "pricing",
  ].some((phrase) => text.includes(phrase));
}

function isGenericWhyTemplate(text: string): boolean {
  return [
    "this story may affect positions",
    "this story may be relevant to holdings",
    "may affect positions such as",
    "could matter for your holdings",
  ].some((phrase) => text.includes(phrase));
}

function sanitizeWhyItMatters(
  rawWhyItMatters: string,
  holdings: HoldingContext[],
  matchedSymbols: string[],
): string {
  const cleaned = rawWhyItMatters.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const normalized = normalizeMatchText(cleaned);
  if (!normalized || isGenericWhyTemplate(normalized)) return "";

  const relevantHoldings = holdings.filter((holding) =>
    matchedSymbols.includes(holding.symbol.toUpperCase()),
  );

  const mentionsHolding = relevantHoldings.some(
    (holding) =>
      containsNormalizedTerm(normalized, holding.symbol) ||
      containsNormalizedTerm(normalized, holding.company),
  );

  if (!mentionsHolding && !hasCausalLanguage(normalized)) {
    return "";
  }

  return cleaned;
}

function validateIndirectPortfolioMatch(
  articleText: string,
  holdings: HoldingContext[],
  assessment: PortfolioMatchAssessment,
): {
  matchedHoldings: string[];
  matchedSectors: string[];
  matchReasonCodes: MatchReasonCode[];
  whyItMatters: string;
} {
  const normalizedArticle = normalizeMatchText(articleText);
  const holdingBySymbol = new Map(
    holdings.map((holding) => [holding.symbol.toUpperCase(), holding]),
  );
  const assessmentMatched = [...new Set(
    assessment.matchedHoldings.map((symbol) => symbol.toUpperCase()),
  )].filter((symbol) => holdingBySymbol.has(symbol));
  const sanitizedWhy = sanitizeWhyItMatters(
    assessment.whyItMatters,
    holdings,
    assessmentMatched,
  );
  const normalizedWhy = normalizeMatchText(sanitizedWhy);

  const sectorSymbols =
    assessment.matchReasonCodes.includes("sector_exposure_explicit") && sanitizedWhy
      ? assessmentMatched.filter((symbol) => {
          const holding = holdingBySymbol.get(symbol);
          if (!holding) return false;

          const mentionsSector = containsNormalizedTerm(normalizedArticle, holding.sector);
          const mentionsHoldingInWhy =
            containsNormalizedTerm(normalizedWhy, holding.symbol) ||
            containsNormalizedTerm(normalizedWhy, holding.company);

          return mentionsSector && mentionsHoldingInWhy && hasCausalLanguage(normalizedWhy);
        })
      : [];

  const matchedHoldings = holdings
    .map((holding) => holding.symbol.toUpperCase())
    .filter((symbol) => sectorSymbols.includes(symbol));

  const matchReasonCodes = sectorSymbols.length > 0
    ? (["sector_exposure_explicit"] as MatchReasonCode[])
    : [];

  const matchedSectors = [...new Set(
    holdings
      .filter((holding) => matchedHoldings.includes(holding.symbol.toUpperCase()))
      .map((holding) => holding.sector),
  )];

  return {
    matchedHoldings,
    matchedSectors,
    matchReasonCodes,
    whyItMatters: sanitizedWhy,
  };
}

function directMatchRelevance(match: DirectStockMatch): number {
  if (match.matchedTags.length > 0 && match.matchedImpacts.length > 0) return 96;
  if (match.matchedTags.length > 0) return 92;
  if (match.matchedImpacts.length > 0) return 88;
  if (match.matchedSymbols.length > 0) return 80;
  return 0;
}

type DirectStockMatch = ReturnType<typeof resolveDirectStockMatch>;

function directWhyItMatters(
  match: DirectStockMatch,
  holdings: HoldingContext[],
  tickerImpacts: TickerImpact[],
): string {
  const holdingBySymbol = new Map(
    holdings.map((holding) => [holding.symbol.toUpperCase(), holding]),
  );
  const matchedNames = match.matchedSymbols
    .map((symbol) => holdingBySymbol.get(symbol)?.symbol ?? symbol)
    .filter(Boolean);

  if (matchedNames.length === 0) return "";

  if (match.matchedImpacts.length > 0) {
    const impact = tickerImpacts.find((item) =>
      match.matchedImpacts.includes(item.symbol.toUpperCase()),
    );
    if (impact) {
      return `The article directly affects held stock ${matchedNames.join(", ")} and the extracted ticker impact is ${impact.effect}.`;
    }
  }

  return `The article directly maps to held stock ${matchedNames.join(", ")} based on the extracted stock links.`;
}

async function purgePortfolioAnalysisHistory(
  supabase: SupabaseClient,
  portfolioId: string,
): Promise<void> {
  const { data: runRows, error: runListError } = await supabase
    .from("analysis_runs")
    .select("id")
    .eq("portfolio_id", portfolioId)
    .order("created_at", { ascending: false });

  if (runListError || !runRows || runRows.length <= ANALYSIS_HISTORY_RUN_LIMIT) {
    return;
  }

  const staleRunIds = runRows.slice(ANALYSIS_HISTORY_RUN_LIMIT).map((row) => row.id);
  if (staleRunIds.length === 0) return;

  await supabase.from("analysis_runs").delete().in("id", staleRunIds);
}

async function purgeStaleFeedItems(
  supabase: SupabaseClient,
): Promise<void> {
  const cutoffIso = new Date(
    Date.now() - FEED_ITEM_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  await supabase.from("feed_items").delete().lt("created_at", cutoffIso);
}

function getActiveRunStartedAtMs(input: {
  updated_at?: string | null;
  started_at?: string | null;
  created_at?: string | null;
}): number | null {
  const source = input.updated_at ?? input.started_at ?? input.created_at;
  if (!source) return null;
  const timestamp = new Date(source).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function reclaimStaleActiveAnalysisRuns(
  supabase: SupabaseClient,
  portfolioId: string,
): Promise<number> {
  const { data: activeRuns, error } = await supabase
    .from("analysis_runs")
    .select("id, status, updated_at, started_at, created_at")
    .eq("portfolio_id", portfolioId)
    .in("status", ACTIVE_ANALYSIS_RUN_STATUSES)
    .order("created_at", { ascending: false });

  if (error || !activeRuns?.length) {
    return 0;
  }

  const staleBeforeMs = Date.now() - ANALYSIS_ACTIVE_RUN_STALE_MS;
  const staleRunIds = activeRuns
    .filter((run) => {
      const startedAtMs = getActiveRunStartedAtMs(run);
      return startedAtMs != null && startedAtMs < staleBeforeMs;
    })
    .map((run) => run.id);

  if (staleRunIds.length === 0) {
    return 0;
  }

  const completedAt = new Date().toISOString();
  for (const staleRunId of staleRunIds) {
    await supabase
      .from("analysis_runs")
      .update({
        status: "failed",
        progress: 0,
        completed_at: completedAt,
      })
      .eq("id", staleRunId);
  }

  return staleRunIds.length;
}

/**
 * Score the global 24-hour news pool against a portfolio.
 *
 * Reads the newest 500 articles from news_items (last 24h), AI-scores every
 * candidate against the portfolio, and persists feed_items only for articles
 * with relevance_score >= 60. No generic fallback — if nothing qualifies the
 * personal feed stays empty.
 */
export async function runAnalysis(
  supabase: SupabaseClient,
  portfolioId: string,
): Promise<{
  runId: string | null;
  error: string | null;
  code?: AnalysisRunErrorCode;
  meta?: AnalysisRunMetadata;
}> {
  const ai = getAIProvider();

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios")
    .select("id, user_id")
    .eq("id", portfolioId)
    .single();

  if (portfolioError || !portfolio) {
    return {
      runId: null,
      error: "Portfolio not found",
      code: "portfolio_not_found",
    };
  }

  try {
    await reclaimStaleActiveAnalysisRuns(supabase, portfolioId);
  } catch {
    // Preserve the old behavior if stale-run recovery cannot complete.
  }

  const createRun = () =>
    supabase
      .from("analysis_runs")
      .insert({
        portfolio_id: portfolioId,
        status: "queued",
        progress: 0,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

  let { data: run, error: runError } = await createRun();

  if (runError || !run) {
    const isConcurrentRun =
      (runError as { code?: string } | null)?.code === "23505";
    if (isConcurrentRun) {
      let reclaimedRuns = 0;
      try {
        reclaimedRuns = await reclaimStaleActiveAnalysisRuns(supabase, portfolioId);
      } catch {
        reclaimedRuns = 0;
      }

      if (reclaimedRuns > 0) {
        const retry = await createRun();
        run = retry.data;
        runError = retry.error;
      }
    }
  }

  if (runError || !run) {
    const isConcurrentRun =
      (runError as { code?: string } | null)?.code === "23505";
    if (isConcurrentRun) {
      return {
        runId: null,
        error: "An analysis run is already in progress for this portfolio.",
        code: "analysis_already_running",
      };
    }
    return {
      runId: null,
      error: runError?.message ?? "Failed to create run",
      code: "analysis_failed",
    };
  }

  const runId = run.id;
  let aiAttempts = 0;
  let aiFailures = 0;

  const updateRun = async (status: AnalysisStatus, progress: number) => {
    await supabase
      .from("analysis_runs")
      .update({
        status,
        progress,
        ...(status === "complete" || status === "degraded" || status === "failed"
          ? { completed_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", runId);
  };

  try {
    await updateRun("processing_holdings", 15);

    const { data: holdingsRows, error: holdingsError } = await supabase
      .from("holdings")
      .select("id, symbol, company, sector, market, source, price, daily_change, allocation, thesis")
      .eq("portfolio_id", portfolioId);

    if (holdingsError) {
      await updateRun("failed", 0);
      return { runId, error: holdingsError.message };
    }

    const holdings = (holdingsRows ?? []).map((r) => ({
      id: r.id,
      symbol: r.symbol,
      company: r.company,
      sector: r.sector,
      market: r.market,
      source: r.source,
      price: Number(r.price),
      dailyChange: Number(r.daily_change),
      allocation: Number(r.allocation),
      thesis: r.thesis ?? "",
    }));

    const { data: watchlistRows } = await supabase
      .from("watchlist_items")
      .select("symbol")
      .eq("user_id", portfolio.user_id);

    const watchlistSymbols = new Set(
      (watchlistRows ?? [])
        .map((r) => (r.symbol as string).toUpperCase())
        .filter(Boolean),
    );

    await updateRun("mapping_news", 35);

    const newsCutoff = newsWindowCutoffIso();

    const { count: totalInWindow, error: countError } = await supabase
      .from("news_items")
      .select("*", { count: "exact", head: true })
      .gte("published_at", newsCutoff);

    if (countError) {
      await updateRun("failed", 0);
      return { runId, error: countError.message };
    }

    const poolCount24h = totalInWindow ?? 0;

    const { data: latestRow } = await supabase
      .from("news_items")
      .select("published_at")
      .gte("published_at", newsCutoff)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const latestPublishedAt24h =
      (latestRow?.published_at as string | undefined) ?? null;

    const { data: newsRows, error: newsError } = await supabase
      .from("news_items")
      .select("id, headline, source, url, published_at, angle, raw_content, category, stock_tags, global_summary, overall_effect, ticker_impacts, source_type, metadata")
      .gte("published_at", newsCutoff)
      .order("published_at", { ascending: false })
      .limit(ANALYSIS_NEWS_POOL_LIMIT);

    if (newsError) {
      await updateRun("failed", 0);
      return { runId, error: newsError.message };
    }

    const newsItems = newsRows ?? [];
    const candidatesScored = newsItems.length;

    if (newsItems.length === 0) {
      await updateRun("complete", 100);
      try {
        await purgePortfolioAnalysisHistory(supabase, portfolioId);
        await purgeStaleFeedItems(supabase);
      } catch {
        // Non-fatal retention cleanup failure; keep the completed run state.
      }
      return {
        runId,
        error: null,
        meta: {
          poolCount24h,
          latestPublishedAt24h,
          candidatesScored: 0,
          feedItemsCreated: 0,
          aiAttempts: 0,
          aiFailures: 0,
          degraded: false,
        },
      };
    }

    await updateRun("generating_insights", 50);

    const newsContexts = newsItems.map((n) => ({
      headline: n.headline,
      source: n.source,
      rawContent: n.raw_content ?? undefined,
      publishedAt: n.published_at,
      angle: n.angle ?? undefined,
    }));

    let insights: Array<{ title: string; value: string; detail: string }> = [];
    aiAttempts++;
    try {
      insights = await ai.generateInsights(holdings, newsContexts);
    } catch {
      aiFailures++;
      insights = [];
    }

    if (insights.length > 0) {
      await supabase.from("portfolio_insights").insert(
        insights.map((i) => ({
          analysis_run_id: runId,
          portfolio_id: portfolioId,
          title: i.title,
          value: i.value,
          detail: i.detail,
        })),
      );
    }

    let feedItemsCreated = 0;
    let step = 0;
    const total = newsItems.length;
    for (const news of newsItems) {
      const article = `${news.headline}. ${news.raw_content ?? ""}`;

      const hasPrecomputed = !!(news.global_summary && news.overall_effect);

      const sourceType = (news as Record<string, unknown>).source_type as string | undefined;
      const sourceBoost = sourceType === "edgar" ? 15 : 0;

      const sourceConfidence = sourceType === "edgar" ? "high" : "standard";

      const tickerImpacts: TickerImpact[] = Array.isArray(news.ticker_impacts)
        ? (news.ticker_impacts as TickerImpact[])
        : [];
      let displayEffect: StockEffect = (news.overall_effect as StockEffect) ?? "neutral";
      const articleTags: string[] = (news.stock_tags as string[]) ?? [];
      const holdingSymbols = new Set(holdings.map((h) => h.symbol.toUpperCase()));

      const portfolioMatch = resolveDirectStockMatch(articleTags, tickerImpacts, holdingSymbols);
      const watchlistMatch = resolveDirectStockMatch(articleTags, tickerImpacts, watchlistSymbols);
      const hasPortfolioDirectMatch = portfolioMatch.matchedSymbols.length > 0;
      const hasWatchlistDirectMatch = watchlistMatch.matchedSymbols.length > 0;

      let boostedRelevance = 0;
      let finalHoldings: string[] = [];
      let finalSectors: string[] = [];
      let finalWhyItMatters = "";
      let finalMatchedStockTags: string[] = [];
      let finalMatchReasonCodes: MatchReasonCode[] = [];
      const finalMatchSources: MatchSource[] = [];

      if (hasPortfolioDirectMatch) {
        finalMatchSources.push("portfolio");
        boostedRelevance = Math.min(100, directMatchRelevance(portfolioMatch) + sourceBoost);
        finalHoldings = portfolioMatch.matchedSymbols;
        finalSectors = [...new Set(
          holdings
            .filter((holding) => portfolioMatch.matchedSymbols.includes(holding.symbol.toUpperCase()))
            .map((holding) => holding.sector),
        )];
        finalWhyItMatters = directWhyItMatters(portfolioMatch, holdings, tickerImpacts);
        finalMatchedStockTags = portfolioMatch.matchedTags;
        finalMatchReasonCodes = [...portfolioMatch.matchReasonCodes];

        if (hasWatchlistDirectMatch) {
          finalMatchSources.push("watchlist");
          const wlCodes: MatchReasonCode[] = [];
          if (watchlistMatch.matchedTags.length > 0) wlCodes.push("watchlist_ticker_tag");
          if (watchlistMatch.matchedImpacts.length > 0) wlCodes.push("watchlist_ticker_impact");
          finalMatchReasonCodes.push(...wlCodes);
          for (const tag of watchlistMatch.matchedTags) {
            if (!finalMatchedStockTags.includes(tag)) finalMatchedStockTags.push(tag);
          }
        }
      } else if (hasWatchlistDirectMatch) {
        finalMatchSources.push("watchlist");
        boostedRelevance = Math.min(100, 75 + sourceBoost);
        finalMatchedStockTags = watchlistMatch.matchedTags;
        const wlCodes: MatchReasonCode[] = [];
        if (watchlistMatch.matchedTags.length > 0) wlCodes.push("watchlist_ticker_tag");
        if (watchlistMatch.matchedImpacts.length > 0) wlCodes.push("watchlist_ticker_impact");
        finalMatchReasonCodes = wlCodes;
        finalWhyItMatters = `This article directly mentions watchlist symbol${watchlistMatch.matchedSymbols.length > 1 ? "s" : ""} ${watchlistMatch.matchedSymbols.join(", ")}.`;
      } else {
        if (holdings.length === 0) {
          step++;
          await updateRun("generating_insights", 50 + Math.floor((step / total) * 45));
          continue;
        }

        let assessment: PortfolioMatchAssessment;
        aiAttempts++;
        try {
          assessment = await ai.assessPortfolioMatch(article, holdings);
        } catch {
          aiFailures++;
          step++;
          await updateRun("generating_insights", 50 + Math.floor((step / total) * 45));
          continue;
        }
        boostedRelevance = Math.min(100, assessment.relevanceScore + sourceBoost);

        if (boostedRelevance < ANALYSIS_RELEVANCE_MIN) {
          step++;
          await updateRun("generating_insights", 50 + Math.floor((step / total) * 45));
          continue;
        }

        const validatedIndirect = validateIndirectPortfolioMatch(article, holdings, assessment);

        if (validatedIndirect.matchReasonCodes.length === 0) {
          step++;
          await updateRun("generating_insights", 50 + Math.floor((step / total) * 45));
          continue;
        }

        finalMatchSources.push("portfolio");
        finalHoldings = validatedIndirect.matchedHoldings;
        finalSectors = validatedIndirect.matchedSectors;
        finalWhyItMatters = validatedIndirect.whyItMatters;
        finalMatchedStockTags = [];
        finalMatchReasonCodes = validatedIndirect.matchReasonCodes;
      }

      if (finalHoldings.length > 0 && tickerImpacts.length > 0) {
        const matchedImpact = tickerImpacts.find((ti) =>
          finalHoldings.includes(ti.symbol.toUpperCase()),
        );
        if (matchedImpact) displayEffect = matchedImpact.effect;
      }

      let sentiment: "positive" | "watch" | "negative" | "neutral" =
        effectToSentiment(displayEffect);
      if (!hasPrecomputed) {
        aiAttempts++;
        try {
          sentiment = toDbSentiment(await ai.scoreSentiment(article));
        } catch {
          aiFailures++;
        }
      }

      let aiSummary =
        (typeof news.global_summary === "string" && news.global_summary.trim()) ||
        news.headline;
      if (!hasPrecomputed) {
        aiAttempts++;
        try {
          const generatedSummary = await ai.generateSummary(article, holdings);
          if (generatedSummary?.trim()) {
            aiSummary = generatedSummary;
          } else {
            aiFailures++;
          }
        } catch {
          aiFailures++;
        }
      }

      await supabase.from("feed_items").insert({
        analysis_run_id: runId,
        news_item_id: news.id,
        portfolio_id: portfolioId,
        relevance_score: boostedRelevance,
        sentiment,
        impact: toDbImpact(
          boostedRelevance >= 80 ? "High" : boostedRelevance >= ANALYSIS_RELEVANCE_MIN ? "Medium" : "Low",
        ),
        holdings: finalHoldings,
        sectors: finalSectors,
        ai_summary: aiSummary,
        why_it_matters: finalWhyItMatters,
        matched_stock_tags: finalMatchedStockTags,
        match_reason_codes: finalMatchReasonCodes,
        match_sources: finalMatchSources,
        display_effect: displayEffect,
        source_confidence: sourceConfidence,
      });

      feedItemsCreated++;
      step++;
      await updateRun(
        "generating_insights",
        50 + Math.floor((step / total) * 45),
      );
    }

    const aiFailureRate = aiAttempts > 0 ? aiFailures / aiAttempts : 0;
    const degraded =
      aiFailures > 0 &&
      (aiFailureRate >= 0.25 || (candidatesScored > 0 && feedItemsCreated === 0));

    await updateRun(degraded ? "degraded" : "complete", 100);
    try {
      await purgePortfolioAnalysisHistory(supabase, portfolioId);
      await purgeStaleFeedItems(supabase);
    } catch {
      // Non-fatal retention cleanup failure; keep the completed/degraded run state.
    }
    return {
      runId,
      error: null,
      meta: {
        poolCount24h,
        latestPublishedAt24h,
        candidatesScored,
        feedItemsCreated,
        aiAttempts,
        aiFailures,
        degraded,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    await updateRun("failed", 0);
    return { runId, error: message, code: "analysis_failed" };
  }
}
