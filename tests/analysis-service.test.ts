import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAIProvider = vi.fn();

vi.mock("@/lib/services/ai", () => ({
  getAIProvider: () => mockGetAIProvider(),
}));

vi.mock("@/lib/services/news/pool-snapshot", () => ({
  newsWindowCutoffIso: () => "2026-03-21T00:00:00.000Z",
}));

import { runAnalysis } from "@/lib/services/analysis";

type AnalysisRunRow = {
  id: string;
  status?: string;
  progress?: number;
  completed_at?: string;
};

function createSupabaseMock({
  newsRows,
  holdingsRows,
  runInsertError,
  activeRunRows,
}: {
  newsRows: Array<Record<string, unknown>>;
  holdingsRows?: Array<Record<string, unknown>>;
  runInsertError?: { message: string; code?: string } | null;
  activeRunRows?: Array<Record<string, unknown>>;
}) {
  const insertedFeedItems: Array<Record<string, unknown>> = [];
  const insertedInsights: Array<Record<string, unknown>> = [];
  const updatedRuns: AnalysisRunRow[] = [];
  let newsSelectCall = 0;

  return {
    insertedFeedItems,
    insertedInsights,
    updatedRuns,
    from(table: string) {
      if (table === "portfolios") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: "p1", user_id: "u1" }, error: null }),
            }),
          }),
        };
      }

      if (table === "analysis_runs") {
        return {
          insert: () => ({
            select: () => ({
              single: async () => {
                if (runInsertError) {
                  return { data: null, error: runInsertError };
                }
                return { data: { id: "run-1" }, error: null };
              },
            }),
          }),
          select: () => ({
            eq: () => ({
              in: () => ({
                order: async () => ({ data: activeRunRows ?? [], error: null }),
              }),
              order: async () => ({ data: [{ id: "run-1" }], error: null }),
            }),
          }),
          update: (payload: AnalysisRunRow) => ({
            eq: async () => {
              updatedRuns.push(payload);
              return { error: null };
            },
          }),
          delete: () => ({
            in: async () => ({ error: null }),
          }),
        };
      }

      if (table === "holdings") {
        return {
          select: () => ({
            eq: async () => ({
              data: holdingsRows ?? [
                {
                  id: "h1",
                  symbol: "AAPL",
                  company: "Apple Inc.",
                  sector: "Technology",
                  market: "NASDAQ",
                  source: "manual",
                  price: 100,
                  daily_change: 0,
                  allocation: 50,
                  thesis: "Quality compounder",
                },
              ],
              error: null,
            }),
          }),
        };
      }

      if (table === "watchlist_items") {
        return {
          select: () => ({
            eq: async () => ({
              data: [],
              error: null,
            }),
          }),
        };
      }

      if (table === "news_items") {
        return {
          select: (_columns: string, opts?: { count?: string; head?: boolean }) => {
            if (opts?.head) {
              return {
                gte: async () => ({ count: newsRows.length, error: null }),
              };
            }

            newsSelectCall += 1;

            if (newsSelectCall === 1) {
              return {
                gte: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({
                        data: newsRows[0]
                          ? { published_at: newsRows[0].published_at }
                          : null,
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            }

            return {
              gte: () => ({
                order: () => ({
                  limit: async () => ({ data: newsRows, error: null }),
                }),
              }),
            };
          },
        };
      }

      if (table === "portfolio_insights") {
        return {
          insert: async (rows: Array<Record<string, unknown>>) => {
            insertedInsights.push(...rows);
            return { error: null };
          },
        };
      }

      if (table === "feed_items") {
        return {
          insert: async (row: Record<string, unknown>) => {
            insertedFeedItems.push(row);
            return { error: null };
          },
          delete: () => ({
            lt: async () => ({ error: null }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

function createAIProvider(overrides?: Partial<ReturnType<typeof buildAssessmentProvider>>) {
  return {
    ...buildAssessmentProvider(),
    ...overrides,
  };
}

function buildAssessmentProvider() {
  return {
    generateSummary: vi.fn().mockResolvedValue("summary"),
    scoreSentiment: vi.fn().mockResolvedValue("neutral"),
    scoreRelevance: vi.fn().mockResolvedValue(0),
    assessPortfolioMatch: vi.fn().mockResolvedValue({
      relevanceScore: 0,
      whyItMatters: "",
      matchedHoldings: [],
      matchReasonCodes: [],
    }),
    generateInsights: vi.fn().mockResolvedValue([
      { title: "Most exposed theme", value: "Technology", detail: "AAPL drives exposure." },
    ]),
    explainWhyItMatters: vi.fn().mockResolvedValue(""),
    analyzeArticle: vi.fn(),
    answerArticleQuestion: vi.fn(),
    answerPortfolioQuestion: vi.fn(),
  };
}

function baseNewsRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "news-1",
    headline: "Macro update",
    source: "Wire",
    url: "https://example.com/story",
    published_at: "2026-03-21T12:00:00.000Z",
    angle: null,
    raw_content: "The broader economy remains mixed.",
    category: "macro",
    stock_tags: [],
    global_summary: "Macro summary",
    overall_effect: "neutral",
    ticker_impacts: [],
    source_type: "newsapi",
    metadata: {},
    ...overrides,
  };
}

describe("runAnalysis portfolio match gating", () => {
  beforeEach(() => {
    mockGetAIProvider.mockReset();
  });

  it("returns a concurrency code when a portfolio already has an active run", async () => {
    mockGetAIProvider.mockReturnValue(createAIProvider());

    const supabase = createSupabaseMock({
      newsRows: [baseNewsRow()],
      runInsertError: {
        message: "duplicate key value violates unique constraint",
        code: "23505",
      },
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.runId).toBeNull();
    expect(result.code).toBe("analysis_already_running");
    expect(result.error).toMatch(/already in progress/i);
  });

  it("fails stale active runs before creating a replacement run", async () => {
    mockGetAIProvider.mockReturnValue(createAIProvider());

    const staleStartedAt = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    const supabase = createSupabaseMock({
      newsRows: [baseNewsRow()],
      activeRunRows: [
        {
          id: "stale-run-1",
          status: "processing_holdings",
          updated_at: staleStartedAt,
          started_at: staleStartedAt,
          created_at: staleStartedAt,
        },
      ],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.error).toBeNull();
    expect(supabase.updatedRuns.some((row) => row.status === "failed")).toBe(true);
  });

  it("does not reclaim an active run with a fresh heartbeat", async () => {
    mockGetAIProvider.mockReturnValue(createAIProvider());

    const staleStartedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const freshUpdatedAt = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const supabase = createSupabaseMock({
      newsRows: [baseNewsRow()],
      runInsertError: {
        message: "duplicate key value violates unique constraint",
        code: "23505",
      },
      activeRunRows: [
        {
          id: "active-run-1",
          status: "generating_insights",
          updated_at: freshUpdatedAt,
          started_at: staleStartedAt,
          created_at: staleStartedAt,
        },
      ],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.runId).toBeNull();
    expect(result.code).toBe("analysis_already_running");
    expect(supabase.updatedRuns.some((row) => row.status === "failed")).toBe(false);
  });

  it("marks runs as degraded when AI failures make results unreliable", async () => {
    const ai = createAIProvider({
      generateInsights: vi.fn().mockRejectedValue(new Error("provider timeout")),
      assessPortfolioMatch: vi.fn().mockResolvedValue({
        relevanceScore: 0,
        whyItMatters: "",
        matchedHoldings: [],
        matchReasonCodes: [],
      }),
    });
    mockGetAIProvider.mockReturnValue(ai);

    const supabase = createSupabaseMock({
      newsRows: [
        baseNewsRow({
          stock_tags: ["AAPL"],
          ticker_impacts: [{ symbol: "AAPL", effect: "bullish" }],
          overall_effect: "bullish",
        }),
      ],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.error).toBeNull();
    expect(result.meta?.degraded).toBe(true);
    expect(result.meta?.aiFailures).toBeGreaterThan(0);
    expect(supabase.updatedRuns.some((row) => row.status === "degraded")).toBe(true);
  });

  it("rejects unrelated headlines with no validated portfolio evidence", async () => {
    const ai = createAIProvider({
      assessPortfolioMatch: vi.fn().mockResolvedValue({
        relevanceScore: 92,
        whyItMatters: "Broad macro themes could matter for your holdings.",
        matchedHoldings: [],
        matchReasonCodes: ["sector_exposure_explicit"],
      }),
    });
    mockGetAIProvider.mockReturnValue(ai);

    const supabase = createSupabaseMock({
      newsRows: [baseNewsRow()],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.error).toBeNull();
    expect(result.meta?.feedItemsCreated).toBe(0);
    expect(supabase.insertedFeedItems).toHaveLength(0);
  });

  it("persists direct held ticker matches with reason codes", async () => {
    const ai = createAIProvider({
      assessPortfolioMatch: vi.fn().mockResolvedValue({
        relevanceScore: 0,
        whyItMatters: "",
        matchedHoldings: [],
        matchReasonCodes: [],
      }),
    });
    mockGetAIProvider.mockReturnValue(ai);

    const supabase = createSupabaseMock({
      newsRows: [
        baseNewsRow({
          headline: "Apple supplier raises guidance",
          raw_content: "Apple Inc. may see stronger iPhone demand this quarter.",
          stock_tags: ["AAPL"],
          ticker_impacts: [{ symbol: "AAPL", effect: "bullish" }],
          category: "technology",
          overall_effect: "bullish",
        }),
      ],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.meta?.feedItemsCreated).toBe(1);
    expect(supabase.insertedFeedItems).toHaveLength(1);
    expect(supabase.insertedFeedItems[0].holdings).toEqual(["AAPL"]);
    expect(supabase.insertedFeedItems[0].match_reason_codes).toEqual([
      "held_ticker_tag",
      "held_ticker_impact",
    ]);
    expect(ai.assessPortfolioMatch).not.toHaveBeenCalled();
  });

  it("persists held stock matches from ticker impacts even when stock tags are empty", async () => {
    const ai = createAIProvider({
      assessPortfolioMatch: vi.fn().mockResolvedValue({
        relevanceScore: 0,
        whyItMatters: "",
        matchedHoldings: [],
        matchReasonCodes: [],
      }),
    });
    mockGetAIProvider.mockReturnValue(ai);

    const supabase = createSupabaseMock({
      newsRows: [
        baseNewsRow({
          headline: "Cloud demand lifts sentiment",
          raw_content: "Enterprise cloud demand is improving for large platform companies.",
          stock_tags: [],
          ticker_impacts: [{ symbol: "AAPL", effect: "bullish" }],
          category: "technology",
          overall_effect: "bullish",
        }),
      ],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.meta?.feedItemsCreated).toBe(1);
    expect(supabase.insertedFeedItems[0].holdings).toEqual(["AAPL"]);
    expect(supabase.insertedFeedItems[0].matched_stock_tags).toEqual([]);
    expect(supabase.insertedFeedItems[0].match_reason_codes).toEqual([
      "held_ticker_impact",
    ]);
    expect(ai.assessPortfolioMatch).not.toHaveBeenCalled();
  });

  it("allows explicit sector exposure only when the why-it-matters text names the holding", async () => {
    const ai = createAIProvider({
      assessPortfolioMatch: vi.fn().mockResolvedValue({
        relevanceScore: 74,
        whyItMatters:
          "AAPL may face margin pressure because semiconductor costs are rising across the technology sector.",
        matchedHoldings: ["AAPL"],
        matchReasonCodes: ["sector_exposure_explicit"],
      }),
    });
    mockGetAIProvider.mockReturnValue(ai);

    const supabase = createSupabaseMock({
      newsRows: [
        baseNewsRow({
          headline: "Chip costs rise across technology manufacturers",
          raw_content: "Technology hardware companies are facing higher component costs.",
          category: "technology",
        }),
      ],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.meta?.feedItemsCreated).toBe(1);
    expect(supabase.insertedFeedItems[0].match_reason_codes).toEqual([
      "sector_exposure_explicit",
    ]);
    expect(supabase.insertedFeedItems[0].holdings).toEqual(["AAPL"]);
  });

  it("does not qualify a story when why-it-matters is generic template text", async () => {
    const ai = createAIProvider({
      assessPortfolioMatch: vi.fn().mockResolvedValue({
        relevanceScore: 91,
        whyItMatters:
          "This story may affect positions such as AAPL. Broader macro updates continue.",
        matchedHoldings: ["AAPL"],
        matchReasonCodes: ["sector_exposure_explicit"],
      }),
    });
    mockGetAIProvider.mockReturnValue(ai);

    const supabase = createSupabaseMock({
      newsRows: [
        baseNewsRow({
          headline: "Technology sentiment weakens",
          raw_content: "Technology companies are seeing softer sentiment this week.",
          category: "technology",
        }),
      ],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.meta?.feedItemsCreated).toBe(0);
    expect(supabase.insertedFeedItems).toHaveLength(0);
  });

  it("uses globally enriched stock tags for short-name company stories like Amazon", async () => {
    const ai = createAIProvider({
      assessPortfolioMatch: vi.fn().mockResolvedValue({
        relevanceScore: 0,
        whyItMatters: "",
        matchedHoldings: [],
        matchReasonCodes: [],
      }),
    });
    mockGetAIProvider.mockReturnValue(ai);

    const supabase = createSupabaseMock({
      holdingsRows: [
        {
          id: "h1",
          symbol: "AMZN",
          company: "Amazon.com, Inc.",
          sector: "Consumer",
          market: "NASDAQ",
          source: "manual",
          price: 100,
          daily_change: 0,
          allocation: 50,
          thesis: "E-commerce and cloud",
        },
      ],
      newsRows: [
        baseNewsRow({
          headline: "Amazon Eyes Smartphone Comeback",
          raw_content: "Amazon is reportedly exploring an AI-driven device reboot.",
          stock_tags: ["AMZN"],
          ticker_impacts: [{ symbol: "AMZN", effect: "neutral" }],
          category: "technology",
        }),
      ],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.meta?.feedItemsCreated).toBe(1);
    expect(supabase.insertedFeedItems[0].holdings).toEqual(["AMZN"]);
    expect(supabase.insertedFeedItems[0].match_reason_codes).toEqual([
      "held_ticker_tag",
      "held_ticker_impact",
    ]);
  });

  it("uses globally enriched stock tags for short-name company stories like Microsoft", async () => {
    const ai = createAIProvider({
      assessPortfolioMatch: vi.fn().mockResolvedValue({
        relevanceScore: 0,
        whyItMatters: "",
        matchedHoldings: [],
        matchReasonCodes: [],
      }),
    });
    mockGetAIProvider.mockReturnValue(ai);

    const supabase = createSupabaseMock({
      holdingsRows: [
        {
          id: "h1",
          symbol: "MSFT",
          company: "Microsoft Corporation",
          sector: "Technology",
          market: "NASDAQ",
          source: "manual",
          price: 100,
          daily_change: 0,
          allocation: 50,
          thesis: "Cloud and software",
        },
      ],
      newsRows: [
        baseNewsRow({
          headline: "Microsoft broadens enterprise AI rollout",
          raw_content: "Microsoft is widening its AI software distribution to corporate buyers.",
          stock_tags: ["MSFT"],
          ticker_impacts: [{ symbol: "MSFT", effect: "bullish" }],
          category: "technology",
        }),
      ],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.meta?.feedItemsCreated).toBe(1);
    expect(supabase.insertedFeedItems[0].holdings).toEqual(["MSFT"]);
    expect(supabase.insertedFeedItems[0].match_reason_codes).toEqual([
      "held_ticker_tag",
      "held_ticker_impact",
    ]);
  });

  it("fails closed on generic macro relevance when there is no direct overlap", async () => {
    const ai = createAIProvider({
      assessPortfolioMatch: vi.fn().mockResolvedValue({
        relevanceScore: 84,
        whyItMatters: "Alphabet is spending aggressively on AI infrastructure.",
        matchedHoldings: [],
        matchReasonCodes: ["held_company_mention"],
      }),
    });
    mockGetAIProvider.mockReturnValue(ai);

    const supabase = createSupabaseMock({
      holdingsRows: [
        {
          id: "h1",
          symbol: "GOOGL",
          company: "Alphabet Inc.",
          sector: "Technology",
          market: "NASDAQ",
          source: "manual",
          price: 100,
          daily_change: 0,
          allocation: 50,
          thesis: "Search and cloud",
        },
      ],
      newsRows: [
        baseNewsRow({
          headline: "Alphabet ramps AI capex",
          raw_content: "Alphabet is increasing spending on AI infrastructure.",
          category: "technology",
        }),
      ],
    });

    const result = await runAnalysis(supabase as never, "p1");

    expect(result.meta?.feedItemsCreated).toBe(0);
    expect(supabase.insertedFeedItems).toHaveLength(0);
  });
});
