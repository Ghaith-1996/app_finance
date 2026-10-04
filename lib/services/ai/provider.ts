import { NEWS_CATEGORIES } from "@/lib/types";
import type {
  ArticleChatMessage,
  InvestmentThesisMatch,
  MatchReasonCode,
  NewsItem,
  NewsCategory,
  PortfolioInsight,
  StockEffect,
  TickerImpact,
} from "@/lib/types";

export type Sentiment = "positive" | "watch" | "negative" | "neutral";

/** Minimal holding shape consumed by AI methods. */
export interface HoldingContext {
  symbol: string;
  company: string;
  sector: string;
}

export interface NewsContext {
  headline: string;
  source: string;
  rawContent?: string;
  publishedAt: string;
  angle?: string;
}

export interface ArticleAnalysis {
  category: NewsCategory;
  globalSummary: string;
  overallEffect: StockEffect;
  stockTags: string[];
  tickerImpacts: TickerImpact[];
}

export function parseArticleAnalysis(
  raw: string,
  headline: string,
  hintTickers: string[] | undefined,
  options: { dropEmptyStockTags: boolean },
): ArticleAnalysis {
  const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, "").trim());
  const stockTags = Array.isArray(parsed.stockTags)
    ? parsed.stockTags.map((tag: unknown) => String(tag).toUpperCase())
    : (hintTickers ?? []);
  return {
    category: NEWS_CATEGORIES.includes(parsed.category) ? parsed.category : "other",
    globalSummary: parsed.globalSummary || headline,
    overallEffect: ["bullish", "bearish", "neutral"].includes(parsed.overallEffect) ? parsed.overallEffect : "neutral",
    stockTags: options.dropEmptyStockTags && Array.isArray(parsed.stockTags) ? stockTags.filter(Boolean) : stockTags,
    tickerImpacts: Array.isArray(parsed.tickerImpacts)
      ? parsed.tickerImpacts
          .filter((impact: { symbol?: string; effect?: string }) => impact.symbol && impact.effect)
          .map((impact: { symbol: string; effect: string }) => ({
            symbol: impact.symbol.toUpperCase(),
            effect: ["bullish", "bearish", "neutral"].includes(impact.effect) ? impact.effect : "neutral",
          }))
      : [],
  } as ArticleAnalysis;
}

export interface PortfolioMatchAssessment {
  relevanceScore: number;
  whyItMatters: string;
  matchedHoldings: string[];
  matchReasonCodes: MatchReasonCode[];
}

export interface ArticleChatContext {
  article: {
    headline: string;
    source: string;
    publishedAt: string;
    category: NewsCategory;
    globalSummary?: string;
    /** Provider headline/snippet / short body. */
    rawContent?: string;
    /** Primary long text from newspaper4k extraction (preferred). */
    extractedContent?: string;
    /** Legacy full-text backfill; prefer extractedContent in new code. */
    fullContent?: string;
    /** Best available body for the model: extracted → full → raw. */
    primaryBody?: string;
    extractionPending?: boolean;
    extractionStatus?: string | null;
    stockTags: string[];
    tickerImpacts: TickerImpact[];
    sourceType?: string;
    whyItMatters?: string;
    matchedHoldings?: string[];
    relevanceScore?: number | null;
  };
  holdings: HoldingContext[];
  investmentTheses?: Array<{
    symbol: string;
    thesis: string;
    risks: string[];
    invalidationNotes: string;
    horizon: string;
    conviction: string;
  }>;
  thesisMatches?: InvestmentThesisMatch[];
  history: Array<Pick<ArticleChatMessage, "role" | "content">>;
  question: string;
}

export interface PortfolioCopilotContext {
  portfolio: {
    name: string;
    totalValue: number;
    dayChange: number;
    lastAnalyzedAt: string;
    coverage: string;
    primaryGoal: string;
  };
  holdings: Array<
    HoldingContext & {
      quantity?: number;
      averageCost?: number;
      allocation?: number;
      price?: number;
      dayChange?: number;
    }
  >;
  insights: PortfolioInsight[];
  feed: Array<
    Pick<
      NewsItem,
      "headline" | "source" | "publishedAt" | "category" | "whyItMatters" | "relevanceScore"
    > & {
      holdings?: string[];
      sectors?: string[];
    }
  >;
  watchlistSymbols?: string[];
  investmentTheses?: Array<{
    symbol: string;
    thesis: string;
    risks: string[];
    invalidationNotes: string;
    horizon: string;
    conviction: string;
  }>;
  history: Array<Pick<ArticleChatMessage, "role" | "content">>;
  question: string;
}

export interface IAIProvider {
  generateSummary(article: string, holdings: HoldingContext[]): Promise<string>;
  scoreSentiment(article: string): Promise<Sentiment>;
  assessPortfolioMatch(
    article: string,
    holdings: HoldingContext[],
  ): Promise<PortfolioMatchAssessment>;
  generateInsights(holdings: HoldingContext[], newsContexts: NewsContext[]): Promise<PortfolioInsight[]>;
  analyzeArticle(headline: string, content: string, hintTickers?: string[]): Promise<ArticleAnalysis>;
  answerArticleQuestion(context: ArticleChatContext): Promise<string>;
  answerPortfolioQuestion(context: PortfolioCopilotContext): Promise<string>;
}
