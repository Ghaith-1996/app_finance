import { describe, expect, it } from "vitest";

import { buildDailyDigestSnapshotForUser } from "@/lib/notifications/daily-digest";
import { getDailyDigestWindow } from "@/lib/notifications/timezone";
import { createMockServiceSupabase } from "@/tests/helpers/mock-service-supabase";

const DIGEST_NOW = new Date("2026-01-15T14:00:00.000Z");

function makeFeedStory(input: {
  id: string;
  headline: string;
  publishedAt: string;
  relevanceScore: number;
  url?: string | null;
  matchedSymbols?: string[];
  displayEffect?: "bullish" | "bearish" | "neutral";
  tickerImpacts?: Array<{ symbol: string; effect: "bullish" | "bearish" | "neutral" }>;
}) {
  return {
    id: `feed-${input.id}`,
    analysis_run_id: "run-1",
    portfolio_id: "portfolio-1",
    relevance_score: input.relevanceScore,
    ai_summary: `${input.headline} summary`,
    why_it_matters: `${input.headline} matters`,
    matched_stock_tags: input.matchedSymbols ?? ["AAPL"],
    holdings: input.matchedSymbols ?? ["AAPL"],
    match_sources: ["portfolio"],
    display_effect: input.displayEffect ?? "neutral",
    news_items: {
      id: `news-${input.id}`,
      headline: input.headline,
      source: "Wire",
      url: input.url ?? `https://example.com/${input.id}`,
      published_at: input.publishedAt,
      category: "technology",
      ticker_impacts: input.tickerImpacts ?? [],
    },
  };
}

describe("buildDailyDigestSnapshotForUser", () => {
  it("applies the 5 PM to 9 AM ET window inclusively", async () => {
    const { windowStart, windowEnd } = getDailyDigestWindow(DIGEST_NOW);
    const beforeStart = new Date(windowStart.getTime() - 60_000).toISOString();
    const afterEnd = new Date(windowEnd.getTime() + 60_000).toISOString();

    const supabase = createMockServiceSupabase({
      db: {
        portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Main" }],
        analysis_runs: [{ id: "run-1", portfolio_id: "portfolio-1", status: "complete", completed_at: DIGEST_NOW.toISOString() }],
        feed_items: [
          makeFeedStory({
            id: "start",
            headline: "Included at start",
            publishedAt: windowStart.toISOString(),
            relevanceScore: 80,
          }),
          makeFeedStory({
            id: "end",
            headline: "Included at end",
            publishedAt: windowEnd.toISOString(),
            relevanceScore: 79,
          }),
          makeFeedStory({
            id: "before",
            headline: "Excluded before window",
            publishedAt: beforeStart,
            relevanceScore: 99,
          }),
          makeFeedStory({
            id: "after",
            headline: "Excluded after window",
            publishedAt: afterEnd,
            relevanceScore: 77,
          }),
        ],
      },
    });

    const result = await buildDailyDigestSnapshotForUser({
      supabase: supabase as never,
      userId: "user-1",
      now: DIGEST_NOW,
    });

    expect(result.kind).toBe("ready");
    expect(result.digest?.digestDate).toBe("2026-01-15");
    expect(result.digest?.topStories.map((story) => story.headline)).toEqual([
      "Included at start",
      "Included at end",
    ]);
  });

  it("keeps only the top 10 stories ranked by relevance score and then publish time", async () => {
    const { windowStart } = getDailyDigestWindow(DIGEST_NOW);
    const stories = Array.from({ length: 12 }, (_, index) =>
      makeFeedStory({
        id: String(index + 1),
        headline: `Story ${index + 1}`,
        publishedAt: new Date(windowStart.getTime() + index * 60_000).toISOString(),
        relevanceScore: index < 2 ? 100 : 98 - index,
      }),
    );

    const supabase = createMockServiceSupabase({
      db: {
        portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Main" }],
        analysis_runs: [{ id: "run-1", portfolio_id: "portfolio-1", status: "complete", completed_at: DIGEST_NOW.toISOString() }],
        feed_items: stories,
      },
    });

    const result = await buildDailyDigestSnapshotForUser({
      supabase: supabase as never,
      userId: "user-1",
      now: DIGEST_NOW,
    });

    expect(result.kind).toBe("ready");
    expect(result.digest?.topStories).toHaveLength(10);
    expect(result.digest?.topStories[0].headline).toBe("Story 2");
    expect(result.digest?.topStories[1].headline).toBe("Story 1");
    expect(result.digest?.topStories.at(-1)?.headline).toBe("Story 10");
  });

  it("builds bullish and bearish leaders from ticker impacts with display-effect fallback", async () => {
    const { windowStart } = getDailyDigestWindow(DIGEST_NOW);
    const supabase = createMockServiceSupabase({
      db: {
        portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Main" }],
        analysis_runs: [{ id: "run-1", portfolio_id: "portfolio-1", status: "complete", completed_at: DIGEST_NOW.toISOString() }],
        feed_items: [
          makeFeedStory({
            id: "1",
            headline: "Apple lead",
            publishedAt: windowStart.toISOString(),
            relevanceScore: 95,
            matchedSymbols: ["AAPL"],
            displayEffect: "neutral",
            tickerImpacts: [{ symbol: "AAPL", effect: "bullish" }],
          }),
          makeFeedStory({
            id: "2",
            headline: "Apple follow-through",
            publishedAt: new Date(windowStart.getTime() + 60_000).toISOString(),
            relevanceScore: 94,
            matchedSymbols: ["AAPL"],
            displayEffect: "neutral",
            tickerImpacts: [{ symbol: "AAPL", effect: "bullish" }],
          }),
          makeFeedStory({
            id: "3",
            headline: "Tesla pressure",
            publishedAt: new Date(windowStart.getTime() + 120_000).toISOString(),
            relevanceScore: 93,
            matchedSymbols: ["TSLA"],
            displayEffect: "neutral",
            tickerImpacts: [{ symbol: "TSLA", effect: "bearish" }],
          }),
          makeFeedStory({
            id: "4",
            headline: "Microsoft fallback",
            publishedAt: new Date(windowStart.getTime() + 180_000).toISOString(),
            relevanceScore: 92,
            matchedSymbols: ["MSFT"],
            displayEffect: "bullish",
            tickerImpacts: [],
          }),
        ],
      },
    });

    const result = await buildDailyDigestSnapshotForUser({
      supabase: supabase as never,
      userId: "user-1",
      now: DIGEST_NOW,
    });

    expect(result.kind).toBe("ready");
    expect(result.digest?.bullishSymbols).toEqual(["AAPL", "MSFT"]);
    expect(result.digest?.bearishSymbols).toEqual(["TSLA"]);
    expect(result.digest?.summaryLine).toContain("Bullish leaders: AAPL, MSFT.");
    expect(result.digest?.summaryLine).toContain("Bearish leaders: TSLA.");
  });

  it("falls back to direct watchlist matching when the user has no portfolio", async () => {
    const { windowStart } = getDailyDigestWindow(DIGEST_NOW);
    const supabase = createMockServiceSupabase({
      db: {
        watchlist_items: [{ id: "watch-1", user_id: "user-1", symbol: "AAPL" }],
        news_items: [
          {
            id: "news-1",
            headline: "Apple overnight move",
            source: "Wire",
            url: "https://example.com/aapl",
            published_at: windowStart.toISOString(),
            category: "technology",
            stock_tags: ["AAPL"],
            ticker_impacts: [{ symbol: "AAPL", effect: "bullish" }],
            overall_effect: "bullish",
            global_summary: "Apple moved overnight",
          },
        ],
      },
    });

    const result = await buildDailyDigestSnapshotForUser({
      supabase: supabase as never,
      userId: "user-1",
      now: DIGEST_NOW,
    });

    expect(result.kind).toBe("ready");
    expect(result.digest?.sourceMode).toBe("watchlist");
    expect(result.digest?.topStories[0].matchSources).toEqual(["watchlist"]);
    expect(result.digest?.topStories[0].matchedSymbols).toEqual(["AAPL"]);
  });

  it("stores null when a matched story URL is unsafe", async () => {
    const { windowStart } = getDailyDigestWindow(DIGEST_NOW);
    const supabase = createMockServiceSupabase({
      db: {
        portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Main" }],
        analysis_runs: [{ id: "run-1", portfolio_id: "portfolio-1", status: "complete", completed_at: DIGEST_NOW.toISOString() }],
        feed_items: [
          makeFeedStory({
            id: "unsafe",
            headline: "Unsafe story",
            publishedAt: windowStart.toISOString(),
            relevanceScore: 90,
            url: "javascript:alert(1)",
          }),
        ],
      },
    });

    const result = await buildDailyDigestSnapshotForUser({
      supabase: supabase as never,
      userId: "user-1",
      now: DIGEST_NOW,
    });

    expect(result.kind).toBe("ready");
    expect(result.digest?.topStories[0].url).toBeNull();
  });

  it("returns an empty result when there are no overnight matches", async () => {
    const supabase = createMockServiceSupabase({
      db: {
        portfolios: [{ id: "portfolio-1", user_id: "user-1", name: "Main" }],
        analysis_runs: [{ id: "run-1", portfolio_id: "portfolio-1", status: "complete", completed_at: DIGEST_NOW.toISOString() }],
        feed_items: [],
      },
    });

    const result = await buildDailyDigestSnapshotForUser({
      supabase: supabase as never,
      userId: "user-1",
      now: DIGEST_NOW,
    });

    expect(result).toEqual({
      kind: "empty",
      reason: "No matched stories were found in the overnight window.",
    });
  });
});
