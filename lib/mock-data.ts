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
  UseCase,
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
    quantity: 50,
    averageCost: 720.0,
    costBasis: 36000,
    currentPrice: 938.22,
    currentValue: 46911,
    unrealizedGainAmount: 10911,
    unrealizedGainPercent: 30.31,
    quoteCurrency: "USD",
    quoteAsOf: null,
    importSource: "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
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
    quantity: 80,
    averageCost: 350.0,
    costBasis: 28000,
    currentPrice: 418.14,
    currentValue: 33451.2,
    unrealizedGainAmount: 5451.2,
    unrealizedGainPercent: 19.47,
    quoteCurrency: "USD",
    quoteAsOf: null,
    importSource: "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
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
    quantity: 30,
    averageCost: 600.0,
    costBasis: 18000,
    currentPrice: 781.64,
    currentValue: 23449.2,
    unrealizedGainAmount: 5449.2,
    unrealizedGainPercent: 30.27,
    quoteCurrency: "USD",
    quoteAsOf: null,
    importSource: "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
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
    quantity: 60,
    averageCost: 250.0,
    costBasis: 15000,
    currentPrice: 293.54,
    currentValue: 17612.4,
    unrealizedGainAmount: 2612.4,
    unrealizedGainPercent: 17.42,
    quoteCurrency: "USD",
    quoteAsOf: null,
    importSource: "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
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
    quantity: 120,
    averageCost: 95.0,
    costBasis: 11400,
    currentPrice: 118.43,
    currentValue: 14211.6,
    unrealizedGainAmount: 2811.6,
    unrealizedGainPercent: 24.66,
    quoteCurrency: "USD",
    quoteAsOf: null,
    importSource: "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
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
    quantity: 50,
    averageCost: 720.0,
    costBasis: 36000,
    currentPrice: 938.22,
    currentValue: 46911,
    unrealizedGainAmount: 10911,
    unrealizedGainPercent: 30.31,
    quoteCurrency: "USD",
    quoteAsOf: null,
    importSource: "wealthsimple",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
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
    quantity: 80,
    averageCost: 350.0,
    costBasis: 28000,
    currentPrice: 418.14,
    currentValue: 33451.2,
    unrealizedGainAmount: 5451.2,
    unrealizedGainPercent: 19.47,
    quoteCurrency: "USD",
    quoteAsOf: null,
    importSource: "wealthsimple",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
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
    quantity: 30,
    averageCost: 600.0,
    costBasis: 18000,
    currentPrice: 781.64,
    currentValue: 23449.2,
    unrealizedGainAmount: 5449.2,
    unrealizedGainPercent: 30.27,
    quoteCurrency: "USD",
    quoteAsOf: null,
    importSource: "interactive_brokers",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
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
    quantity: 60,
    averageCost: 250.0,
    costBasis: 15000,
    currentPrice: 293.54,
    currentValue: 17612.4,
    unrealizedGainAmount: 2612.4,
    unrealizedGainPercent: 17.42,
    quoteCurrency: "USD",
    quoteAsOf: null,
    importSource: "wealthsimple",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
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
    quantity: 120,
    averageCost: 95.0,
    costBasis: 11400,
    currentPrice: 118.43,
    currentValue: 14211.6,
    unrealizedGainAmount: 2811.6,
    unrealizedGainPercent: 24.66,
    quoteCurrency: "USD",
    quoteAsOf: null,
    importSource: "manual",
    latestEarningsReportUrl: null,
    latestEarningsReportSource: null,
    latestEarningsReportDate: null,
  },
];

export const newsFeed: NewsItem[] = [
  {
    id: "story-1",
    newsItemId: "story-1",
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
    category: "technology",
    stockTags: ["MSFT", "NVDA", "AMZN", "GOOGL"],
    matchedStockTags: ["MSFT", "NVDA"],
    globalSummary:
      "Enterprise cloud and AI spending continues to accelerate, boosting hyperscaler capacity expansion into 2026.",
    displayEffect: "bullish",
    tickerImpacts: [
      { symbol: "MSFT", effect: "bullish" },
      { symbol: "NVDA", effect: "bullish" },
      { symbol: "AMZN", effect: "bullish" },
      { symbol: "GOOGL", effect: "bullish" },
    ],
    sourceType: "seed",
    sourceConfidence: "standard",
    metadata: {},
  },
  {
    id: "story-2",
    newsItemId: "story-2",
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
    category: "energy",
    stockTags: ["XOM", "CVX", "V"],
    matchedStockTags: ["XOM", "V"],
    globalSummary:
      "Oil prices hold gains on supply curbs, reinforcing inflation pressure and complicating rate expectations.",
    displayEffect: "neutral",
    tickerImpacts: [
      { symbol: "XOM", effect: "bullish" },
      { symbol: "CVX", effect: "bullish" },
      { symbol: "V", effect: "bearish" },
    ],
    sourceType: "seed",
    sourceConfidence: "standard",
    metadata: {},
  },
  {
    id: "story-3",
    newsItemId: "story-3",
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
    category: "healthcare",
    stockTags: ["LLY", "NVO"],
    matchedStockTags: ["LLY"],
    globalSummary:
      "Latest clinical data on obesity treatments reinforces demand for leading pharma names in the space.",
    displayEffect: "bullish",
    tickerImpacts: [
      { symbol: "LLY", effect: "bullish" },
      { symbol: "NVO", effect: "bearish" },
    ],
    sourceType: "seed",
    sourceConfidence: "standard",
    metadata: {},
  },
  {
    id: "story-4",
    newsItemId: "story-4",
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
    category: "macro",
    stockTags: ["MSFT", "NVDA", "V"],
    matchedStockTags: ["MSFT", "NVDA", "V"],
    globalSummary:
      "Long-duration assets face pressure as Treasury yields move higher and rate-cut expectations shift.",
    displayEffect: "bearish",
    tickerImpacts: [
      { symbol: "MSFT", effect: "bearish" },
      { symbol: "NVDA", effect: "bearish" },
      { symbol: "V", effect: "bearish" },
    ],
    sourceType: "seed",
    sourceConfidence: "standard",
    metadata: {},
  },
  {
    id: "story-5",
    newsItemId: "story-5",
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
    category: "technology",
    stockTags: ["NVDA", "AMD", "INTC"],
    matchedStockTags: ["NVDA"],
    globalSummary:
      "Semiconductor supply constraints ease amid strong data center and AI buildout demand.",
    displayEffect: "bullish",
    tickerImpacts: [
      { symbol: "NVDA", effect: "bullish" },
      { symbol: "AMD", effect: "bullish" },
      { symbol: "INTC", effect: "neutral" },
    ],
    sourceType: "seed",
    sourceConfidence: "standard",
    metadata: {},
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
      "The initial release focuses on manual portfolio import and CSV upload. Guided broker-sync flows are on the roadmap and will be added in a future update.",
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
    question: "What comes next for Pulsefolio?",
    answer:
      "Upcoming releases will add secure broker linking, deeper AI insights, and expanded data-source coverage to keep your portfolio context richer every day.",
  },
];

/* ── Use cases (landing page marketing section) ── */

export const useCases: UseCase[] = [
  {
    id: "morning-brief",
    moment: "Every morning",
    headline: "Open the day with a brief shaped by what you own",
    summary:
      "See portfolio-aware stories, top risks, and how your holdings moved overnight — before you open a single other tab.",
    proofPoints: [
      "Coverage card ranked by relevance",
      "Active portfolio value at a glance",
      "Top 3 stories matched to your holdings",
    ],
    ctaLabel: "Try the feed",
    ctaHref: "/demo#daily-brief",
    preview: {
      portfolioValue: "$246,380",
      portfolioChange: "+1.14%",
      holdings: [
        { symbol: "NVDA", company: "NVIDIA", change: 1.8, highlight: true },
        { symbol: "MSFT", company: "Microsoft", change: 0.7 },
        { symbol: "LLY", company: "Eli Lilly", change: -0.5 },
      ],
      stories: [
        {
          headline: "Cloud spending accelerates as enterprise AI budgets expand",
          source: "Reuters",
          relevance: 96,
        },
        {
          headline: "Oil holds gains, keeping inflation pressure in focus",
          source: "Yahoo Finance",
          relevance: 88,
        },
        {
          headline: "New obesity treatment data sharpens pharma focus",
          source: "New York Times",
          relevance: 84,
        },
      ],
    },
  },
  {
    id: "why-moving",
    moment: "Mid-day check",
    headline: "Ask AI why the portfolio is moving today",
    summary:
      "Type a question and get a portfolio-grounded answer that highlights which holdings are driving the move and why.",
    proofPoints: [
      "Natural-language prompt",
      "Answer grounded in your holdings",
      "Highlighted movers with context",
    ],
    ctaLabel: "Try the analysis",
    ctaHref: "/demo#adviser",
    preview: {
      holdings: [
        { symbol: "NVDA", company: "NVIDIA", change: 2.4, highlight: true },
        { symbol: "MSFT", company: "Microsoft", change: 1.1, highlight: true },
        { symbol: "XOM", company: "Exxon Mobil", change: -1.8 },
      ],
      stories: [],
      prompt: "Why is my portfolio moving more than the market today?",
      answer:
        "Your biggest weights in NVIDIA and Microsoft are reacting to stronger AI infrastructure headlines. At the same time, Exxon is dragging on easing oil prices. The net effect is +1.4% vs the S&P's +0.6%.",
    },
  },
  {
    id: "story-chat",
    moment: "Deep dive",
    headline: "Read a story, see the impact, then ask AI about it",
    summary:
      "Open any article from the feed, see which holdings it touches and why it matters, then continue into a focused AI conversation.",
    proofPoints: [
      "Impact summary per holding",
      "One-tap story chat",
      "Follow-up questions in context",
    ],
    ctaLabel: "Get started",
    ctaHref: "/demo#article-impact",
    preview: {
      holdings: [
        { symbol: "MSFT", company: "Microsoft", change: 0.7, highlight: true },
        { symbol: "NVDA", company: "NVIDIA", change: 1.8, highlight: true },
      ],
      stories: [
        {
          headline: "Cloud spending accelerates as enterprise AI budgets expand",
          source: "Reuters",
          relevance: 96,
        },
      ],
      chatBubbles: [
        {
          role: "user",
          text: "How does this affect my MSFT position specifically?",
        },
        {
          role: "assistant",
          text: "Microsoft benefits directly through Azure demand. With 21% of your portfolio in MSFT, this spending signal supports your second-largest holding.",
        },
      ],
    },
  },
];
