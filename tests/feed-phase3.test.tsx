import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/security/turnstile-widget", () => ({
  TurnstileWidget: () => null,
  TurnstileBlock: () => null,
  useTurnstile: () => ({ status: "verified", token: "t", canSubmit: true, statusMessage: null, reset: () => undefined, widgetRef: { current: null }, widgetProps: {} }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => undefined,
  }),
}));
vi.mock("@/lib/actions/saved-articles", () => ({
  getSavedArticleState: async () => false,
  setSavedArticleState: async () => ({ ok: true, saved: false }),
}));

import { NewsFeedCard } from "@/components/app/news-feed-card";
import { FEED_PAGE_SIZE, storyHref } from "@/lib/feed/constants";
import { DEFAULT_FEED_PAGE_SIZE, parseFeedPageSize } from "@/lib/server/feed";
import { calculatePortfolioHealth } from "@/lib/services/portfolio-health";
import type { NewsItem } from "@/lib/types";

// Audit F06 (exact story links), F07 (one page-size contract), F09 (full tickers).

const story = (overrides: Partial<NewsItem> = {}): NewsItem => ({
  id: "feed-1",
  newsItemId: "news-1",
  headline: "Big tech earnings",
  source: "Wire",
  publishedAt: "5 minutes ago",
  publishedMinutesAgo: 5,
  category: "technology",
  stockTags: ["AMZN", "GOOG", "MSFT", "NVDA", "AAPL", "TSLA"],
  globalSummary: "Summary",
  displayEffect: "bullish",
  tickerImpacts: [],
  sourceType: "newsapi",
  sourceConfidence: "standard",
  metadata: {},
  angle: "",
  ...overrides,
});

describe("F09 ticker identity", () => {
  it("renders every affected symbol in full", () => {
    render(<NewsFeedCard story={story()} mode="market" onOpen={() => undefined} />);
    const list = screen.getByRole("list", { name: "Affected holdings" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "AMZN",
      "GOOG",
      "MSFT",
      "NVDA",
      "AAPL",
      "TSLA",
    ]);
  });
});

describe("F07 page-size contract", () => {
  it("server default and client requests use the same page size", () => {
    expect(DEFAULT_FEED_PAGE_SIZE).toBe(FEED_PAGE_SIZE);
    expect(parseFeedPageSize(null)).toBe(FEED_PAGE_SIZE);
  });
});

describe("F06 story shortcuts", () => {
  it("links to the exact story and falls back to the feed", () => {
    expect(storyHref("news-1")).toBe("/feed?story=news-1");
    expect(storyHref("a b")).toBe("/feed?story=a%20b");
    expect(storyHref(undefined)).toBe("/feed");
  });
});

describe("F06 opportunities", () => {
  it("each story opportunity opens its own article", () => {
    const result = calculatePortfolioHealth({
      holdings: [
        {
          id: "h1", symbol: "AAPL", company: "Apple", sector: "Technology", market: "US", source: "Manual",
          price: 100, dailyChange: 0, allocation: 100, thesis: "", quantity: 1, averageCost: 90, costBasis: 90,
          currentPrice: 100, currentValue: 100, unrealizedGainAmount: 10, unrealizedGainPercent: 11,
          quoteCurrency: "USD", quoteAsOf: null, importSource: "manual",
          latestEarningsReportUrl: null, latestEarningsReportSource: null, latestEarningsReportDate: null,
        },
      ],
      feedHighlights: [
        {
          newsItemId: "news-42", headline: "Apple launches product", source: "Wire", publishedAt: "2026-10-01T12:00:00Z",
          category: "technology", relevanceScore: 90, whyItMatters: "New product line.", holdings: ["AAPL"],
          sectors: ["Technology"], aiSummary: "Launch.",
        },
      ],
      now: new Date("2026-10-01T13:00:00Z"),
    });
    expect(result.opportunities.map((item) => item.href)).toContain("/feed?story=news-42");
  });
});

describe("F08 filtered-empty vs source-empty", () => {
  it("a personal-feed filter with zero matches keeps the filter state and offers reset", async () => {
    const { act, fireEvent } = await import("@testing-library/react");
    const { FeedView } = await import("@/components/app/feed-view");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("/api/feed?")) {
        const filtered = url.includes("maxMinutes=60");
        return {
          ok: true,
          json: async () => ({
            feed: filtered ? [] : [story({ id: "feed-1", headline: "Older story", publishedMinutesAgo: 300 })],
            portfolioId: "p1",
            mode: "personal",
            totalCount: filtered ? 0 : 1,
            page: 1,
            pageSize: 100,
          }),
        };
      }
      return { ok: true, json: async () => ({ ok: true }) };
    }) as never;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });
    await act(async () => {
      fireEvent.change(screen.getByRole("combobox", { name: /recency/i }), { target: { value: "Past hour" } });
    });

    expect(await screen.findByText("No stories match these filters")).toBeTruthy();
    expect(screen.queryByText(/Your personal feed is empty/)).toBeNull();
    expect(screen.getAllByRole("button", { name: /reset filters/i }).length).toBeGreaterThan(0);
  });
});
