import type { Holding, PortfolioFeedHighlight } from "@/lib/types";

export type PortfolioHealthTone = "good" | "watch" | "risk" | "neutral";

export type PortfolioHealthFactor = {
  id:
    | "position_concentration"
    | "sector_balance"
    | "quote_freshness"
    | "analysis_freshness"
    | "news_pressure"
    | "earnings_visibility";
  label: string;
  value: string;
  detail: string;
  tone: PortfolioHealthTone;
};

export type PortfolioHealthItem = {
  title: string;
  detail: string;
  tone: PortfolioHealthTone;
  href: string;
};

export type PortfolioHealthResult = {
  score: number;
  label: string;
  summary: string;
  factors: PortfolioHealthFactor[];
  risks: PortfolioHealthItem[];
  opportunities: PortfolioHealthItem[];
};

const HIGH_ATTENTION_CATEGORIES = new Set([
  "earnings",
  "geopolitics",
  "macro",
  "regulation",
]);

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatPercentValue(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

export function getHoldingMarketValue(holding: Holding): number {
  if (Number.isFinite(holding.currentValue) && holding.currentValue > 0) {
    return holding.currentValue;
  }

  const price = holding.currentPrice || holding.price || 0;
  if (Number.isFinite(price) && price > 0 && holding.quantity > 0) {
    return price * holding.quantity;
  }

  if (Number.isFinite(holding.costBasis) && holding.costBasis > 0) {
    return holding.costBasis;
  }

  if (Number.isFinite(holding.allocation) && holding.allocation > 0) {
    return holding.allocation;
  }

  return 0;
}

function quoteIsStale(holding: Holding, now: Date) {
  if (!holding.quoteAsOf) return true;
  const quoteTime = new Date(holding.quoteAsOf).getTime();
  if (!Number.isFinite(quoteTime)) return true;
  return now.getTime() - quoteTime > 24 * 60 * 60 * 1000;
}

function ageHours(iso: string | null | undefined, now: Date) {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (now.getTime() - time) / (60 * 60 * 1000));
}

function storyNeedsAttention(story: PortfolioFeedHighlight) {
  const combined = `${story.headline} ${story.whyItMatters} ${story.aiSummary}`.toLowerCase();
  return (
    HIGH_ATTENTION_CATEGORIES.has(story.category) ||
    combined.includes("risk") ||
    combined.includes("pressure") ||
    combined.includes("lawsuit") ||
    combined.includes("downgrade") ||
    combined.includes("regulation")
  );
}

function healthLabel(score: number, holdingsCount: number) {
  if (holdingsCount === 0) return "Needs setup";
  if (score >= 85) return "Strong";
  if (score >= 70) return "Balanced";
  if (score >= 55) return "Watch";
  return "Needs attention";
}

function healthSummary(score: number, holdingsCount: number) {
  if (holdingsCount === 0) {
    return "Add holdings to unlock portfolio health, news matching, and daily alerts.";
  }
  if (score >= 85) {
    return "Your tracked portfolio looks balanced against the latest available signals.";
  }
  if (score >= 70) {
    return "A few items deserve review, but the portfolio is not flashing urgent warnings.";
  }
  if (score >= 55) {
    return "There are concentration, freshness, or news-pressure items worth checking today.";
  }
  return "Multiple dashboard signals need review before relying on today's brief.";
}

function factorTone(value: number, watchThreshold: number, riskThreshold: number) {
  if (value >= riskThreshold) return "risk";
  if (value >= watchThreshold) return "watch";
  return "good";
}

function makeRiskFromFactor(factor: PortfolioHealthFactor): PortfolioHealthItem | null {
  if (factor.tone !== "risk" && factor.tone !== "watch") return null;

  const href =
    factor.id === "analysis_freshness" || factor.id === "news_pressure"
      ? "/analysis"
      : factor.id === "earnings_visibility"
        ? "/portfolio/full"
        : "/portfolio/full";

  return {
    title: factor.label,
    detail: factor.detail,
    tone: factor.tone,
    href,
  };
}

export function calculatePortfolioHealth(input: {
  holdings: Holding[];
  feedHighlights?: PortfolioFeedHighlight[];
  latestAnalysisAt?: string | null;
  now?: Date;
}): PortfolioHealthResult {
  const now = input.now ?? new Date();
  const holdings = input.holdings;
  const feedHighlights = input.feedHighlights ?? [];

  if (holdings.length === 0) {
    return {
      score: 0,
      label: healthLabel(0, 0),
      summary: healthSummary(0, 0),
      factors: [
        {
          id: "position_concentration",
          label: "Positions",
          value: "0",
          detail: "No holdings loaded yet.",
          tone: "neutral",
        },
      ],
      risks: [
        {
          title: "Portfolio setup",
          detail: "Add holdings before the dashboard can rank risks and opportunities.",
          tone: "watch",
          href: "/onboarding",
        },
      ],
      opportunities: [
        {
          title: "Create a sample workflow",
          detail: "Start with a portfolio import, then run analysis to generate your first brief.",
          tone: "good",
          href: "/onboarding",
        },
      ],
    };
  }

  const valuedHoldings = holdings
    .map((holding) => ({
      holding,
      value: getHoldingMarketValue(holding),
    }))
    .sort((left, right) => right.value - left.value);
  const totalValue = valuedHoldings.reduce((sum, item) => sum + item.value, 0);
  const topHolding = valuedHoldings[0] ?? null;
  const topHoldingPercent =
    totalValue > 0 && topHolding ? (topHolding.value / totalValue) * 100 : 0;

  const sectors = new Map<string, number>();
  for (const item of valuedHoldings) {
    const sector = item.holding.sector || "Unclassified";
    sectors.set(sector, (sectors.get(sector) ?? 0) + item.value);
  }
  const topSector = [...sectors.entries()].sort((left, right) => right[1] - left[1])[0];
  const topSectorName = topSector?.[0] ?? "Unclassified";
  const topSectorPercent =
    totalValue > 0 && topSector ? (topSector[1] / totalValue) * 100 : 0;

  const staleQuotes = holdings.filter((holding) => quoteIsStale(holding, now));
  const staleQuotePercent = (staleQuotes.length / holdings.length) * 100;
  const analysisAge = ageHours(input.latestAnalysisAt, now);
  const attentionStories = feedHighlights.filter(storyNeedsAttention);
  const earningsLinked = holdings.filter((holding) => holding.latestEarningsReportUrl);
  const earningsCoveragePercent = (earningsLinked.length / holdings.length) * 100;

  let score = 100;
  if (topHoldingPercent > 50) score -= 20;
  else if (topHoldingPercent > 35) score -= 12;
  else if (topHoldingPercent > 25) score -= 6;

  if (topSectorPercent > 60) score -= 18;
  else if (topSectorPercent > 45) score -= 10;
  else if (topSectorPercent > 35) score -= 4;

  if (staleQuotePercent > 50) score -= 14;
  else if (staleQuotes.length > 0) score -= 6;

  if (analysisAge === null) score -= 12;
  else if (analysisAge > 72) score -= 10;
  else if (analysisAge > 24) score -= 4;

  score -= Math.min(12, attentionStories.length * 4);

  if (holdings.length >= 3 && earningsCoveragePercent < 25) {
    score -= 5;
  }

  const factors: PortfolioHealthFactor[] = [
    {
      id: "position_concentration",
      label: "Top position",
      value: topHolding ? `${topHolding.holding.symbol} ${formatPercentValue(topHoldingPercent)}` : "None",
      detail: topHolding
        ? `${topHolding.holding.symbol} is the largest tracked position.`
        : "No dominant position.",
      tone: factorTone(topHoldingPercent, 25, 40),
    },
    {
      id: "sector_balance",
      label: "Top sector",
      value: `${topSectorName} ${formatPercentValue(topSectorPercent)}`,
      detail: `${topSectorName} is the largest sector bucket by current tracked value.`,
      tone: factorTone(topSectorPercent, 40, 55),
    },
    {
      id: "quote_freshness",
      label: "Quote freshness",
      value: staleQuotes.length === 0 ? "Fresh" : `${staleQuotes.length} stale`,
      detail:
        staleQuotes.length === 0
          ? "All tracked holdings have quotes from the last 24 hours."
          : `${staleQuotes.length} holding${staleQuotes.length === 1 ? "" : "s"} need a price refresh.`,
      tone:
        staleQuotePercent > 50 ? "risk" : staleQuotes.length > 0 ? "watch" : "good",
    },
    {
      id: "analysis_freshness",
      label: "AI analysis",
      value:
        analysisAge === null
          ? "Not run"
          : analysisAge < 1
            ? "Just now"
            : `${Math.round(analysisAge)}h old`,
      detail:
        analysisAge === null
          ? "Run analysis to generate current matches and insights."
          : analysisAge > 24
            ? "Analysis is older than one trading day."
            : "Analysis is current enough for today's dashboard.",
      tone:
        analysisAge === null || analysisAge > 72
          ? "risk"
          : analysisAge > 24
            ? "watch"
            : "good",
    },
    {
      id: "news_pressure",
      label: "News pressure",
      value:
        attentionStories.length === 0
          ? "Low"
          : `${attentionStories.length} item${attentionStories.length === 1 ? "" : "s"}`,
      detail:
        attentionStories.length === 0
          ? "No high-attention categories are leading the matched stories."
          : "Macro, earnings, regulation, or risk-language stories are leading the queue.",
      tone:
        attentionStories.length >= 3
          ? "risk"
          : attentionStories.length > 0
            ? "watch"
            : "good",
    },
    {
      id: "earnings_visibility",
      label: "Earnings links",
      value: `${earningsLinked.length}/${holdings.length}`,
      detail:
        earningsLinked.length > 0
          ? "Latest report links are available for part of the portfolio."
          : "No latest earnings report links are attached yet.",
      tone:
        holdings.length >= 3 && earningsCoveragePercent < 25
          ? "watch"
          : earningsLinked.length > 0
            ? "good"
            : "neutral",
    },
  ];

  const risks = factors
    .map(makeRiskFromFactor)
    .filter((item): item is PortfolioHealthItem => item !== null)
    .slice(0, 4);

  const storyOpportunities = feedHighlights
    .filter((story) => !storyNeedsAttention(story))
    .slice(0, 3)
    .map((story) => ({
      title: story.holdings[0] ? `${story.holdings[0]} catalyst` : story.category,
      detail: story.whyItMatters || story.aiSummary || story.headline,
      tone: "good" as const,
      href: "/feed",
    }));

  const opportunities =
    storyOpportunities.length > 0
      ? storyOpportunities
      : [
          {
            title: "Run the daily brief",
            detail: "Refresh analysis to surface fresh portfolio-specific opportunities.",
            tone: "good" as const,
            href: "/analysis",
          },
        ];

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    label: healthLabel(finalScore, holdings.length),
    summary: healthSummary(finalScore, holdings.length),
    factors,
    risks,
    opportunities,
  };
}
