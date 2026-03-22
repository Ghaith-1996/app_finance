import { beforeEach, describe, expect, it, vi } from "vitest";

let currentSupabaseMock: ReturnType<typeof createSupabaseMock>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabaseMock,
}));

import { GET } from "@/app/api/feed/route";

function createSupabaseMock(
  matchReasonCodes: string[] | null,
  marketMatchMode: "tag" | "impact" = "tag",
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

  it("returns matchReasonCodes when present on feed items", async () => {
    const res = await GET(new Request("http://localhost/api/feed?mode=personal&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].matchReasonCodes).toEqual(["held_ticker_tag"]);
    expect(body.portfolioSymbols).toEqual(["AAPL"]);
    expect(body.portfolioSectors).toEqual(["Technology"]);
  });

  it("keeps backward compatibility when match_reason_codes is null", async () => {
    currentSupabaseMock = createSupabaseMock(null);

    const res = await GET(new Request("http://localhost/api/feed?mode=personal&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].matchReasonCodes).toEqual([]);
  });

  it("marks market stories as portfolio matches when ticker impacts mention a held stock", async () => {
    currentSupabaseMock = createSupabaseMock(["held_ticker_tag"], "impact");

    const res = await GET(new Request("http://localhost/api/feed?mode=market&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].isPortfolioMatch).toBe(true);
    expect(body.feed[0].matchedStockTags).toEqual(["AAPL"]);
  });
});
