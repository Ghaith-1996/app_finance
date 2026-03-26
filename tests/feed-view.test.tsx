import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within, waitFor } from "@testing-library/react";
import React from "react";

const supabaseMockState = vi.hoisted(() => ({
  feedInsertCallback: null as null | (() => void),
  removeChannel: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: (
        _event: string,
        _filter: unknown,
        callback: () => void,
      ) => {
        supabaseMockState.feedInsertCallback = callback;
        return { subscribe: () => ({}) };
      },
    }),
    removeChannel: supabaseMockState.removeChannel,
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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
    supabaseMockState.feedInsertCallback = null;
    supabaseMockState.removeChannel.mockReset();
    mockSnapshot = null;
    setViewport(1440);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("shows the blocking loading state only before the first feed response", async () => {
    const deferred = createDeferred<{
      ok: boolean;
      json: () => Promise<{ feed: NewsItem[]; portfolioId: string; mode: string }>;
    }>();
    global.fetch = vi.fn().mockReturnValue(deferred.promise);

    render(<FeedView portfolioId="p1" />);

    expect(screen.getByText(/loading feed/i)).toBeTruthy();

    await act(async () => {
      deferred.resolve({
        ok: true,
        json: async () => ({
          feed: [makeFeedItem({ id: "story-1", headline: "Loaded story" })],
          portfolioId: "p1",
          mode: "personal",
        }),
      });
      await deferred.promise;
    });

    expect(await screen.findByText("Loaded story")).toBeTruthy();
    expect(screen.queryByText(/loading feed/i)).toBeNull();
  });

  it("keeps the current story and chat visible during a silent realtime refresh", async () => {
    vi.useFakeTimers();

    const refreshDeferred = createDeferred<{
      ok: boolean;
      json: () => Promise<{ feed: NewsItem[]; portfolioId: string; mode: string }>;
    }>();
    const story = makeFeedItem({
      id: "feed-1",
      newsItemId: "news-1",
      headline: "Persistent story",
    });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/feed?")) {
        if (fetchMock.mock.calls.filter(([calledUrl]) => (calledUrl as string).startsWith("/api/feed?")).length === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ feed: [story], portfolioId: "p1", mode: "personal" }),
          });
        }
        return refreshDeferred.promise;
      }
      if (url.includes("/api/article-chat?")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ threadId: "thread-1", messages: [] }),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Persistent story"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("global-ask-ai-button"));
    });

    expect(screen.getByTestId("story-chat-sidebar")).toBeTruthy();
    expect(screen.getAllByText("Persistent story").length).toBeGreaterThan(0);

    await act(async () => {
      supabaseMockState.feedInsertCallback?.();
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);

    expect(screen.queryByText(/loading feed/i)).toBeNull();
    expect(screen.getAllByText("Persistent story").length).toBeGreaterThan(0);
    expect(screen.getByTestId("story-chat-sidebar")).toBeTruthy();
    expect(screen.getByText(/updating/i)).toBeTruthy();

    await act(async () => {
      refreshDeferred.resolve({
        ok: true,
        json: async () => ({ feed: [story], portfolioId: "p1", mode: "personal" }),
      });
      await refreshDeferred.promise;
    });

    expect(screen.queryByText(/updating/i)).toBeNull();
  });

  it("coalesces burst realtime inserts into one background refresh", async () => {
    vi.useFakeTimers();

    const story = makeFeedItem({ id: "feed-1", headline: "Burst story" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feed: [story], portfolioId: "p1", mode: "personal" }),
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      supabaseMockState.feedInsertCallback?.();
      supabaseMockState.feedInsertCallback?.();
      supabaseMockState.feedInsertCallback?.();
      await vi.advanceTimersByTimeAsync(799);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the existing feed visible when a silent realtime refresh fails", async () => {
    vi.useFakeTimers();

    const story = makeFeedItem({ id: "feed-1", headline: "Stable story" });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/feed?")) {
        if (fetchMock.mock.calls.filter(([calledUrl]) => (calledUrl as string).startsWith("/api/feed?")).length === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ feed: [story], portfolioId: "p1", mode: "personal" }),
          });
        }
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: "Background refresh failed" }),
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    expect(screen.getAllByText("Stable story").length).toBeGreaterThan(0);

    await act(async () => {
      supabaseMockState.feedInsertCallback?.();
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(screen.queryByText(/loading feed/i)).toBeNull();
    expect(screen.getAllByText("Stable story").length).toBeGreaterThan(0);
    expect(screen.getByText(/update paused: background refresh failed/i)).toBeTruthy();
    expect(screen.queryByText(/^error$/i)).toBeNull();
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

  it("market view renders ticker filter controls", async () => {
    const items = [makeFeedItem({ id: "m1", headline: "Market Story", stockTags: ["AAPL", "GOOG"] })];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        feed: items,
        portfolioId: "p1",
        mode: "market",
        page: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1,
      }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /full market/i }));
    });

    expect(screen.getByText("Ticker")).toBeTruthy();
    expect(screen.getByPlaceholderText(/e\.g\. nvda/i)).toBeTruthy();
  });

  it("market view still filters by source and category", async () => {
    const items = [
      makeFeedItem({ id: "m1", headline: "EDGAR Story", sourceType: "edgar" }),
      makeFeedItem({ id: "m2", headline: "NewsAPI Story", sourceType: "newsapi" }),
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        feed: items,
        portfolioId: "p1",
        mode: "market",
        page: 1,
        pageSize: 50,
        totalCount: items.length,
        totalPages: 1,
      }),
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
    expect(screen.getByText("Ticker")).toBeTruthy();
  });

  it("market ticker search sends the ticker param to the backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        feed: [makeFeedItem({ id: "m1", headline: "NVDA Story" })],
        portfolioId: "p1",
        mode: "market",
        page: 1,
        pageSize: 50,
        totalCount: 1,
        totalPages: 1,
      }),
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /full market/i }));
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/e\.g\. nvda/i), {
        target: { value: "nvda" },
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      fireEvent.keyDown(screen.getByPlaceholderText(/e\.g\. nvda/i), {
        key: "Enter",
        code: "Enter",
      });
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("mode=market"),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("ticker=NVDA"),
      );
    });
  });

  it("market pagination requests the next and previous backend pages", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const params = new URL(`http://localhost${url}`).searchParams;
      const requestedPage = Number(params.get("page") ?? "1");
      return {
        ok: true,
        json: async () => ({
          feed: [makeFeedItem({ id: `m${requestedPage}`, headline: `Market page ${requestedPage}` })],
          portfolioId: "p1",
          mode: "market",
          page: requestedPage,
          pageSize: 50,
          totalCount: 120,
          totalPages: 3,
        }),
      };
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /full market/i }));
    });

    await screen.findByText(/page 1 of 3/i);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /next/i }));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("pageSize=50"),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("page=1"),
      );
    });
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

  it("renders the fixed Ask AI button even before a story is selected", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ feed: [makeFeedItem({ id: "story-1", headline: "Personal Story" })], portfolioId: "p1", mode: "personal" }),
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    expect(screen.getByTestId("global-ask-ai-button")).toBeTruthy();
    expect(screen.getByText(/open a portfolio or market-wide conversation/i)).toBeTruthy();
  });

  it("opens generic Ask AI chat when no story is selected", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/feed?")) {
        return {
          ok: true,
          json: async () => ({
            feed: [makeFeedItem({ id: "feed-1", headline: "Unselected story", newsItemId: "news-1" })],
            portfolioId: "p1",
            mode: "personal",
          }),
        };
      }
      if (url === "/api/article-chat" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            threadId: null,
            messages: [
              {
                id: "m-user",
                role: "user",
                content: "How should I think about my portfolio today?",
                createdAt: new Date().toISOString(),
              },
              {
                id: "m-assistant",
                role: "assistant",
                content: "Start by reviewing your highest-conviction positions and market risk.",
                createdAt: new Date().toISOString(),
              },
            ],
          }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("global-ask-ai-button"));
    });

    const sidebar = await screen.findByTestId("story-chat-sidebar");
    expect(sidebar.textContent).toContain("No active article");
    expect(sidebar.textContent).toContain("Portfolio / market chat");

    const articleChatGets = fetchMock.mock.calls
      .map(([url]) => url as string)
      .filter((url) => url.includes("/api/article-chat?"));
    expect(articleChatGets).toHaveLength(0);

    await act(async () => {
      fireEvent.change(within(sidebar).getByLabelText(/ask about the market or your portfolio/i), {
        target: { value: "How should I think about my portfolio today?" },
      });
    });

    await act(async () => {
      fireEvent.click(within(sidebar).getByRole("button", { name: /^send$/i }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/article-chat",
      expect.objectContaining({
        method: "POST",
        body: expect.not.stringContaining("newsItemId"),
      }),
    );
    expect(await within(sidebar).findByText(/highest-conviction positions/i)).toBeTruthy();
  });

  it("uses the fixed Ask AI button to open the selected story context", async () => {
    const story = makeFeedItem({ id: "feed-1", newsItemId: "news-1", headline: "Fixed button story" });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
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
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Fixed button story"));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("global-ask-ai-button"));
    });

    await screen.findByTestId("story-chat-sidebar");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/article-chat?portfolioId=p1&newsItemId=news-1"),
    );
  });

  it("moves the open chat between desktop and mobile shells when the viewport crosses the breakpoint", async () => {
    const story = makeFeedItem({ id: "feed-1", newsItemId: "news-1", headline: "Responsive story" });
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
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
    global.fetch = fetchMock;

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Responsive story"));
      fireEvent.click(screen.getByTestId("global-ask-ai-button"));
    });

    expect(await screen.findByTestId("story-chat-sidebar")).toBeTruthy();

    await act(async () => {
      setViewport(900);
    });

    expect(await screen.findByTestId("story-chat-sheet")).toBeTruthy();
    expect(screen.queryByTestId("story-chat-sidebar")).toBeNull();
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
    expect(within(sidebar).getByRole("button", { name: /^free$/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(sidebar).getByRole("button", { name: /^premium$/i })).toHaveAttribute("aria-pressed", "false");

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
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/article-chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"modelTier\":\"free\""),
      }),
    );
    expect(
      await within(sidebar).findByText(/sustained demand for semiconductor infrastructure/i),
    ).toBeTruthy();
  });

  it("keeps the selected chat tier when switching stories in the same page session", async () => {
    const stories = [
      makeFeedItem({ id: "feed-1", newsItemId: "news-1", headline: "First story" }),
      makeFeedItem({ id: "feed-2", newsItemId: "news-2", headline: "Second story" }),
    ];
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
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
      if (url === "/api/article-chat" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            threadId: "thread-1",
            messages: [
              {
                id: "m-user",
                role: "user",
                content: "What should I watch next?",
                createdAt: new Date().toISOString(),
              },
              {
                id: "m-assistant",
                role: "assistant",
                content: "Keep watching execution risk.",
                createdAt: new Date().toISOString(),
              },
            ],
          }),
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
      fireEvent.click(within(sidebar).getByRole("button", { name: /^premium$/i }));
    });

    expect(within(sidebar).getByRole("button", { name: /^premium$/i })).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      fireEvent.click(screen.getByText("Second story"));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/article-chat?portfolioId=p1&newsItemId=news-2"),
      );
    });

    const updatedSidebar = screen.getByTestId("story-chat-sidebar");
    expect(within(updatedSidebar).getByRole("button", { name: /^premium$/i })).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      fireEvent.change(within(updatedSidebar).getByLabelText(/ask a follow-up/i), {
        target: { value: "What should I watch next?" },
      });
    });

    await act(async () => {
      fireEvent.click(within(updatedSidebar).getByRole("button", { name: /^send$/i }));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/article-chat",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"modelTier\":\"premium\""),
      }),
    );
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

    const sheet = await screen.findByTestId("story-chat-sheet");
    expect(sheet).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /ask ai chat/i })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: /^free$/i })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByRole("button", { name: /^premium$/i })).toHaveAttribute("aria-pressed", "false");
  });
});
