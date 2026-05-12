export type Sentiment = "positive" | "watch" | "negative" | "neutral";
export type ImpactLevel = "High" | "Medium" | "Low";
export type StockEffect = "bullish" | "bearish" | "neutral";
export type LatestEarningsReportSource = "company" | "sec";

export interface LatestEarningsReportFields {
  latestEarningsReportUrl: string | null;
  latestEarningsReportSource: LatestEarningsReportSource | null;
  latestEarningsReportDate: string | null;
}

export const NEWS_CATEGORIES = [
  "technology", "minerals", "energy", "healthcare", "financials",
  "consumer", "industrials", "macro", "regulation", "earnings",
  "deals", "geopolitics", "other",
] as const;
export type NewsCategory = (typeof NEWS_CATEGORIES)[number];

export interface TickerImpact {
  symbol: string;
  effect: StockEffect;
}
export type MatchReasonCode =
  | "held_ticker_tag"
  | "held_ticker_impact"
  | "held_company_mention"
  | "sector_exposure_explicit"
  | "watchlist_ticker_tag"
  | "watchlist_ticker_impact";

export type MatchSource = "portfolio" | "watchlist";
export type ProviderStatus = "Roadmap" | "Preview" | "Demo";
export type AnalysisStage =
  | "queued"
  | "processing_holdings"
  | "mapping_news"
  | "generating_insights"
  | "complete"
  | "degraded";

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

export interface Holding extends LatestEarningsReportFields {
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
  quantity: number;
  averageCost: number;
  costBasis: number;
  currentPrice: number;
  currentValue: number;
  unrealizedGainAmount: number;
  unrealizedGainPercent: number;
  quoteCurrency: string;
  quoteAsOf: string | null;
  importSource: string;
}

export interface HoldingDraft {
  tempId: string;
  symbol: string;
  company: string;
  quantity: number;
  averageCost: number;
  sector: string;
  market: string;
  exchange: string;
  currency: string;
  thesis: string;
  importSource: "csv" | "manual";
  status: "confirmed" | "unresolved" | "skipped";
  issues: HoldingIssue[];
  candidates: HoldingResolutionCandidate[];
}

export interface HoldingIssue {
  field: string;
  message: string;
}

export interface HoldingResolutionCandidate {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export type SaveMode = "replace" | "merge";

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

export type PortfolioPricingRefreshStatus = "updated" | "no_quotes" | "error";

export interface PortfolioPricingRefreshResult {
  status: PortfolioPricingRefreshStatus;
  updated: number;
  message: string | null;
  overview: PortfolioOverview | null;
  holdings?: Holding[] | null;
}

export interface PortfolioValueSnapshot {
  id: string;
  capturedAt: string;
  bucketStart: string;
  totalValue: number;
  costBasis: number;
  dayChangePercent: number;
  quoteCurrency: string;
  positionsCount: number;
}

export interface PortfolioInsight {
  title: string;
  value: string;
  detail: string;
}

export interface PortfolioFeedHighlight {
  headline: string;
  source: string;
  publishedAt: string;
  category: NewsCategory;
  relevanceScore: number;
  whyItMatters: string;
  holdings: string[];
  sectors: string[];
  aiSummary: string;
  matchReasonCodes?: MatchReasonCode[];
}

export type NewsSourceType =
  | "edgar"
  | "yfinance"
  | "marketaux"
  | "finnhub"
  | "newsapi"
  | "gnews"
  | "newsapi_ai"
  | "newscatcher"
  | "seed"
  | "other";
export type SourceConfidence = "high" | "standard";
export type FeedMode = "personal" | "market";
export type FeedSort = "match" | "recent" | "hot" | "oldest";

export interface NewsItem {
  id: string;
  newsItemId: string;
  headline: string;
  source: string;
  url?: string;
  publishedAt: string;
  publishedMinutesAgo: number;
  category: NewsCategory;
  stockTags: string[];
  globalSummary: string;
  displayEffect: StockEffect;
  tickerImpacts: TickerImpact[];
  sourceType: NewsSourceType;
  sourceConfidence: SourceConfidence;
  metadata: Record<string, unknown>;
  angle: string;

  /* Personal mode fields — populated by feed_items join */
  relevanceScore?: number;
  sentiment?: Sentiment;
  impact?: ImpactLevel;
  holdings?: string[];
  sectors?: string[];
  aiSummary?: string;
  whyItMatters?: string;
  matchedStockTags?: string[];
  matchReasonCodes?: MatchReasonCode[];
  matchSources?: MatchSource[];

  /* Market mode fields */
  isPortfolioMatch?: boolean;
  isWatchlistMatch?: boolean;
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

export type ArticleChatRole = "user" | "assistant";
export const ARTICLE_CHAT_MODEL_TIERS = ["free", "premium", "ultimate"] as const;
export type ArticleChatModelTier = (typeof ARTICLE_CHAT_MODEL_TIERS)[number];

export interface ArticleChatMessage {
  id: string;
  role: ArticleChatRole;
  content: string;
  createdAt: string;
}

/* ── Use-case marketing section ── */

export interface UseCasePreviewHolding {
  symbol: string;
  company: string;
  change: number;
  highlight?: boolean;
}

export interface UseCasePreviewStory {
  headline: string;
  source: string;
  relevance: number;
}

export interface UseCasePreview {
  /** Mock portfolio value shown in the preview */
  portfolioValue?: string;
  /** Mock portfolio day change shown in the preview */
  portfolioChange?: string;
  holdings: UseCasePreviewHolding[];
  stories: UseCasePreviewStory[];
  /** AI prompt chip text (for ask-AI use cases) */
  prompt?: string;
  /** AI answer text (for ask-AI use cases) */
  answer?: string;
  /** Chat bubbles for the story-chat use case */
  chatBubbles?: { role: "user" | "assistant"; text: string }[];
}

export interface UseCase {
  id: string;
  moment: string;
  headline: string;
  summary: string;
  proofPoints: string[];
  ctaLabel: string;
  ctaHref: string;
  preview: UseCasePreview;
}
