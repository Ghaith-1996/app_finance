export type Sentiment = "positive" | "watch" | "negative" | "neutral";
export type ImpactLevel = "High" | "Medium" | "Low";
export type ProviderStatus = "Roadmap" | "Preview" | "Demo";
export type AnalysisStage =
  | "queued"
  | "processing_holdings"
  | "mapping_news"
  | "generating_insights"
  | "complete";

export interface SiteStat {
  label: string;
  value: string;
  hint: string;
}

export interface SourceTag {
  name: string;
  category: string;
}

export interface PainPoint {
  title: string;
  description: string;
}

export interface ProductFeature {
  title: string;
  description: string;
  eyebrow: string;
  bullets: string[];
}

export interface WorkflowStep {
  step: string;
  title: string;
  description: string;
}

export interface Provider {
  id: string;
  name: string;
  summary: string;
  status: ProviderStatus;
  accent: string;
  capabilities: string[];
  ctaLabel: string;
}

export interface Holding {
  id: string;
  symbol: string;
  company: string;
  sector: string;
  market: string;
  source: string;
  price: number;
  dailyChange: number;
  allocation: number;
  thesis: string;
}

export interface AnalysisStep {
  id: AnalysisStage;
  title: string;
  detail: string;
  status: "complete" | "current" | "upcoming";
}

export interface PortfolioOverview {
  totalValue: number;
  dayChange: number;
  monthlyChange: number;
  lastSyncedAt: string;
  lastAnalyzedAt: string;
  coverage: string;
  primaryGoal: string;
}

export interface PortfolioInsight {
  title: string;
  value: string;
  detail: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  source: string;
  publishedAt: string;
  publishedMinutesAgo: number;
  relevanceScore: number;
  sentiment: Sentiment;
  impact: ImpactLevel;
  holdings: string[];
  sectors: string[];
  aiSummary: string;
  whyItMatters: string;
  angle: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

export interface FAQItem {
  question: string;
  answer: string;
}
