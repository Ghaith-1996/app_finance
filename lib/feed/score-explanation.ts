import type { FeedMode, MatchReasonCode, NewsItem } from "@/lib/types";
import { isMarketHeadlineSource } from "@/lib/services/news/source-config";
import { categoryLabel, effectLabel, matchReasonLabel } from "@/lib/utils";

export type ScoreExplanationTone =
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "neutral";

export interface ScoreExplanationFactor {
  id: string;
  label: string;
  detail: string;
  tone: ScoreExplanationTone;
}

export interface ScoreExplanation {
  title: string;
  scoreLabel: string | null;
  confidenceLabel: string;
  horizonLabel: string;
  summary: string;
  factors: ScoreExplanationFactor[];
}

const REASON_DETAILS: Record<MatchReasonCode, string> = {
  held_ticker_tag: "A held ticker appears in the article tags.",
  held_ticker_impact: "An extracted ticker impact mentions a holding.",
  held_company_mention: "A company mention matched one of your holdings.",
  sector_exposure_explicit: "The article names a sector represented in your portfolio.",
  watchlist_ticker_tag: "A watchlist ticker appears in the article tags.",
  watchlist_ticker_impact: "An extracted ticker impact mentions a watchlist symbol.",
};

const EVENT_RISK_CATEGORIES = new Set([
  "earnings",
  "regulation",
  "macro",
  "geopolitics",
  "deals",
]);

function uniqueSymbols(...groups: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const symbols: string[] = [];

  for (const group of groups) {
    for (const raw of group ?? []) {
      const symbol = raw.trim().toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      symbols.push(symbol);
    }
  }

  return symbols;
}

function pushUnique(
  factors: ScoreExplanationFactor[],
  factor: ScoreExplanationFactor,
) {
  if (factors.some((existing) => existing.id === factor.id)) return;
  factors.push(factor);
}

function formatSymbolList(symbols: string[]): string {
  if (symbols.length === 0) return "Tracked symbols are connected to this story.";
  const visible = symbols.slice(0, 4);
  const suffix = symbols.length > visible.length ? ` +${symbols.length - visible.length}` : "";
  return `${visible.join(", ")}${suffix}`;
}

function readableList(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function confidenceLabel(story: NewsItem): string {
  if (story.sourceConfidence === "high") return "High confidence";
  return "Standard confidence";
}

function horizonLabel(minutesAgo: number): string {
  if (minutesAgo <= 60) return "Past hour";
  if (minutesAgo <= 120) return "Past 2 hours";
  if (minutesAgo <= 360) return "Same session";
  return "Last 24 hours";
}

export function buildScoreExplanation(
  story: NewsItem,
  mode: FeedMode,
): ScoreExplanation {
  const factors: ScoreExplanationFactor[] = [];
  const isMarket = mode === "market";
  const connectedSymbols = uniqueSymbols(
    story.holdings,
    story.matchedStockTags,
    story.stockTags,
  );

  if (!isMarket) {
    for (const reason of story.matchReasonCodes ?? []) {
      pushUnique(factors, {
        id: `reason-${reason}`,
        label: matchReasonLabel(reason),
        detail: REASON_DETAILS[reason],
        tone: reason.startsWith("watchlist") ? "neutral" : "brand",
      });
    }

    if (connectedSymbols.length > 0) {
      pushUnique(factors, {
        id: "connected-symbols",
        label: "Connected symbols",
        detail: formatSymbolList(connectedSymbols),
        tone: "brand",
      });
    }

    if (story.impact === "High" || story.impact === "Medium") {
      pushUnique(factors, {
        id: "impact",
        label: `${story.impact} impact`,
        detail:
          story.impact === "High"
            ? "The analysis marked this as a high-priority portfolio event."
            : "The analysis marked this as a meaningful portfolio event.",
        tone: story.impact === "High" ? "warning" : "neutral",
      });
    }

    if (story.displayEffect !== "neutral") {
      pushUnique(factors, {
        id: "direction",
        label: `${effectLabel(story.displayEffect)} read`,
        detail: `Extracted signals lean ${effectLabel(story.displayEffect).toLowerCase()} for connected tickers.`,
        tone: story.displayEffect === "bullish" ? "success" : "danger",
      });
    }
  } else {
    if (story.isPortfolioMatch) {
      pushUnique(factors, {
        id: "portfolio-overlap",
        label: "Portfolio overlap",
        detail: "At least one tracked portfolio symbol matched this market story.",
        tone: "brand",
      });
    }

    if (story.isWatchlistMatch) {
      pushUnique(factors, {
        id: "watchlist-overlap",
        label: "Watchlist overlap",
        detail: "A watchlist symbol matched this market story.",
        tone: "neutral",
      });
    }

    if (connectedSymbols.length > 0) {
      pushUnique(factors, {
        id: "market-symbols",
        label: "Ticker overlap",
        detail: formatSymbolList(connectedSymbols),
        tone: story.isPortfolioMatch ? "brand" : "neutral",
      });
    }
  }

  if (story.sourceConfidence === "high" || isMarketHeadlineSource(story.sourceType)) {
    pushUnique(factors, {
      id: "source-confidence",
      label: "Source quality",
      detail:
        story.sourceType === "edgar"
          ? "SEC filing source with high-confidence ingestion."
          : story.sourceConfidence === "high"
            ? `${story.source} is treated as a high-confidence market source.`
            : `${story.source} is part of the market headline source set.`,
      tone: "success",
    });
  }

  if (story.publishedMinutesAgo <= 120) {
    pushUnique(factors, {
      id: "recency",
      label: "Fresh story",
      detail:
        story.publishedMinutesAgo <= 60
          ? "Published within the past hour."
          : "Published within the past two hours.",
      tone: "neutral",
    });
  }

  if (EVENT_RISK_CATEGORIES.has(story.category)) {
    pushUnique(factors, {
      id: "event-risk",
      label: "Event category",
      detail: `${categoryLabel(story.category)} news can move positioning or risk assumptions.`,
      tone: story.category === "earnings" || story.category === "regulation" ? "warning" : "neutral",
    });
  }

  const visibleFactors = factors.slice(0, 6);
  const factorNames = visibleFactors.slice(0, 3).map((factor) => factor.label.toLowerCase());
  const fallbackSummary = isMarket
    ? "Market relevance uses source quality, recency, category, and overlap with tracked symbols."
    : "The match score uses portfolio context, watchlist overlap, extracted ticker signals, source quality, and recency.";

  return {
    title: isMarket ? "Market drivers" : "Score drivers",
    scoreLabel:
      !isMarket && story.relevanceScore != null
        ? `${story.relevanceScore}% match`
        : null,
    confidenceLabel: confidenceLabel(story),
    horizonLabel: horizonLabel(story.publishedMinutesAgo),
    summary:
      factorNames.length > 0
        ? `Driven by ${readableList(factorNames)}.`
        : fallbackSummary,
    factors: visibleFactors,
  };
}
