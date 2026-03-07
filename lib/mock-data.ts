import type {
  AnalysisStep,
  FAQItem,
  Holding,
  NewsItem,
  PainPoint,
  PortfolioInsight,
  PortfolioOverview,
  ProductFeature,
  Provider,
  SiteStat,
  SourceTag,
  Testimonial,
  WorkflowStep,
} from "@/lib/types";

export const siteStats: SiteStat[] = [
  {
    label: "Portfolio paths",
    value: "3+",
    hint: "Link a broker, build manually, or open a guided demo portfolio.",
  },
  {
    label: "AI recap layers",
    value: "4",
    hint: "Relevance, sentiment, impact, and a plain-English explanation.",
  },
  {
    label: "Global sources",
    value: "5",
    hint: "Market, macro, filings, and general news brought into one feed.",
  },
];

export const sourceTags: SourceTag[] = [
  { name: "Yahoo Finance", category: "Markets" },
  { name: "New York Times", category: "Global" },
  { name: "Reuters", category: "Wire" },
  { name: "SEC Filings", category: "Filings" },
  { name: "Federal Reserve", category: "Macro" },
];

export const painPoints: PainPoint[] = [
  {
    title: "Your financial context lives in too many places",
    description:
      "Brokerage balances, news, and watchlists usually sit in separate tools, which makes daily portfolio reviews feel heavier than they should.",
  },
  {
    title: "Most market news does not explain why it matters to you",
    description:
      "Investors still have to translate headlines into portfolio impact on their own, even when the signal should be obvious from their holdings.",
  },
  {
    title: "Daily reviews take more clicks than insight",
    description:
      "Opening several tabs to understand one move creates friction right when users need a fast, confident read on the market.",
  },
];

export const productFeatures: ProductFeature[] = [
  {
    eyebrow: "Track everything",
    title: "Bring linked and manual portfolios into one intelligent home",
    description:
      "Users can start with a broker connection or manual entry and still land in the same clean portfolio experience.",
    bullets: [
      "Broker connection path with guided states",
      "Manual fallback portfolio creation",
      "Unified holdings snapshot",
    ],
  },
  {
    eyebrow: "Ask anything",
    title: "Let AI explain the stories behind the moves",
    description:
      "Instead of showing generic headlines, the product turns portfolio exposure into readable context and quick answers.",
    bullets: [
      "Multi-step AI analysis progress",
      "Ticker and sector relevance mapping",
      "Readable explanations grounded in holdings",
    ],
  },
  {
    eyebrow: "Stay ahead",
    title: "Open a personalized feed built around what users own",
    description:
      "Each feed item surfaces the market stories most likely to matter, then explains why they matter before a user has to ask.",
    bullets: [
      "Daily brief and ranked news stream",
      "Filters by holding, sector, and recency",
      "Article detail panel with AI summary",
    ],
  },
];

export const workflowSteps: WorkflowStep[] = [
  {
    step: "01",
    title: "Connect your portfolio",
    description:
      "Start with Wealthsimple, Interactive Brokers, or a manual portfolio that takes only a minute to build.",
  },
  {
    step: "02",
    title: "Run the AI analysis",
    description:
      "Map holdings to sectors, catalysts, and related stories so the product understands the portfolio before it shows the feed.",
  },
  {
    step: "03",
    title: "Read the daily brief",
    description:
      "Open a feed that already knows what deserves attention and why it belongs in front of the user.",
  },
];

export const providers: Provider[] = [
  {
    id: "wealthsimple",
    name: "Wealthsimple",
    summary:
      "A guided import flow for self-directed investors who want a quick read-only sync path.",
    status: "Preview",
    accent: "from-cyan-400/30 via-cyan-300/10 to-transparent",
    capabilities: ["Read-only sync", "Holdings import", "Last sync status"],
    ctaLabel: "Preview flow",
  },
  {
    id: "interactive-brokers",
    name: "Interactive Brokers",
    summary:
      "Built for investors with larger multi-market portfolios who want deeper news coverage by position.",
    status: "Roadmap",
    accent: "from-violet-400/30 via-violet-300/10 to-transparent",
    capabilities: ["Global holdings", "Multi-currency ready", "Advanced refresh states"],
    ctaLabel: "Join waitlist",
  },
  {
    id: "demo",
    name: "Demo portfolio",
    summary:
      "Launch directly into the experience with a realistic growth portfolio and prebuilt news signals.",
    status: "Demo",
    accent: "from-amber-300/30 via-amber-200/10 to-transparent",
    capabilities: ["Instant demo", "Sample feed", "Editable holdings"],
    ctaLabel: "Open demo",
  },
];

export const manualPortfolioSeed: Holding[] = [
  {
    id: "nvda",
    symbol: "NVDA",
    company: "NVIDIA",
    sector: "AI Infrastructure",
    market: "NASDAQ",
    source: "Manual",
    price: 938.22,
    dailyChange: 1.8,
    allocation: 32,
    thesis: "Core AI infrastructure position with data center exposure.",
  },
  {
    id: "msft",
    symbol: "MSFT",
    company: "Microsoft",
    sector: "Cloud",
    market: "NASDAQ",
    source: "Manual",
    price: 418.14,
    dailyChange: 0.7,
    allocation: 24,
    thesis: "Cloud and enterprise software anchor with AI monetization upside.",
  },
  {
    id: "lly",
    symbol: "LLY",
    company: "Eli Lilly",
    sector: "Healthcare",
    market: "NYSE",
    source: "Manual",
    price: 781.64,
    dailyChange: -0.5,
    allocation: 18,
    thesis: "Defensive healthcare growth with obesity drug momentum.",
  },
  {
    id: "visa",
    symbol: "V",
    company: "Visa",
    sector: "Payments",
    market: "NYSE",
    source: "Manual",
    price: 293.54,
    dailyChange: 0.3,
    allocation: 14,
    thesis: "Global consumer and payments proxy with durable margins.",
  },
  {
    id: "xom",
    symbol: "XOM",
    company: "Exxon Mobil",
    sector: "Energy",
    market: "NYSE",
    source: "Manual",
    price: 118.43,
    dailyChange: -1.2,
    allocation: 12,
    thesis: "Inflation hedge and commodity exposure for macro balance.",
  },
];

export const analysisSteps: AnalysisStep[] = [
  {
    id: "queued",
    title: "Portfolio received",
    detail: "Holdings were normalized and matched to sectors, markets, and ticker metadata.",
    status: "complete",
  },
  {
    id: "processing_holdings",
    title: "Processing holdings",
    detail: "Calculating concentration, sector overlap, and macro sensitivity across the portfolio.",
    status: "complete",
  },
  {
    id: "mapping_news",
    title: "Mapping the news graph",
    detail: "Scanning global finance and general news for stories connected to tracked holdings.",
    status: "complete",
  },
  {
    id: "generating_insights",
    title: "Generating insights",
    detail: "Writing plain-English explanations for why each signal matters to this portfolio.",
    status: "current",
  },
  {
    id: "complete",
    title: "Preparing the feed",
    detail: "Packaging relevance scores, impact labels, and recommended watch areas.",
    status: "upcoming",
  },
];

export const portfolioOverview: PortfolioOverview = {
  totalValue: 246380,
  dayChange: 1.14,
  monthlyChange: 6.82,
  lastSyncedAt: "6 minutes ago",
  lastAnalyzedAt: "2 minutes ago",
  coverage: "8 high-signal stories across 5 holdings",
  primaryGoal: "Compound around AI, quality healthcare, and resilient cash-flow names.",
};

export const portfolioInsights: PortfolioInsight[] = [
  {
    title: "Most exposed theme",
    value: "AI infrastructure",
    detail: "NVIDIA and Microsoft now drive 56% of portfolio weight.",
  },
  {
    title: "Macro watch",
    value: "Rates + energy",
    detail: "Energy and payments names are the fastest movers after inflation surprises.",
  },
  {
    title: "Fresh catalyst",
    value: "Healthcare policy",
    detail: "Drug pricing and obesity treatment demand are rising as a feed priority.",
  },
];

export const holdings: Holding[] = [
  {
    id: "nvda-live",
    symbol: "NVDA",
    company: "NVIDIA",
    sector: "AI Infrastructure",
    market: "NASDAQ",
    source: "Wealthsimple",
    price: 938.22,
    dailyChange: 1.8,
    allocation: 28,
    thesis: "High-conviction semiconductor leader with hyperscaler demand exposure.",
  },
  {
    id: "msft-live",
    symbol: "MSFT",
    company: "Microsoft",
    sector: "Cloud",
    market: "NASDAQ",
    source: "Wealthsimple",
    price: 418.14,
    dailyChange: 0.7,
    allocation: 21,
    thesis: "Platform-scale software compounder with enterprise AI distribution.",
  },
  {
    id: "lly-live",
    symbol: "LLY",
    company: "Eli Lilly",
    sector: "Healthcare",
    market: "NYSE",
    source: "Interactive Brokers",
    price: 781.64,
    dailyChange: -0.5,
    allocation: 16,
    thesis: "Healthcare growth offset with durable pricing power.",
  },
  {
    id: "v-live",
    symbol: "V",
    company: "Visa",
    sector: "Payments",
    market: "NYSE",
    source: "Wealthsimple",
    price: 293.54,
    dailyChange: 0.3,
    allocation: 18,
    thesis: "Quality payments franchise with strong global spending sensitivity.",
  },
  {
    id: "xom-live",
    symbol: "XOM",
    company: "Exxon Mobil",
    sector: "Energy",
    market: "NYSE",
    source: "Manual",
    price: 118.43,
    dailyChange: -1.2,
    allocation: 17,
    thesis: "Commodity hedge that offsets tech concentration and inflation shocks.",
  },
];

export const newsFeed: NewsItem[] = [
  {
    id: "story-1",
    headline: "U.S. cloud spending accelerates as enterprise AI budgets expand into 2026",
    source: "Reuters",
    publishedAt: "22 minutes ago",
    publishedMinutesAgo: 22,
    relevanceScore: 96,
    sentiment: "positive",
    impact: "High",
    holdings: ["MSFT", "NVDA"],
    sectors: ["Cloud", "AI Infrastructure"],
    aiSummary:
      "The story reinforces demand strength for AI infrastructure and enterprise cloud vendors, which supports the two largest positions in the portfolio.",
    whyItMatters:
      "Microsoft benefits directly through Azure demand, while NVIDIA stands to gain as that same cloud buildout requires more GPU capacity.",
    angle: "Demand signal",
  },
  {
    id: "story-2",
    headline: "Oil holds gains after supply curbs, keeping inflation pressure in focus",
    source: "Yahoo Finance",
    publishedAt: "41 minutes ago",
    publishedMinutesAgo: 41,
    relevanceScore: 88,
    sentiment: "watch",
    impact: "Medium",
    holdings: ["XOM", "V"],
    sectors: ["Energy", "Payments"],
    aiSummary:
      "Higher energy prices can lift near-term earnings for Exxon Mobil while also raising inflation risk for consumer-sensitive names like Visa.",
    whyItMatters:
      "This is a mixed signal for the portfolio because it helps the energy hedge but can pressure rate expectations and consumer spending quality.",
    angle: "Macro cross-current",
  },
  {
    id: "story-3",
    headline: "New obesity treatment data sharpens focus on pharma winners",
    source: "New York Times",
    publishedAt: "1 hour ago",
    publishedMinutesAgo: 60,
    relevanceScore: 84,
    sentiment: "positive",
    impact: "Medium",
    holdings: ["LLY"],
    sectors: ["Healthcare"],
    aiSummary:
      "The coverage supports long-duration demand for obesity treatment leaders, which improves the setup for Eli Lilly's growth narrative.",
    whyItMatters:
      "Healthcare is a diversification sleeve in the portfolio, so positive data here adds a non-tech catalyst to the feed.",
    angle: "Company catalyst",
  },
  {
    id: "story-4",
    headline: "Treasury yields rise as investors reprice the timing of rate cuts",
    source: "Federal Reserve Watch",
    publishedAt: "2 hours ago",
    publishedMinutesAgo: 120,
    relevanceScore: 77,
    sentiment: "negative",
    impact: "High",
    holdings: ["MSFT", "NVDA", "V"],
    sectors: ["Cloud", "AI Infrastructure", "Payments"],
    aiSummary:
      "Long-duration growth names typically feel pressure when yields rise, especially when portfolio concentration sits in AI and software.",
    whyItMatters:
      "This changes the risk tone for the largest positions and explains why a portfolio-heavy tech allocation may see sharper intraday volatility.",
    angle: "Risk regime",
  },
  {
    id: "story-5",
    headline: "Chip supply chain bottlenecks ease as data center projects expand",
    source: "Bloomberg Markets",
    publishedAt: "3 hours ago",
    publishedMinutesAgo: 180,
    relevanceScore: 73,
    sentiment: "positive",
    impact: "Medium",
    holdings: ["NVDA"],
    sectors: ["AI Infrastructure"],
    aiSummary:
      "Looser supply constraints support stronger shipment confidence for advanced chip names tied to the AI buildout.",
    whyItMatters:
      "NVIDIA remains the most concentrated single-stock exposure, so even medium-impact supply updates deserve top placement.",
    angle: "Execution tailwind",
  },
];

export const testimonials: Testimonial[] = [
  {
    quote:
      "I do not need more market headlines. I need one place that tells me what changed, what matters, and which holdings are exposed.",
    name: "Maya Chen",
    role: "Self-directed investor",
  },
  {
    quote:
      "The product feels more like an intelligent financial home than a dashboard. The AI summary is what makes the news feed useful every day.",
    name: "Daniel Ortiz",
    role: "Long-term portfolio builder",
  },
];

export const faqs: FAQItem[] = [
  {
    question: "Will live broker connections work in this first version?",
    answer:
      "The current build is frontend-first, so the broker connection flow is modeled as a polished product experience with mocked states. Live authentication and sync come in the backend phase.",
  },
  {
    question: "Can users create a portfolio manually?",
    answer:
      "Yes. The onboarding experience includes a manual portfolio path so the product still proves value before live integrations are connected.",
  },
  {
    question: "How is the feed different from a normal market news app?",
    answer:
      "Each story is ranked by portfolio relevance and includes a plain-English explanation of which holdings or sectors it touches, instead of making the user infer that on their own.",
  },
  {
    question: "What comes after the frontend MVP?",
    answer:
      "The next phase should add authentication, secure broker linking, persistent portfolios, news ingestion, and the AI analysis pipeline behind the mocked product states.",
  },
];
