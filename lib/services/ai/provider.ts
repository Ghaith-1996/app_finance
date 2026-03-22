import type {
  ArticleChatMessage,
  MatchReasonCode,
  NewsItem,
  NewsCategory,
  PortfolioInsight,
  StockEffect,
  TickerImpact,
} from "@/lib/types";

export type Sentiment = "positive" | "watch" | "negative" | "neutral";
export type ImpactLevel = "High" | "Medium" | "Low";

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
    rawContent?: string;
    stockTags: string[];
    tickerImpacts: TickerImpact[];
    sourceType?: string;
    whyItMatters?: string;
    matchedHoldings?: string[];
    relevanceScore?: number | null;
  };
  holdings: HoldingContext[];
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
  history: Array<Pick<ArticleChatMessage, "role" | "content">>;
  question: string;
}

export interface IAIProvider {
  generateSummary(article: string, holdings: HoldingContext[]): Promise<string>;
  scoreSentiment(article: string): Promise<Sentiment>;
  scoreRelevance(article: string, holdings: HoldingContext[]): Promise<number>;
  assessPortfolioMatch(
    article: string,
    holdings: HoldingContext[],
  ): Promise<PortfolioMatchAssessment>;
  generateInsights(holdings: HoldingContext[], newsContexts: NewsContext[]): Promise<PortfolioInsight[]>;
  explainWhyItMatters(article: string, holdings: HoldingContext[]): Promise<string>;
  analyzeArticle(headline: string, content: string, hintTickers?: string[]): Promise<ArticleAnalysis>;
  answerArticleQuestion(context: ArticleChatContext): Promise<string>;
  answerPortfolioQuestion(context: PortfolioCopilotContext): Promise<string>;
}
