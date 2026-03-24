import type { PortfolioInsight } from "@/lib/types";
import type {
  ArticleAnalysis,
  ArticleChatContext,
  HoldingContext,
  IAIProvider,
  PortfolioMatchAssessment,
  PortfolioCopilotContext,
  Sentiment,
} from "./provider";
import { AIChatError } from "./ai-chat-errors";

/**
 * Stub AI provider that returns deterministic defaults without calling any API.
 * Use when AI_PROVIDER is unset or when no API key is configured.
 */
export const stubAIProvider: IAIProvider = {
  async generateSummary(article: string, holdings: HoldingContext[]) {
    const tickers = holdings.map((h) => h.symbol).join(", ");
    return `This story may be relevant to holdings: ${tickers}. ${article.slice(0, 200)}...`;
  },

  async scoreSentiment(): Promise<Sentiment> {
    return "neutral";
  },

  async scoreRelevance() {
    return 0;
  },

  async assessPortfolioMatch(): Promise<PortfolioMatchAssessment> {
    return {
      relevanceScore: 0,
      whyItMatters: "",
      matchedHoldings: [],
      matchReasonCodes: [],
    };
  },

  async generateInsights(holdings: HoldingContext[]): Promise<PortfolioInsight[]> {
    const sectors = [...new Set(holdings.map((h) => h.sector))];
    const topSector = sectors[0] ?? "Diversified";
    const topWeight = holdings[0];
    return [
      {
        title: "Most exposed theme",
        value: topSector,
        detail: holdings.length
          ? `${topWeight?.symbol ?? "—"} and others drive sector concentration.`
          : "Add holdings to see insights.",
      },
      {
        title: "Macro watch",
        value: "Rates + energy",
        detail: "Energy and growth names are sensitive to rate and inflation surprises.",
      },
      {
        title: "Fresh catalyst",
        value: "Earnings and policy",
        detail: "Upcoming catalysts may affect portfolio names; check the feed for updates.",
      },
    ];
  },

  async explainWhyItMatters(article: string, holdings: HoldingContext[]) {
    const symbols = holdings.map((h) => h.symbol).slice(0, 3).join(", ");
    return `This story may affect positions such as ${symbols}. ${article.slice(0, 150)}...`;
  },

  async analyzeArticle(_headline: string, _content: string, hintTickers?: string[]): Promise<ArticleAnalysis> {
    const tags = (hintTickers ?? []).map((t) => t.toUpperCase());
    return {
      category: "other",
      globalSummary: `${_headline}. ${(_content ?? "").slice(0, 200)}`,
      overallEffect: "neutral",
      stockTags: tags,
      tickerImpacts: tags.map((s) => ({ symbol: s, effect: "neutral" as const })),
    };
  },

  async answerArticleQuestion(context: ArticleChatContext) {
    if (process.env.NODE_ENV === "production") {
      throw new AIChatError(
        "provider_unavailable",
        "Article chat requires a configured AI provider.",
      );
    }
    const matched = context.article.matchedHoldings?.join(", ") || "your holdings";
    return `From this article, the main takeaway is that it could matter for ${matched}. ${context.article.globalSummary ?? context.article.headline}`;
  },

  async answerPortfolioQuestion(context: PortfolioCopilotContext) {
    const largestHolding = context.holdings[0]?.symbol ?? "your portfolio";
    const topInsight = context.insights[0]?.value ?? "No insight available";
    const watchlist =
      context.watchlistSymbols?.length ? context.watchlistSymbols.join(", ") : "no watchlist connected yet";
    return `Your biggest current anchor looks like ${largestHolding}. Top insight: ${topInsight}. I can answer portfolio questions now, but I only have ${watchlist} for watchlist context.`;
  },
};
