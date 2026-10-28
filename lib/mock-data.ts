import type {
  FAQItem,
  Holding,
  NewsItem,
  PainPoint,
  PortfolioInsight,
  ProductFeature,
  SiteStat,
  SourceTag,
  Testimonial,
  UseCase,
  WorkflowStep,
} from "@/lib/types";

export const siteStats: SiteStat[] = [
  {
    label: "Portfolio paths",
    value: "3",
    hint: "Import a broker CSV, build manually, or explore the public demo.",
  },
  {
    label: "AI recap layers",
    value: "4",
    hint: "Relevance, sentiment, impact, and a plain English explanation.",
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
    eyebrow: "Track",
    title: "All your positions in one calm view",
    description:
      "Start from a broker CSV export or manual entry. Every holding lands in the same snapshot with its latest price and weight. Live broker linking is not available yet.",
    bullets: [
      "CSV import with column mapping and review",
      "Manual portfolio creation",
      "One snapshot for every holding",
    ],
  },
  {
    eyebrow: "Ask",
    title: "Answers that start from what you own",
    description:
      "Ask why your account moved or which sector is under pressure. Answers point to the holdings and stories behind them.",
    bullets: [
      "Step by step analysis progress",
      "Ticker and sector relevance mapping",
      "Explanations grounded in your holdings",
    ],
  },
  {
    eyebrow: "Read",
    title: "A morning brief ranked by relevance",
    description:
      "Each story is scored against your holdings, then summarized so you know why it is there before you read it.",
    bullets: [
      "Daily brief and ranked news stream",
      "Filters by holding, sector, and recency",
      "Article panel with an AI summary",
    ],
  },
];

export const workflowSteps: WorkflowStep[] = [
  {
    step: "01",
    title: "Add your portfolio",
    description:
      "Import a CSV export from your broker or build a manual portfolio in a minute.",
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

export const holdings: Holding[] = [
  {
    id: "nvda-live",
    symbol: "NVDA",
    company: "NVIDIA",
    sector: "AI Infrastructure",
    market: "NASDAQ",
    source: "CSV import",
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
    importSource: "csv",
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
    source: "CSV import",
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
    importSource: "csv",
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
    source: "CSV import",
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
    importSource: "csv",
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
    source: "CSV import",
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
    importSource: "csv",
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

function allocationOf(symbol: string): number {
  return holdings.find((holding) => holding.symbol === symbol)?.allocation ?? 0;
}

// Audit F23: demo claims are derived from the same sample allocations they sit next to.
export const portfolioInsights: PortfolioInsight[] = [
  {
    title: "Most exposed theme",
    value: "AI infrastructure",
    detail: `NVIDIA and Microsoft make up ${allocationOf("NVDA") + allocationOf("MSFT")}% of portfolio weight.`,
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
    role: "Self directed investor",
  },
  {
    quote:
      "I want the news feed to explain itself: a short AI summary of why a story matters to what I hold, every day.",
    role: "Long term portfolio builder",
  },
];

export const faqs: FAQItem[] = [
  {
    question: "Does Pulsefolio link to my brokerage account?",
    answer:
      "Not yet. You import a CSV export from your broker or add positions by hand, and Pulsefolio works only from what you give it.",
  },
  {
    question: "Can Pulsefolio trade or move money?",
    answer:
      "No. It is read only. It never places orders, moves money, or asks for your brokerage login.",
  },
  {
    question: "What does the free plan include?",
    answer:
      "Portfolio tracking, the personalized feed, alerts, the morning digest, and 100 AI requests per day on the free model. Requests reset at midnight Eastern.",
  },
  {
    question: "What do the paid plans add?",
    answer:
      "Premium adds a stronger AI model and 5,000 requests a month. Ultimate adds our most capable reasoning model and 20,000 requests a month. Current prices are on the pricing page.",
  },
  {
    question: "Which files can I import?",
    answer:
      "Most broker CSV exports work. You match the columns once, review every row, then save the portfolio.",
  },
  {
    question: "How is the feed different from a normal market news app?",
    answer:
      "Each story is ranked by how much it touches your holdings and comes with a short explanation of which positions or sectors it affects, so you do not have to work that out yourself.",
  },
  {
    question: "Where does the news come from?",
    answer:
      "Market, wire, filings and macro sources, including Yahoo Finance, Reuters, the New York Times, SEC filings and the Federal Reserve.",
  },
  {
    question: "Is this investment advice?",
    answer:
      "No. Pulsefolio explains news in the context of your holdings. It does not tell you what to buy or sell.",
  },
];

/* ── Use cases (landing page marketing section) ── */

export const useCases: UseCase[] = [
  {
    id: "morning-brief",
    moment: "Every morning",
    headline: "Open the day with a brief shaped by what you own",
    summary:
      "See the stories that touch your portfolio, the top risks, and how your holdings moved overnight, before you open another tab.",
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
    moment: "Midday check",
    headline: "Ask AI why the portfolio is moving today",
    summary:
      "Type a question and get an answer grounded in your portfolio that highlights which holdings are driving the move and why.",
    proofPoints: [
      "Ask in plain words",
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
      "Story chat in one tap",
      "Follow up questions in context",
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
          text: `Microsoft benefits directly through Azure demand. With ${allocationOf("MSFT")}% of your portfolio in MSFT, this spending signal supports your second-largest holding.`,
        },
      ],
    },
  },
];
