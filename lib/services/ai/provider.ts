import type { Holding, PortfolioInsight } from "@/lib/types";

export type Sentiment = "positive" | "watch" | "negative" | "neutral";
export type ImpactLevel = "High" | "Medium" | "Low";

export interface NewsContext {
  headline: string;
  source: string;
  rawContent?: string;
  publishedAt: string;
  angle?: string;
}

export interface IAIProvider {
  generateSummary(article: string, holdings: Holding[]): Promise<string>;
  scoreSentiment(article: string): Promise<Sentiment>;
  scoreRelevance(article: string, holdings: Holding[]): Promise<number>;
  generateInsights(holdings: Holding[], newsContexts: NewsContext[]): Promise<PortfolioInsight[]>;
  explainWhyItMatters(article: string, holdings: Holding[]): Promise<string>;
}
