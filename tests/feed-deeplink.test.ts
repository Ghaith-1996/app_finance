import { describe, expect, it } from "vitest";

import { loadDeepLinkedStory } from "@/lib/server/feed";

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

const oldSecFiling = {
  id: OLD_NEWS_ID,
  headline: "SEC filing from August",
  source: "SEC",
  url: "https://www.sec.gov/filing",
  published_at: "2026-08-25T12:00:00.000Z",
  angle: null,
  category: "filings",
  stock_tags: ["AAPL"],
  global_summary: "Summary",
  overall_effect: "neutral",
  ticker_impacts: [],
  source_type: "edgar",
  metadata: {},
  raw_content: null,
  detail_open_count: 0,
};

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
