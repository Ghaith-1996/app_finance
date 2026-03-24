import { beforeEach, describe, expect, it, vi } from "vitest";

let currentSupabaseMock: ReturnType<typeof createSupabaseMock>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabaseMock,
}));

import { GET } from "@/app/api/feed/route";

function createSupabaseMock(
  matchReasonCodes: string[] | null,
  matchSources: string[] | null = ["portfolio"],
  marketMatchMode: "tag" | "impact" = "tag",
  watchlistSymbols: string[] = [],
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from(table: string) {
      if (table === "portfolios") {
        return {
          select: () => ({
            eq: (_column: string, value: string) => {
              if (value === "user-1") {
                return {
                  order: () => ({
                    limit: async () => ({ data: [{ id: "p1" }], error: null }),
                  }),
                };
              }

              return {
                eq: () => ({
                  single: async () => ({ data: { id: "p1" }, error: null }),
                }),
              };
            },
          }),
        };
      }

      if (table === "analysis_runs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { id: "run-1" }, error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "feed_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: "feed-1",
                        relevance_score: 81,
                        sentiment: "neutral",
                        impact: "Medium",
                        holdings: ["AAPL"],
                        sectors: ["Technology"],
                        ai_summary: "summary",
                        why_it_matters: "Apple may benefit from stronger device demand.",
                        matched_stock_tags: ["AAPL"],
                        match_reason_codes: matchReasonCodes,
                        match_sources: matchSources,
                        display_effect: "bullish",
                        source_confidence: "standard",
                        news_items: {
                          id: "news-1",
                          headline: "Apple demand improves",
                          source: "Wire",
                          url: null,
                          published_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                          angle: null,
                          category: "technology",
                          stock_tags: ["AAPL"],
                          global_summary: "global summary",
                          overall_effect: "bullish",
                          ticker_impacts: [{ symbol: "AAPL", effect: "bullish" }],
                          source_type: "newsapi",
                          metadata: {},
                        },
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }

      if (table === "holdings") {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ symbol: "AAPL", sector: "Technology" }],
              error: null,
            }),
          }),
        };
      }

      if (table === "watchlist_items") {
        return {
          select: () => ({
            eq: async () => ({
              data: watchlistSymbols.map((s) => ({ symbol: s })),
              error: null,
            }),
          }),
        };
      }

      if (table === "news_items") {
        return {
          select: () => ({
            gte: () => ({
              order: () => ({
                limit: async () => ({
                  data: [
                    {
                      id: "news-market-1",
                      headline: "Apple demand improves",
                      source: "Wire",
                      url: null,
                      published_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
                      angle: null,
                      category: "technology",
                      stock_tags: marketMatchMode === "tag" ? ["AAPL"] : [],
                      global_summary: "global summary",
                      overall_effect: "bullish",
                      ticker_impacts:
                        marketMatchMode === "impact"
                          ? [{ symbol: "AAPL", effect: "bullish" }]
                          : [],
                      source_type: "newsapi",
                      metadata: {},
                      raw_content: "content",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("GET /api/feed personal mode", () => {
  beforeEach(() => {
    currentSupabaseMock = createSupabaseMock(["held_ticker_tag"]);
  });

  it("returns matchReasonCodes and matchSources when present on feed items", async () => {
    const res = await GET(new Request("http://localhost/api/feed?mode=personal&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].matchReasonCodes).toEqual(["held_ticker_tag"]);
    expect(body.feed[0].matchSources).toEqual(["portfolio"]);
    expect(body.portfolioSymbols).toEqual(["AAPL"]);
    expect(body.portfolioSectors).toEqual(["Technology"]);
  });

  it("keeps backward compatibility when match_reason_codes is null", async () => {
    currentSupabaseMock = createSupabaseMock(null, null);

    const res = await GET(new Request("http://localhost/api/feed?mode=personal&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].matchReasonCodes).toEqual([]);
    expect(body.feed[0].matchSources).toEqual(["portfolio"]);
  });

  it("returns watchlist match sources when present", async () => {
    currentSupabaseMock = createSupabaseMock(
      ["watchlist_ticker_tag"],
      ["watchlist"],
    );

    const res = await GET(new Request("http://localhost/api/feed?mode=personal&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].matchSources).toEqual(["watchlist"]);
    expect(body.feed[0].matchReasonCodes).toEqual(["watchlist_ticker_tag"]);
  });

  it("includes watchlistSymbols in response", async () => {
    currentSupabaseMock = createSupabaseMock(["held_ticker_tag"], ["portfolio"], "tag", ["TSLA"]);

    const res = await GET(new Request("http://localhost/api/feed?mode=personal&portfolioId=p1"));
    const body = await res.json();

    expect(body.watchlistSymbols).toEqual(["TSLA"]);
  });

  it("falls back to direct watchlist matching when the user has no portfolio", async () => {
    currentSupabaseMock = {
      ...createSupabaseMock(null, null, "tag", ["AAPL"]),
      from(table: string) {
        if (table === "portfolios") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }

        return createSupabaseMock(null, null, "tag", ["AAPL"]).from(table);
      },
    };

    const res = await GET(new Request("http://localhost/api/feed?mode=personal"));
    const body = await res.json();

    expect(body.mode).toBe("personal");
    expect(body.portfolioId).toBeNull();
    expect(body.watchlistSymbols).toEqual(["AAPL"]);
    expect(body.feed).toHaveLength(1);
    expect(body.feed[0].matchSources).toEqual(["watchlist"]);
    expect(body.feed[0].matchReasonCodes).toEqual(["watchlist_ticker_tag"]);
    expect(body.feed[0].relevanceScore).toBe(75);
  });
});

describe("GET /api/feed market mode", () => {
  it("marks market stories as portfolio matches when ticker impacts mention a held stock", async () => {
    currentSupabaseMock = createSupabaseMock(["held_ticker_tag"], null, "impact");

    const res = await GET(new Request("http://localhost/api/feed?mode=market&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].isPortfolioMatch).toBe(true);
    expect(body.feed[0].matchedStockTags).toContain("AAPL");
  });

  it("sets isWatchlistMatch when news tags overlap watchlist symbols", async () => {
    currentSupabaseMock = createSupabaseMock(null, null, "tag", ["AAPL"]);

    const res = await GET(new Request("http://localhost/api/feed?mode=market&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].isWatchlistMatch).toBe(true);
  });
});
