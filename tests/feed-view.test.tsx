import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel: vi.fn(),
  }),
}));

import type { LastIngestSnapshot } from "@/lib/ingest-hint";

let mockSnapshot: LastIngestSnapshot | null = null;

vi.mock("@/lib/ingest-hint", () => ({
  readLastIngestSnapshot: () => mockSnapshot,
  isRecentIngestHint: (hint: LastIngestSnapshot | null) =>
    !!hint && Date.now() - hint.at < 86400000,
  writeLastIngestSnapshot: vi.fn(),
  LAST_INGEST_STORAGE_KEY: "test",
}));

import { FeedView } from "@/components/app/feed-view";
import type { NewsItem } from "@/lib/types";

const makeFeedItem = (overrides: Partial<NewsItem> = {}): NewsItem => ({
  id: `item-${Math.random().toString(36).slice(2)}`,
  newsItemId: `news-${Math.random().toString(36).slice(2)}`,
  headline: "Test Headline",
  source: "Test Source",
  publishedAt: "5 minutes ago",
  publishedMinutesAgo: 5,
  category: "technology",
  stockTags: ["AAPL"],
  globalSummary: "Test summary",
  displayEffect: "bullish",
  tickerImpacts: [],
  sourceType: "newsapi",
  sourceConfidence: "standard",
  metadata: {},
  angle: "",
  ...overrides,
});

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

describe("FeedView", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSnapshot = null;
    setViewport(1440);
  });

  it("defaults to personal mode and fetches feed on mount", async () => {
    const items = [makeFeedItem({ id: "story-1", headline: "Personal Story" })];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feed: items, portfolioId: "p1", mode: "personal" }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("mode=personal"),
    );
  });

  it("switches to market mode and resets filters", async () => {
    const personalItems = [makeFeedItem({ id: "s1", headline: "Personal" })];
    const marketItems = [makeFeedItem({ id: "s2", headline: "Market" })];

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const isMarket = url.includes("mode=market");
      return {
        ok: true,
        json: async () => ({
          feed: isMarket ? marketItems : personalItems,
          portfolioId: "p1",
          mode: isMarket ? "market" : "personal",
        }),
      };
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /full market/i }));
    });

    const lastCallUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string;
    expect(lastCallUrl).toContain("mode=market");
  });

  it("builds personal holding options from the full portfolio, not just matched feed rows", async () => {
    const items = [
      makeFeedItem({
        id: "story-1",
        headline: "Amazon story",
        holdings: ["AMZN"],
        matchedStockTags: ["AMZN"],
      }),
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        feed: items,
        portfolioId: "p1",
        mode: "personal",
        portfolioSymbols: ["GOOG", "TSLA", "META", "NVDA", "AMZN", "MSFT"],
        portfolioSectors: ["Technology", "Consumer"],
      }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    const holdingSelect = screen.getByDisplayValue("All portfolio (6 holdings)");
    const optionLabels = Array.from((holdingSelect as HTMLSelectElement).options).map(
      (option) => option.text,
    );

    expect(optionLabels).toContain("GOOG");
    expect(optionLabels).toContain("TSLA");
    expect(optionLabels).toContain("META");
    expect(optionLabels).toContain("NVDA");
    expect(optionLabels).toContain("AMZN");
    expect(optionLabels).toContain("MSFT");
  });

  it("preserves selected story ID when refreshing with valid selection", async () => {
    const items = [
      makeFeedItem({ id: "story-1", headline: "First" }),
      makeFeedItem({ id: "story-2", headline: "Second" }),
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feed: items, portfolioId: "p1", mode: "personal" }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    expect(screen.getAllByText("First").length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'already ingested' hint when last ingest was all duplicates", async () => {
    mockSnapshot = {
      at: Date.now(),
      lookbackHours: 24,
      ingest: { status: "empty", detail: "5 fetched, all duplicates" },
      breakdown: {
        edgar: { fetched: 3, inserted: 0, skipped: 3, failed: 0, fetch_outcome: "ok" },
        newsapi: { fetched: 2, inserted: 0, skipped: 2, failed: 0, fetch_outcome: "ok" },
        total_inserted: 0,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feed: [], portfolioId: "p1", mode: "personal" }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    const hint = screen.getByTestId("ingest-hint-duplicates");
    expect(hint.textContent).toContain("already in the database");
    expect(hint.textContent).toContain("5 articles");
  });

  it("shows 'no articles returned' hint when both sources had empty_window", async () => {
    mockSnapshot = {
      at: Date.now(),
      lookbackHours: 24,
      ingest: { status: "empty", detail: "No articles returned" },
      breakdown: {
        edgar: { fetched: 0, inserted: 0, skipped: 0, failed: 0, fetch_outcome: "empty_window" },
        newsapi: { fetched: 0, inserted: 0, skipped: 0, failed: 0, fetch_outcome: "empty_window" },
        total_inserted: 0,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feed: [], portfolioId: "p1", mode: "personal" }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    expect(screen.getByTestId("ingest-hint-empty-window").textContent).toContain(
      "No articles were returned",
    );
  });

  it("shows failure messaging when source errors exist", async () => {
    mockSnapshot = {
      at: Date.now(),
      lookbackHours: 24,
      ingest: { status: "failed", detail: "Both sources failed" },
      breakdown: {
        edgar: {
          fetched: 0,
          inserted: 0,
          skipped: 0,
          failed: 0,
          fetch_outcome: "failed",
          fetch_error: "timeout",
        },
        newsapi: {
          fetched: 0,
          inserted: 0,
          skipped: 0,
          failed: 0,
          fetch_outcome: "failed",
          fetch_error: "503 error",
        },
        total_inserted: 0,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feed: [], portfolioId: "p1", mode: "personal" }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    expect(screen.getAllByText(/failed/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/both sources failed/i)).toBeTruthy();
  });

  it("market view does not render ticker filter controls", async () => {
    const items = [makeFeedItem({ id: "m1", headline: "Market Story", stockTags: ["AAPL", "GOOG"] })];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feed: items, portfolioId: "p1", mode: "market" }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /full market/i }));
    });

    expect(screen.queryByText("Tickers")).toBeNull();
    expect(screen.queryByText("All tickers")).toBeNull();
  });

  it("market view still filters by source and category", async () => {
    const items = [
      makeFeedItem({ id: "m1", headline: "EDGAR Story", sourceType: "edgar" }),
      makeFeedItem({ id: "m2", headline: "NewsAPI Story", sourceType: "newsapi" }),
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feed: items, portfolioId: "p1", mode: "market" }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /full market/i }));
    });

    expect(screen.getByText("Source")).toBeTruthy();
    expect(screen.getByText("Category")).toBeTruthy();
    expect(screen.getAllByText("Recency").length).toBeGreaterThan(0);
  });

  it("personal empty state mentions nothing qualified when recent ingest exists", async () => {
    mockSnapshot = {
      at: Date.now(),
      lookbackHours: 24,
      ingest: { status: "success", detail: "5 articles ingested" },
      breakdown: {
        edgar: { fetched: 2, inserted: 2, skipped: 0, failed: 0, fetch_outcome: "success" },
        newsapi: { fetched: 3, inserted: 3, skipped: 0, failed: 0, fetch_outcome: "success" },
        total_inserted: 5,
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feed: [], portfolioId: "p1", mode: "personal" }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    expect(
      screen.getByText(/nothing in the current 24-hour market pool qualified/i),
    ).toBeTruthy();
  });

  it("loads and sends article chat messages in the separate desktop sidebar", async () => {
    const story = makeFeedItem({
      id: "feed-1",
      newsItemId: "news-1",
      headline: "AI infrastructure spend accelerates",
    });

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/feed?")) {
        return {
          ok: true,
          json: async () => ({ feed: [story], portfolioId: "p1", mode: "personal" }),
        };
      }
      if (url.includes("/api/article-chat?")) {
        return {
          ok: true,
          json: async () => ({ threadId: "thread-1", messages: [] }),
        };
      }
      if (url === "/api/article-chat" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            threadId: "thread-1",
            messages: [
              {
                id: "m-user",
                role: "user",
                content: "What matters most here for my portfolio?",
                createdAt: new Date().toISOString(),
              },
              {
                id: "m-assistant",
                role: "assistant",
                content: "The article suggests sustained demand for semiconductor infrastructure.",
                createdAt: new Date().toISOString(),
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("AI infrastructure spend accelerates"));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ask ai about this story/i }));
    });

    const sidebar = await screen.findByTestId("story-chat-sidebar");
    expect(screen.queryByTestId("story-chat-sheet")).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/article-chat?portfolioId=p1&newsItemId=news-1"),
    );

    await act(async () => {
      fireEvent.change(within(sidebar).getByLabelText(/ask a follow-up/i), {
        target: { value: "What matters most here for my portfolio?" },
      });
    });

    await act(async () => {
      fireEvent.click(within(sidebar).getByRole("button", { name: /^send$/i }));
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/article-chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"newsItemId\":\"news-1\""),
      }),
    );
    expect(
      await within(sidebar).findByText(/sustained demand for semiconductor infrastructure/i),
    ).toBeTruthy();
  });

  it("switches stories immediately when chat is open but inactive", async () => {
    const stories = [
      makeFeedItem({ id: "feed-1", newsItemId: "news-1", headline: "First story" }),
      makeFeedItem({ id: "feed-2", newsItemId: "news-2", headline: "Second story" }),
    ];
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("/api/feed?")) {
        return {
          ok: true,
          json: async () => ({ feed: stories, portfolioId: "p1", mode: "personal" }),
        };
      }
      if (url.includes("/api/article-chat?")) {
        return {
          ok: true,
          json: async () => ({ threadId: "thread-1", messages: [] }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("First story"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ask ai about this story/i }));
    });

    await screen.findByTestId("story-chat-sidebar");

    await act(async () => {
      fireEvent.click(screen.getByText("Second story"));
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /switch story chat/i })).toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/article-chat?portfolioId=p1&newsItemId=news-2"),
    );
    expect(screen.getByTestId("story-chat-sidebar").textContent).toContain("Second story");
  });

  it("shows a confirmation modal before switching active story chats", async () => {
    const stories = [
      makeFeedItem({ id: "feed-1", newsItemId: "news-1", headline: "First story" }),
      makeFeedItem({ id: "feed-2", newsItemId: "news-2", headline: "Second story" }),
    ];
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("/api/feed?")) {
        return {
          ok: true,
          json: async () => ({ feed: stories, portfolioId: "p1", mode: "personal" }),
        };
      }
      if (url.includes("/api/article-chat?")) {
        return {
          ok: true,
          json: async () => ({ threadId: "thread-1", messages: [] }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("First story"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ask ai about this story/i }));
    });

    const sidebar = await screen.findByTestId("story-chat-sidebar");

    await act(async () => {
      fireEvent.change(within(sidebar).getByLabelText(/ask a follow-up/i), {
        target: { value: "Tell me the risk here" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Second story"));
    });

    expect(screen.getByRole("dialog", { name: /switch story chat/i })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /switch story/i }));
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /switch story chat/i })).toBeNull();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/article-chat?portfolioId=p1&newsItemId=news-2"),
    );
    expect(screen.getByTestId("story-chat-sidebar").textContent).toContain("Second story");
  });

  it("keeps the current story when the switch confirmation is canceled", async () => {
    const stories = [
      makeFeedItem({ id: "feed-1", newsItemId: "news-1", headline: "First story" }),
      makeFeedItem({ id: "feed-2", newsItemId: "news-2", headline: "Second story" }),
    ];
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("/api/feed?")) {
        return {
          ok: true,
          json: async () => ({ feed: stories, portfolioId: "p1", mode: "personal" }),
        };
      }
      if (url.includes("/api/article-chat?")) {
        return {
          ok: true,
          json: async () => ({ threadId: "thread-1", messages: [] }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("First story"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ask ai about this story/i }));
    });

    const sidebar = await screen.findByTestId("story-chat-sidebar");

    await act(async () => {
      fireEvent.change(within(sidebar).getByLabelText(/ask a follow-up/i), {
        target: { value: "Hold this draft" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Second story"));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stay here/i }));
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /switch story chat/i })).toBeNull();
    });

    const articleChatCalls = fetchMock.mock.calls
      .map(([url]) => url as string)
      .filter((url) => url.includes("/api/article-chat?"));

    expect(articleChatCalls.some((url) => url.includes("newsItemId=news-2"))).toBe(false);
    expect(screen.getByTestId("story-chat-sidebar").textContent).toContain("First story");
  });

  it("opens story chat in a mobile sheet below the xl breakpoint", async () => {
    setViewport(900);

    const story = makeFeedItem({
      id: "feed-1",
      newsItemId: "news-1",
      headline: "Mobile story",
    });

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.startsWith("/api/feed?")) {
        return {
          ok: true,
          json: async () => ({ feed: [story], portfolioId: "p1", mode: "personal" }),
        };
      }
      if (url.includes("/api/article-chat?")) {
        return {
          ok: true,
          json: async () => ({ threadId: "thread-1", messages: [] }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Mobile story"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /ask ai about this story/i }));
    });

    expect(await screen.findByTestId("story-chat-sheet")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /story chat/i })).toBeTruthy();
  });
});
