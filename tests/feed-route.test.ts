import { beforeEach, describe, expect, it, vi } from "vitest";

let currentSupabaseMock: ReturnType<typeof createSupabaseMock>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabaseMock,
}));

import { GET } from "@/app/api/feed/route";
import { loadDeepLinkedStory } from "@/lib/server/feed";
import type { TickerImpact } from "@/lib/types";
import type { InvestmentThesisRow } from "@/lib/investment-theses/types";

function createAwaitableBuilder<T>(rows: T[]) {
  const builder = {
    eq: () => builder,
    in: () => builder,
    is: () => builder,
    or: () => builder,
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
      onFulfilled: (value: { data: T[]; error: { message: string; } | null; }) => unknown,
    ) => Promise.resolve({ data: rows, error: null as { message: string; } | null }).then(onFulfilled),
  };

  return builder;
}

type NewsRow = {
  id: string;
  headline: string;
  source: string;
  url: string | null;
  published_at: string;
  angle: string | null;
  category: string;
  stock_tags: string[];
  global_summary: string;
  overall_effect: string;
  ticker_impacts: TickerImpact[];
  source_type: string;
  metadata: Record<string, unknown>;
  raw_content: string | null;
  detail_open_count: number;
};

function makeNewsRow(overrides: Partial<NewsRow> = {}): NewsRow {
  return {
    id: "news-market-1",
    headline: "Apple demand improves",
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
    detail_open_count: 0,
    ...overrides,
  };
}

type FeedRow = {
  id: string;
  relevance_score: number;
  sentiment: string;
  impact: string;
  holdings: string[];
  sectors: string[];
  ai_summary: string;
  why_it_matters: string;
  matched_stock_tags: string[];
  match_reason_codes: string[] | null;
  match_sources: string[] | null;
  display_effect: string;
  source_confidence: string;
  news_items: NewsRow;
};

function makeFeedRow(overrides: Partial<FeedRow> = {}): FeedRow {
  return {
    id: "feed-1",
    relevance_score: 81,
    sentiment: "neutral",
    impact: "Medium",
    holdings: ["AAPL"],
    sectors: ["Technology"],
    ai_summary: "summary",
    why_it_matters: "Apple may benefit from stronger device demand.",
    matched_stock_tags: ["AAPL"],
    match_reason_codes: ["held_ticker_tag"],
    match_sources: ["portfolio"],
    display_effect: "bullish",
    source_confidence: "standard",
    news_items: makeNewsRow({ id: "news-1", ticker_impacts: [{ symbol: "AAPL", effect: "bullish" }] }),
    ...overrides,
  };
}

function createSupabaseMock({
  matchReasonCodes = ["held_ticker_tag"],
  matchSources = ["portfolio"],
  marketMatchMode = "tag",
  watchlistSymbols = [],
  marketRows,
  feedRows,
  thesisRows = [],
  portfolioRows = [{ id: "p1" }],
}: {
  matchReasonCodes?: string[] | null;
  matchSources?: string[] | null;
  marketMatchMode?: "tag" | "impact";
  watchlistSymbols?: string[];
  marketRows?: NewsRow[];
  feedRows?: FeedRow[];
  thesisRows?: InvestmentThesisRow[];
  portfolioRows?: Array<{ id: string; }>;
} = {}) {
  const tableRows: Record<string, Array<Record<string, unknown>>> = {
    portfolios: portfolioRows,
    analysis_runs: [{ id: "run-1" }],
    feed_items: feedRows ?? [makeFeedRow({ match_reason_codes: matchReasonCodes, match_sources: matchSources })],
    holdings: [{ symbol: "AAPL", sector: "Technology" }],
    watchlist_items: watchlistSymbols.map(symbol => ({ symbol })),
    news_items: marketRows ?? [makeNewsRow({
      stock_tags: marketMatchMode === "tag" ? ["AAPL"] : [],
      ticker_impacts: marketMatchMode === "impact" ? [{ symbol: "AAPL", effect: "bullish" }] : [],
    })],
    user_investment_theses: thesisRows,
  };
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    from(table: string) {
      const rows = tableRows[table];
      if (!rows) throw new Error(`Unexpected table ${table}`);
      return { select: () => createAwaitableBuilder(rows) };
    },
  };
}

describe("GET /api/feed personal mode", () => {
  beforeEach(() => {
    currentSupabaseMock = createSupabaseMock();
  });

  it("keeps backward compatibility when match_reason_codes is null", async () => {
    currentSupabaseMock = createSupabaseMock({
      matchReasonCodes: null,
      matchSources: null
    });

    const res = await GET(new Request("http://localhost/api/feed?mode=personal&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].matchReasonCodes).toEqual([]);
    expect(body.feed[0].matchSources).toEqual(["portfolio"]);
  });

  it("adds thesis matches when a saved risk appears in the story context", async () => {
    currentSupabaseMock = createSupabaseMock({
      thesisRows: [
        {
          id: "thesis-1",
          symbol: "AAPL",
          portfolio_id: "p1",
          scope: "holding",
          thesis: "Device demand can support earnings durability.",
          risks: ["stronger device demand"],
          invalidation_notes: "",
          horizon: "medium",
          conviction: "medium",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ]
    });

    const res = await GET(new Request("http://localhost/api/feed?mode=personal&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].thesisMatches).toEqual([
      {
        symbol: "AAPL",
        label: "AAPL risk",
        detail: "Touches saved risk: stronger device demand",
        tone: "watch",
      },
    ]);
  });

  it("sorts the personal feed by most recent when requested", async () => {
    currentSupabaseMock = createSupabaseMock({
      feedRows: [
        makeFeedRow({
          id: "feed-older",
          relevance_score: 98,
          why_it_matters: "Older higher-match story.",
          news_items: makeNewsRow({
            id: "news-older",
            headline: "Older higher-match story",
            published_at: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
            detail_open_count: 1,
          }),
        }),
        makeFeedRow({
          id: "feed-newer",
          relevance_score: 72,
          why_it_matters: "Newer lower-match story.",
          news_items: makeNewsRow({
            id: "news-newer",
            headline: "Newer lower-match story",
            published_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          }),
        })
      ]
    });

    const res = await GET(
      new Request("http://localhost/api/feed?mode=personal&portfolioId=p1&sort=recent"),
    );
    const body = await res.json();

    expect(body.appliedSort).toBe("recent");
    expect(body.feed.map((item: { headline: string; }) => item.headline)).toEqual([
      "Newer lower-match story",
      "Older higher-match story",
    ]);
  });

  it("sorts the personal feed by hot using detail_open_count", async () => {
    currentSupabaseMock = createSupabaseMock({
      feedRows: [
        makeFeedRow({
          id: "feed-hot",
          relevance_score: 70,
          why_it_matters: "Most opened story.",
          news_items: makeNewsRow({
            id: "news-hot",
            headline: "Most opened story",
            published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
            detail_open_count: 11,
          }),
        }),
        makeFeedRow({
          id: "feed-recent",
          relevance_score: 95,
          why_it_matters: "Recent but cooler story.",
          news_items: makeNewsRow({
            id: "news-recent",
            headline: "Recent but cooler story",
            published_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            detail_open_count: 3,
          }),
        })
      ]
    });

    const res = await GET(
      new Request("http://localhost/api/feed?mode=personal&portfolioId=p1&sort=hot"),
    );
    const body = await res.json();

    expect(body.appliedSort).toBe("hot");
    expect(body.sortNotice).toBeNull();
    expect(body.feed.map((item: { headline: string; }) => item.headline)).toEqual([
      "Most opened story",
      "Recent but cooler story",
    ]);
  });

  it("falls back from hot to most recent when no personal stories have click data", async () => {
    currentSupabaseMock = createSupabaseMock({
      feedRows: [
        makeFeedRow({
          id: "feed-older",
          relevance_score: 99,
          why_it_matters: "Older story.",
          news_items: makeNewsRow({
            id: "news-older",
            headline: "Older story",
            published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          }),
        }),
        makeFeedRow({
          id: "feed-newer",
          relevance_score: 40,
          why_it_matters: "Newer story.",
          news_items: makeNewsRow({
            id: "news-newer",
            headline: "Newer story",
            published_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          }),
        })
      ]
    });

    const res = await GET(
      new Request("http://localhost/api/feed?mode=personal&portfolioId=p1&sort=hot"),
    );
    const body = await res.json();

    expect(body.appliedSort).toBe("recent");
    expect(body.sortNotice).toBe("No hot news yet. Showing most recent instead.");
    expect(body.feed.map((item: { headline: string; }) => item.headline)).toEqual([
      "Newer story",
      "Older story",
    ]);
  });

  it("falls back to direct watchlist matching when the user has no portfolio", async () => {
    currentSupabaseMock = createSupabaseMock({
      matchReasonCodes: null,
      matchSources: null,
      watchlistSymbols: ["AAPL"],
      portfolioRows: [],
    });

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
    currentSupabaseMock = createSupabaseMock({
      matchSources: null,
      marketMatchMode: "impact"
    });

    const res = await GET(new Request("http://localhost/api/feed?mode=market&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].isPortfolioMatch).toBe(true);
    expect(body.feed[0].matchedStockTags).toContain("AAPL");
  });

  it("sets isWatchlistMatch when news tags overlap watchlist symbols", async () => {
    currentSupabaseMock = createSupabaseMock({
      matchReasonCodes: null,
      matchSources: null,
      watchlistSymbols: ["AAPL"]
    });

    const res = await GET(new Request("http://localhost/api/feed?mode=market&portfolioId=p1"));
    const body = await res.json();

    expect(body.feed[0].isWatchlistMatch).toBe(true);
  });

  it("filters market stories by ticker across both stock tags and ticker impacts", async () => {
    currentSupabaseMock = createSupabaseMock({
      matchReasonCodes: null,
      matchSources: null,
      marketRows: [
        makeNewsRow({
          id: "news-market-1",
          headline: "Apple tag story",
        }),
        makeNewsRow({
          id: "news-market-2",
          headline: "Apple impact story",
          published_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
          stock_tags: [],
          overall_effect: "neutral",
          ticker_impacts: [{ symbol: "AAPL", effect: "bullish" }],
          source_type: "gnews",
        }),
        makeNewsRow({
          id: "news-market-3",
          headline: "Microsoft story",
          published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          stock_tags: ["MSFT"],
          overall_effect: "neutral",
        })
      ]
    });

    const res = await GET(
      new Request("http://localhost/api/feed?mode=market&portfolioId=p1&ticker=aapl"),
    );
    const body = await res.json();

    expect(body.feed).toHaveLength(2);
    expect(body.feed.map((item: { headline: string; }) => item.headline)).toEqual([
      "Apple tag story",
      "Apple impact story",
    ]);
    expect(body.totalCount).toBe(2);
    expect(body.totalPages).toBe(1);
  });

  it("sorts the market feed by hot and then by most recent on ties", async () => {
    currentSupabaseMock = createSupabaseMock({
      matchReasonCodes: null,
      matchSources: null,
      marketRows: [
        makeNewsRow({
          id: "news-market-1",
          headline: "Warm story",
          published_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          detail_open_count: 9,
        }),
        makeNewsRow({
          id: "news-market-2",
          headline: "Hotter story",
          detail_open_count: 14,
        }),
        makeNewsRow({
          id: "news-market-3",
          headline: "Same clicks, newer story",
          published_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          detail_open_count: 9,
        })
      ]
    });

    const res = await GET(
      new Request("http://localhost/api/feed?mode=market&portfolioId=p1&sort=hot"),
    );
    const body = await res.json();

    expect(body.appliedSort).toBe("hot");
    expect(body.feed.map((item: { headline: string; }) => item.headline)).toEqual([
      "Hotter story",
      "Same clicks, newer story",
      "Warm story",
    ]);
  });

  it("sorts the market feed by oldest when requested", async () => {
    currentSupabaseMock = createSupabaseMock({
      matchReasonCodes: null,
      matchSources: null,
      marketRows: [
        makeNewsRow({
          id: "news-market-1",
          headline: "Newest story",
          published_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          detail_open_count: 2,
        }),
        makeNewsRow({
          id: "news-market-2",
          headline: "Oldest story",
          published_at: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
        })
      ]
    });

    const res = await GET(
      new Request("http://localhost/api/feed?mode=market&portfolioId=p1&sort=oldest"),
    );
    const body = await res.json();

    expect(body.appliedSort).toBe("oldest");
    expect(body.feed.map((item: { headline: string; }) => item.headline)).toEqual([
      "Oldest story",
      "Newest story",
    ]);
  });

  it("paginates the market feed after applying filters", async () => {
    const pagedRows = Array.from({ length: 55 }, (_, index) => (makeNewsRow({
      id: `news-market-${index + 1}`,
      headline: `Story ${index + 1}`,
      published_at: new Date(Date.now() - index * 60_000).toISOString(),
      stock_tags: index % 2 === 0 ? ["AAPL"] : [],
      overall_effect: "neutral",
    })));
    currentSupabaseMock = createSupabaseMock({
      matchReasonCodes: null,
      matchSources: null,
      marketRows: pagedRows
    });

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

// Audit F05: ?story= links resolve by ID regardless of the 24h window.

const OLD_NEWS_ID = "11111111-1111-4111-8111-111111111111";
const FEED_ITEM_ID = "22222222-2222-4222-8222-222222222222";

function fakeSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        maybeSingle: async () => ({
          data: (tables[table] ?? []).find((row) => filters.every(([c, v]) => row[c] === v)) ?? null,
          error: null,
        }),
      };
      return builder;
    },
  };
}

const oldSecFiling = makeNewsRow({
  id: OLD_NEWS_ID,
  headline: "SEC filing from August",
  source: "SEC",
  url: "https://www.sec.gov/filing",
  published_at: "2026-08-25T12:00:00.000Z",
  category: "filings",
  global_summary: "Summary",
  overall_effect: "neutral",
  source_type: "edgar",
  raw_content: null,
});

const symbols = { portfolioSymbols: ["AAPL"], watchlistSymbols: [] };

describe("loadDeepLinkedStory", () => {
  it("returns a story older than the feed window by news item ID", async () => {
    const result = await loadDeepLinkedStory(fakeSupabase({ news_items: [oldSecFiling] }) as never, OLD_NEWS_ID, symbols);
    expect(result).toMatchObject({
      status: "found",
      story: { id: OLD_NEWS_ID, newsItemId: OLD_NEWS_ID, headline: "SEC filing from August", isPortfolioMatch: true },
    });
  });

  it("accepts a feed item ID and resolves its article", async () => {
    const supabase = fakeSupabase({
      news_items: [oldSecFiling],
      feed_items: [{ id: FEED_ITEM_ID, news_item_id: OLD_NEWS_ID }],
    });
    const result = await loadDeepLinkedStory(supabase as never, FEED_ITEM_ID, symbols);
    expect(result).toMatchObject({ status: "found", story: { newsItemId: OLD_NEWS_ID } });
  });

  it("reports a deleted article explicitly", async () => {
    const result = await loadDeepLinkedStory(fakeSupabase({}) as never, OLD_NEWS_ID, symbols);
    expect(result).toEqual({ status: "not_found" });
  });

  it("rejects malformed IDs without querying and ignores an absent parameter", async () => {
    expect(await loadDeepLinkedStory(fakeSupabase({}) as never, "not-a-uuid", symbols)).toEqual({ status: "invalid" });
    expect(await loadDeepLinkedStory(fakeSupabase({}) as never, undefined, symbols)).toBeNull();
  });
});
