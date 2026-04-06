import { beforeEach, describe, expect, it, vi } from "vitest";

let currentSupabaseMock: ReturnType<typeof createSupabaseMock>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabaseMock,
}));

import { GET } from "@/app/api/feed/route";

function createAwaitableBuilder<T>(rows: T[]) {
  const builder = {
    eq: () => builder,
    in: () => builder,
    contains: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    select: () => builder,
    single: async () => ({
      data: rows[0] ?? null,
      error: rows[0] ? null : { message: "Not found" },
    }),
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (
      onFulfilled: (value: { data: T[]; error: { message: string } | null }) => unknown,
    ) => Promise.resolve({ data: rows, error: null as { message: string } | null }).then(onFulfilled),
  };

  return builder;
}

function createSupabaseMock(
  matchReasonCodes: string[] | null,
  matchSources: string[] | null = ["portfolio"],
  marketMatchMode: "tag" | "impact" = "tag",
  watchlistSymbols: string[] = [],
  marketRows?: Array<Record<string, unknown>>,
  feedRows?: Array<Record<string, unknown>>,
) {
  const resolvedMarketRows = marketRows ?? [
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
      detail_open_count: 0,
    },
  ];
  const resolvedFeedRows = feedRows ?? [
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
        detail_open_count: 0,
      },
    },
  ];

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
          select: () => createAwaitableBuilder([{ id: "run-1" }]),
        };
      }

      if (table === "feed_items") {
        return {
          select: () => createAwaitableBuilder(resolvedFeedRows),
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
          select: () => createAwaitableBuilder(resolvedMarketRows),
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

    expect(body.appliedSort).toBe("match");
    expect(body.sortNotice).toBeNull();
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

  it("sorts the personal feed by most recent when requested", async () => {
    currentSupabaseMock = createSupabaseMock(
      ["held_ticker_tag"],
      ["portfolio"],
      "tag",
      [],
      undefined,
      [
        {
          id: "feed-older",
          relevance_score: 98,
          sentiment: "neutral",
          impact: "Medium",
          holdings: ["AAPL"],
          sectors: ["Technology"],
          ai_summary: "summary",
          why_it_matters: "Older higher-match story.",
          matched_stock_tags: ["AAPL"],
          match_reason_codes: ["held_ticker_tag"],
          match_sources: ["portfolio"],
          display_effect: "bullish",
          source_confidence: "standard",
          news_items: {
            id: "news-older",
            headline: "Older higher-match story",
            source: "Wire",
            url: null,
            published_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
            angle: null,
            category: "technology",
            stock_tags: ["AAPL"],
            global_summary: "global summary",
            overall_effect: "bullish",
            ticker_impacts: [],
            source_type: "newsapi",
            metadata: {},
            detail_open_count: 1,
          },
        },
        {
          id: "feed-newer",
          relevance_score: 72,
          sentiment: "neutral",
          impact: "Medium",
          holdings: ["AAPL"],
          sectors: ["Technology"],
          ai_summary: "summary",
          why_it_matters: "Newer lower-match story.",
          matched_stock_tags: ["AAPL"],
          match_reason_codes: ["held_ticker_tag"],
          match_sources: ["portfolio"],
          display_effect: "bullish",
          source_confidence: "standard",
          news_items: {
            id: "news-newer",
            headline: "Newer lower-match story",
            source: "Wire",
            url: null,
            published_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            angle: null,
            category: "technology",
            stock_tags: ["AAPL"],
            global_summary: "global summary",
            overall_effect: "bullish",
            ticker_impacts: [],
            source_type: "newsapi",
            metadata: {},
            detail_open_count: 0,
          },
        },
      ],
    );

    const res = await GET(
      new Request("http://localhost/api/feed?mode=personal&portfolioId=p1&sort=recent"),
    );
    const body = await res.json();

    expect(body.appliedSort).toBe("recent");
    expect(body.feed.map((item: { headline: string }) => item.headline)).toEqual([
      "Newer lower-match story",
      "Older higher-match story",
    ]);
  });

  it("sorts the personal feed by hot using detail_open_count", async () => {
    currentSupabaseMock = createSupabaseMock(
      ["held_ticker_tag"],
      ["portfolio"],
      "tag",
      [],
      undefined,
      [
        {
          id: "feed-hot",
          relevance_score: 70,
          sentiment: "neutral",
          impact: "Medium",
          holdings: ["AAPL"],
          sectors: ["Technology"],
          ai_summary: "summary",
          why_it_matters: "Most opened story.",
          matched_stock_tags: ["AAPL"],
          match_reason_codes: ["held_ticker_tag"],
          match_sources: ["portfolio"],
          display_effect: "bullish",
          source_confidence: "standard",
          news_items: {
            id: "news-hot",
            headline: "Most opened story",
            source: "Wire",
            url: null,
            published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            angle: null,
            category: "technology",
            stock_tags: ["AAPL"],
            global_summary: "global summary",
            overall_effect: "bullish",
            ticker_impacts: [],
            source_type: "newsapi",
            metadata: {},
            detail_open_count: 11,
          },
        },
        {
          id: "feed-recent",
          relevance_score: 95,
          sentiment: "neutral",
          impact: "Medium",
          holdings: ["AAPL"],
          sectors: ["Technology"],
          ai_summary: "summary",
          why_it_matters: "Recent but cooler story.",
          matched_stock_tags: ["AAPL"],
          match_reason_codes: ["held_ticker_tag"],
          match_sources: ["portfolio"],
          display_effect: "bullish",
          source_confidence: "standard",
          news_items: {
            id: "news-recent",
            headline: "Recent but cooler story",
            source: "Wire",
            url: null,
            published_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            angle: null,
            category: "technology",
            stock_tags: ["AAPL"],
            global_summary: "global summary",
            overall_effect: "bullish",
            ticker_impacts: [],
            source_type: "newsapi",
            metadata: {},
            detail_open_count: 3,
          },
        },
      ],
    );

    const res = await GET(
      new Request("http://localhost/api/feed?mode=personal&portfolioId=p1&sort=hot"),
    );
    const body = await res.json();

    expect(body.appliedSort).toBe("hot");
    expect(body.sortNotice).toBeNull();
    expect(body.feed.map((item: { headline: string }) => item.headline)).toEqual([
      "Most opened story",
      "Recent but cooler story",
    ]);
  });

  it("falls back from hot to most recent when no personal stories have click data", async () => {
    currentSupabaseMock = createSupabaseMock(
      ["held_ticker_tag"],
      ["portfolio"],
      "tag",
      [],
      undefined,
      [
        {
          id: "feed-older",
          relevance_score: 99,
          sentiment: "neutral",
          impact: "Medium",
          holdings: ["AAPL"],
          sectors: ["Technology"],
          ai_summary: "summary",
          why_it_matters: "Older story.",
          matched_stock_tags: ["AAPL"],
          match_reason_codes: ["held_ticker_tag"],
          match_sources: ["portfolio"],
          display_effect: "bullish",
          source_confidence: "standard",
          news_items: {
            id: "news-older",
            headline: "Older story",
            source: "Wire",
            url: null,
            published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            angle: null,
            category: "technology",
            stock_tags: ["AAPL"],
            global_summary: "global summary",
            overall_effect: "bullish",
            ticker_impacts: [],
            source_type: "newsapi",
            metadata: {},
            detail_open_count: 0,
          },
        },
        {
          id: "feed-newer",
          relevance_score: 40,
          sentiment: "neutral",
          impact: "Medium",
          holdings: ["AAPL"],
          sectors: ["Technology"],
          ai_summary: "summary",
          why_it_matters: "Newer story.",
          matched_stock_tags: ["AAPL"],
          match_reason_codes: ["held_ticker_tag"],
          match_sources: ["portfolio"],
          display_effect: "bullish",
          source_confidence: "standard",
          news_items: {
            id: "news-newer",
            headline: "Newer story",
            source: "Wire",
            url: null,
            published_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            angle: null,
            category: "technology",
            stock_tags: ["AAPL"],
            global_summary: "global summary",
            overall_effect: "bullish",
            ticker_impacts: [],
            source_type: "newsapi",
            metadata: {},
            detail_open_count: 0,
          },
        },
      ],
    );

    const res = await GET(
      new Request("http://localhost/api/feed?mode=personal&portfolioId=p1&sort=hot"),
    );
    const body = await res.json();

    expect(body.appliedSort).toBe("recent");
    expect(body.sortNotice).toBe("No hot news yet. Showing most recent instead.");
    expect(body.feed.map((item: { headline: string }) => item.headline)).toEqual([
      "Newer story",
      "Older story",
    ]);
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
  it("defaults the market feed to most recent sorting", async () => {
    currentSupabaseMock = createSupabaseMock(["held_ticker_tag"]);

    const res = await GET(new Request("http://localhost/api/feed?mode=market&portfolioId=p1"));
    const body = await res.json();

    expect(body.appliedSort).toBe("recent");
    expect(body.sortNotice).toBeNull();
  });

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

  it("filters market stories by ticker across both stock tags and ticker impacts", async () => {
    currentSupabaseMock = createSupabaseMock(
      null,
      null,
      "tag",
      [],
      [
        {
          id: "news-market-1",
          headline: "Apple tag story",
          source: "Wire",
          url: null,
          published_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          angle: null,
          category: "technology",
          stock_tags: ["AAPL"],
          global_summary: "global summary",
          overall_effect: "bullish",
          ticker_impacts: [],
          source_type: "newsapi",
          metadata: {},
          raw_content: "content",
        },
        {
          id: "news-market-2",
          headline: "Apple impact story",
          source: "Wire",
          url: null,
          published_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
          angle: null,
          category: "technology",
          stock_tags: [],
          global_summary: "global summary",
          overall_effect: "neutral",
          ticker_impacts: [{ symbol: "AAPL", effect: "bullish" }],
          source_type: "gnews",
          metadata: {},
          raw_content: "content",
        },
        {
          id: "news-market-3",
          headline: "Microsoft story",
          source: "Wire",
          url: null,
          published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          angle: null,
          category: "technology",
          stock_tags: ["MSFT"],
          global_summary: "global summary",
          overall_effect: "neutral",
          ticker_impacts: [],
          source_type: "newsapi",
          metadata: {},
          raw_content: "content",
        },
      ],
    );

    const res = await GET(
      new Request("http://localhost/api/feed?mode=market&portfolioId=p1&ticker=aapl"),
    );
    const body = await res.json();

    expect(body.feed).toHaveLength(2);
    expect(body.feed.map((item: { headline: string }) => item.headline)).toEqual([
      "Apple tag story",
      "Apple impact story",
    ]);
    expect(body.totalCount).toBe(2);
    expect(body.totalPages).toBe(1);
  });

  it("sorts the market feed by hot and then by most recent on ties", async () => {
    currentSupabaseMock = createSupabaseMock(
      null,
      null,
      "tag",
      [],
      [
        {
          id: "news-market-1",
          headline: "Warm story",
          source: "Wire",
          url: null,
          published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          angle: null,
          category: "technology",
          stock_tags: ["AAPL"],
          global_summary: "global summary",
          overall_effect: "bullish",
          ticker_impacts: [],
          source_type: "newsapi",
          metadata: {},
          raw_content: "content",
          detail_open_count: 9,
        },
        {
          id: "news-market-2",
          headline: "Hotter story",
          source: "Wire",
          url: null,
          published_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          angle: null,
          category: "technology",
          stock_tags: ["AAPL"],
          global_summary: "global summary",
          overall_effect: "bullish",
          ticker_impacts: [],
          source_type: "newsapi",
          metadata: {},
          raw_content: "content",
          detail_open_count: 14,
        },
        {
          id: "news-market-3",
          headline: "Same clicks, newer story",
          source: "Wire",
          url: null,
          published_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          angle: null,
          category: "technology",
          stock_tags: ["AAPL"],
          global_summary: "global summary",
          overall_effect: "bullish",
          ticker_impacts: [],
          source_type: "newsapi",
          metadata: {},
          raw_content: "content",
          detail_open_count: 9,
        },
      ],
    );

    const res = await GET(
      new Request("http://localhost/api/feed?mode=market&portfolioId=p1&sort=hot"),
    );
    const body = await res.json();

    expect(body.appliedSort).toBe("hot");
    expect(body.feed.map((item: { headline: string }) => item.headline)).toEqual([
      "Hotter story",
      "Same clicks, newer story",
      "Warm story",
    ]);
  });

  it("sorts the market feed by oldest when requested", async () => {
    currentSupabaseMock = createSupabaseMock(
      null,
      null,
      "tag",
      [],
      [
        {
          id: "news-market-1",
          headline: "Newest story",
          source: "Wire",
          url: null,
          published_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          angle: null,
          category: "technology",
          stock_tags: ["AAPL"],
          global_summary: "global summary",
          overall_effect: "bullish",
          ticker_impacts: [],
          source_type: "newsapi",
          metadata: {},
          raw_content: "content",
          detail_open_count: 2,
        },
        {
          id: "news-market-2",
          headline: "Oldest story",
          source: "Wire",
          url: null,
          published_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
          angle: null,
          category: "technology",
          stock_tags: ["AAPL"],
          global_summary: "global summary",
          overall_effect: "bullish",
          ticker_impacts: [],
          source_type: "newsapi",
          metadata: {},
          raw_content: "content",
          detail_open_count: 0,
        },
      ],
    );

    const res = await GET(
      new Request("http://localhost/api/feed?mode=market&portfolioId=p1&sort=oldest"),
    );
    const body = await res.json();

    expect(body.appliedSort).toBe("oldest");
    expect(body.feed.map((item: { headline: string }) => item.headline)).toEqual([
      "Oldest story",
      "Newest story",
    ]);
  });

  it("paginates the market feed after applying filters", async () => {
    const pagedRows = Array.from({ length: 55 }, (_, index) => ({
      id: `news-market-${index + 1}`,
      headline: `Story ${index + 1}`,
      source: "Wire",
      url: null,
      published_at: new Date(Date.now() - index * 60_000).toISOString(),
      angle: null,
      category: "technology",
      stock_tags: index % 2 === 0 ? ["AAPL"] : [],
      global_summary: "global summary",
      overall_effect: "neutral",
      ticker_impacts: [],
      source_type: "newsapi",
      metadata: {},
      raw_content: "content",
      detail_open_count: 0,
    }));
    currentSupabaseMock = createSupabaseMock(null, null, "tag", [], pagedRows);

    const res = await GET(
      new Request("http://localhost/api/feed?mode=market&portfolioId=p1&page=2&pageSize=50"),
    );
    const body = await res.json();

    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(50);
    expect(body.totalCount).toBe(55);
    expect(body.totalPages).toBe(2);
    expect(body.feed).toHaveLength(5);
    expect(body.feed[0].headline).toBe("Story 51");
  });
});
