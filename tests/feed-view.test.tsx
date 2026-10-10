import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

const supabaseMockState = vi.hoisted(() => ({
  feedInsertCallback: null as null | (() => void),
  removeChannel: vi.fn(),
}));

vi.mock("@/components/security/turnstile-widget", () => ({
  TurnstileWidget: () => null,
  TurnstileBlock: () => null,
  useTurnstile: () => ({
    status: "verified",
    token: "test-token",
    canSubmit: true,
    statusMessage: null,
    reset: vi.fn(),
    widgetRef: { current: null },
    widgetProps: {
      onSuccess: vi.fn(),
      onExpire: vi.fn(),
      onError: vi.fn(),
      onReady: vi.fn(),
    },
  }),
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

vi.mock("@/lib/actions/saved-articles", () => ({
  getSavedArticleState: vi.fn(async () => false),
  setSavedArticleState: vi.fn(async (_newsItemId: string, saved: boolean) => ({
    ok: true,
    saved,
  })),
}));

import { FeedView } from "@/components/app/feed-view";
import type { FeedSort, NewsItem } from "@/lib/types";
import { NewsFeedCard } from "@/components/app/news-feed-card";
import { FEED_PAGE_SIZE, storyHref } from "@/lib/feed/constants";
import { parseFeedPageSize } from "@/lib/server/feed";
import { calculatePortfolioHealth } from "@/lib/services/portfolio-health";
import type { FeedResponsePayload } from "@/lib/server/feed";

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

const makeFeedPayload = (
  feed: NewsItem[],
  overrides: Partial<FeedResponsePayload> = {},
): FeedResponsePayload => ({
  feed,
  portfolioId: "p1",
  mode: "personal",
  appliedSort: "match",
  sortNotice: null,
  portfolioSymbols: ["AAPL"],
  portfolioSectors: ["Technology"],
  watchlistSymbols: [],
  page: 1,
  pageSize: 50,
  totalCount: feed.length,
  totalPages: 1,
  ...overrides,
});

function jsonResponse<T>(body: T, ok = true) {
  return { ok, json: async () => body };
}

function feedResponse(feed: NewsItem[], overrides: Partial<FeedResponsePayload> = {}) {
  return jsonResponse({ feed, portfolioId: "p1", mode: "personal", ...overrides });
}

type FetchHandler = (url: string, init?: RequestInit) =>
  ReturnType<typeof jsonResponse> | Promise<ReturnType<typeof jsonResponse>> | undefined;

function mockFeed(stories: NewsItem[], handler?: FetchHandler) {
  const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const response = handler?.(url, init);
    if (response !== undefined) return response;
    if (url.startsWith("/api/feed?")) return feedResponse(stories);
    if (url.includes("/api/article-chat?")) return jsonResponse({ threadId: "thread-1", messages: [] });
    if (url === "/api/feed/open") return jsonResponse({ ok: true });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function chatResponse(question: string, answer: string, threadId: string | null = "thread-1") {
  return jsonResponse({
    threadId,
    messages: [
      { id: "m-user", role: "user", content: question, createdAt: new Date().toISOString() },
      { id: "m-assistant", role: "assistant", content: answer, createdAt: new Date().toISOString() },
    ],
  });
}

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
    setViewport(1440);
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([375, 768, 1024, 1279, 1280, 1440])(
    "hydrates server markup without replacing the feed at %i px",
    async (width) => {
      const view = <FeedView portfolioId="p1" initialFeedPayload={makeFeedPayload([])} />;
      const container = document.createElement("div");
      document.body.append(container);
      // Server rendering has no viewport; the browser must start with the same markup.
      vi.stubGlobal("window", undefined);
      try {
        container.innerHTML = renderToString(view);
      } finally {
        vi.unstubAllGlobals();
      }
      setViewport(width);
      const serverRail = container.querySelector('[data-testid="global-ask-ai-button"]');
      const onRecoverableError = vi.fn();
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      let root: ReturnType<typeof hydrateRoot> | undefined;
      try {
        await act(async () => {
          root = hydrateRoot(container, view, { onRecoverableError });
        });
        expect(onRecoverableError).not.toHaveBeenCalled();
        expect(consoleError).not.toHaveBeenCalled();
        const controls = within(container);
        if (width < 1280) {
          expect(controls.getByTestId("floating-ask-ai-button")).toBeInTheDocument();
          expect(controls.queryByTestId("global-ask-ai-button")).toBeNull();
        } else {
          expect(controls.getByTestId("global-ask-ai-button")).toBe(serverRail);
          expect(controls.queryByTestId("floating-ask-ai-button")).toBeNull();
        }
      } finally {
        await act(async () => root?.unmount());
        container.remove();
        consoleError.mockRestore();
      }
    },
  );

  it("uses the initial feed payload without fetching on mount", async () => {
    const items = [makeFeedItem({ id: "story-1", headline: "Hydrated story" })];
    vi.stubGlobal("fetch", vi.fn());

    const initialFeedPayload = makeFeedPayload(items, {
      watchlistSymbols: ["TSLA"],
    });

    await act(async () => {
      render(<FeedView portfolioId="p1" initialFeedPayload={initialFeedPayload} />);
    });

    expect(screen.getByText("Hydrated story")).toBeTruthy();
    expect(screen.queryByText(/loading feed/i)).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("selects a story from the initial deep-link story id", async () => {
    const targetStory = makeFeedItem({
      id: "feed-row-1",
      newsItemId: "news-1",
      headline: "Deep linked story",
    });
    const initialFeedPayload = makeFeedPayload([
      makeFeedItem({ id: "feed-row-0", newsItemId: "news-0", headline: "Other story" }),
      targetStory,
    ]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true })));

    await act(async () => {
      render(
        <FeedView
          portfolioId="p1"
          initialStoryId="news-1"
          initialFeedPayload={initialFeedPayload}
        />,
      );
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/feed/open",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ newsItemId: "news-1" }),
        }),
      );
    });
    expect(screen.getByText("Article detail")).toBeTruthy();
    expect(screen.getAllByText("Deep linked story").length).toBeGreaterThan(1);
  });

  it("fetches once after hydration when initialSymbol selects a specific holding", async () => {
    const initialFeedPayload = makeFeedPayload(
      [makeFeedItem({ id: "story-1", headline: "Hydrated story", holdings: ["AAPL"] })],
      {
        portfolioSymbols: ["AAPL", "MSFT"],
      },
    );

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(feedResponse([makeFeedItem({ id: "story-2", headline: "Microsoft story", holdings: ["MSFT"] })], {
      portfolioSymbols: ["AAPL", "MSFT"],
      portfolioSectors: ["Technology"],
      watchlistSymbols: [],
      page: 1,
      pageSize: 50,
      totalCount: 1,
      totalPages: 1,
    })));

    await act(async () => {
      render(
        <FeedView
          portfolioId="p1"
          initialSymbol="MSFT"
          initialFeedPayload={initialFeedPayload}
        />,
      );
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("holding=MSFT"),
        { signal: expect.any(AbortSignal) },
      );
    });
  });

  it("falls back from hot to recent and shows the no-hot notice", async () => {
    const initialFeedPayload = makeFeedPayload([
      makeFeedItem({ id: "story-1", headline: "Hydrated story" }),
    ]);

    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: string) => {
      if (input.startsWith("/api/feed?")) {
        return Promise.resolve(jsonResponse(makeFeedPayload(
          [makeFeedItem({ id: "story-1", headline: "Hydrated story" })],
          {
            appliedSort: "recent",
            sortNotice: "No hot news yet. Showing most recent instead.",
          },
        )));
      }

      return Promise.resolve(jsonResponse({ ok: true }));
    }));

    await act(async () => {
      render(<FeedView portfolioId="p1" initialFeedPayload={initialFeedPayload} />);
    });

    fireEvent.change(screen.getByLabelText(/sort/i), {
      target: { value: "hot" as FeedSort },
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("sort=hot"),
        { signal: expect.any(AbortSignal) },
      );
    });

    expect(await screen.findByText("No hot news yet. Showing most recent instead.")).toBeTruthy();
    expect((screen.getByLabelText(/sort/i) as HTMLSelectElement).value).toBe("recent");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("tracks story opens only when the selected story changes", async () => {
    const initialFeedPayload = makeFeedPayload([
      makeFeedItem({ id: "story-1", newsItemId: "news-1", headline: "First story" }),
      makeFeedItem({ id: "story-2", newsItemId: "news-2", headline: "Second story" }),
    ]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ok: true })));

    await act(async () => {
      render(<FeedView portfolioId="p1" initialFeedPayload={initialFeedPayload} />);
    });

    fireEvent.click(screen.getAllByText("First story")[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/feed/open",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ newsItemId: "news-1" }),
        }),
      );
    });

    fireEvent.click(screen.getAllByText("First story")[0]);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Second story"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it("shows the blocking loading state only before the first feed response", async () => {
    const deferred = createDeferred<ReturnType<typeof feedResponse>>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(deferred.promise));

    render(<FeedView portfolioId="p1" />);

    expect(screen.getByText(/loading feed/i)).toBeTruthy();

    await act(async () => {
      deferred.resolve(feedResponse([makeFeedItem({ id: "story-1", headline: "Loaded story" })]));
      await deferred.promise;
    });

    expect(await screen.findByText("Loaded story")).toBeTruthy();
    expect(screen.queryByText(/loading feed/i)).toBeNull();
  });

  it("keeps the current story and chat visible during a silent realtime refresh", async () => {
    vi.useFakeTimers();

    const refreshDeferred = createDeferred<ReturnType<typeof feedResponse>>();
    const story = makeFeedItem({
      id: "feed-1",
      newsItemId: "news-1",
      headline: "Persistent story",
    });
    const fetchMock = mockFeed([story], (url) => {
      if (url.startsWith("/api/feed?") && fetchMock.mock.calls.filter(([calledUrl]) =>
        typeof calledUrl === "string" && calledUrl.startsWith("/api/feed?")
      ).length > 1) return refreshDeferred.promise;
      if (url === "/api/feed/open") return jsonResponse({ ok: true, detailOpenCount: 1 });
    });

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

    expect(fetchMock).toHaveBeenCalledTimes(4);

    expect(screen.queryByText(/loading feed/i)).toBeNull();
    expect(screen.getAllByText("Persistent story").length).toBeGreaterThan(0);
    expect(screen.getByTestId("story-chat-sidebar")).toBeTruthy();
    expect(screen.getByText(/updating/i)).toBeTruthy();

    await act(async () => {
      refreshDeferred.resolve(feedResponse([story]));
      await refreshDeferred.promise;
    });

    expect(screen.queryByText(/updating/i)).toBeNull();
  });

  it("coalesces burst realtime inserts into one background refresh", async () => {
    vi.useFakeTimers();

    const story = makeFeedItem({ id: "feed-1", headline: "Burst story" });
    const fetchMock = vi.fn().mockResolvedValue(feedResponse([story]));
    vi.stubGlobal("fetch", fetchMock);

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
    const fetchMock = mockFeed([story], (url) => {
      if (url.startsWith("/api/feed?") && fetchMock.mock.calls.filter(([calledUrl]) =>
        typeof calledUrl === "string" && calledUrl.startsWith("/api/feed?")
      ).length > 1) return jsonResponse({ error: "Background refresh failed" }, false);
    });

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

  it("builds personal holding options from the full portfolio, not just matched feed rows", async () => {
    const items = [
      makeFeedItem({
        id: "story-1",
        headline: "Amazon story",
        holdings: ["AMZN"],
        matchedStockTags: ["AMZN"],
      }),
    ];

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(feedResponse(items, {
      portfolioSymbols: ["GOOG", "TSLA", "META", "NVDA", "AMZN", "MSFT"],
      portfolioSectors: ["Technology", "Consumer"],
    })));

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

  it("market ticker search sends the ticker param to the backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(feedResponse([makeFeedItem({ id: "m1", headline: "NVDA Story" })], {
      mode: "market",
      page: 1,
      pageSize: 50,
      totalCount: 1,
      totalPages: 1,
    }));
    vi.stubGlobal("fetch", fetchMock);

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
        { signal: expect.any(AbortSignal) },
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("ticker=NVDA"),
        { signal: expect.any(AbortSignal) },
      );
    });
  });

  it("market pagination requests the next and previous backend pages", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const params = new URL(`http://localhost${url}`).searchParams;
      const requestedPage = Number(params.get("page") ?? "1");
      return feedResponse([makeFeedItem({ id: `m${requestedPage}`, headline: `Market page ${requestedPage}` })], {
        mode: "market",
        page: requestedPage,
        pageSize: 50,
        totalCount: 120,
        totalPages: 3,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

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

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        { signal: expect.any(AbortSignal) },
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("pageSize=50"),
        { signal: expect.any(AbortSignal) },
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    });

    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "smooth",
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("page=1"),
        { signal: expect.any(AbortSignal) },
      );
    });
  });

  it("does not render an external story link when the URL uses a dangerous scheme", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(feedResponse([
      makeFeedItem({
        id: "story-unsafe",
        headline: "Unsafe story",
        url: "javascript:alert(1)",
      }),
    ])));

    await act(async () => {
      render(<FeedView portfolioId="p1" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Unsafe story"));
    });

    expect(screen.queryByRole("link", { name: /open full story/i })).toBeNull();
  });

  it("opens generic Ask AI chat when no story is selected", async () => {
    const fetchMock = mockFeed([
      makeFeedItem({ id: "feed-1", headline: "Unselected story", newsItemId: "news-1" }),
    ], (url, init) => {
      if (url === "/api/article-chat" && init?.method === "POST") return chatResponse(
        "How should I think about my portfolio today?",
        "Start by reviewing your highest-conviction positions and market risk.",
        null,
      );
    });

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

  it("moves the open chat between desktop and mobile shells when the viewport crosses the breakpoint", async () => {
    const story = makeFeedItem({ id: "feed-1", newsItemId: "news-1", headline: "Responsive story" });
    mockFeed([story]);

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

  it("loads and sends article chat messages in the desktop detail slot", async () => {
    const story = makeFeedItem({
      id: "feed-1",
      newsItemId: "news-1",
      headline: "AI infrastructure spend accelerates",
    });

    mockFeed([story], (url, init) => {
      if (url === "/api/article-chat" && init?.method === "POST") return chatResponse(
        "What matters most here for my portfolio?",
        "The article suggests sustained demand for semiconductor infrastructure.",
      );
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
    expect(screen.queryByText(/article detail/i)).toBeNull();
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
    const fetchMock = mockFeed(stories, (url, init) => {
      if (url === "/api/article-chat" && init?.method === "POST") return chatResponse(
        "What should I watch next?",
        "Keep watching execution risk.",
      );
    });

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
    expect(within(updatedSidebar).getByRole("button", { name: /^ultimate$/i })).toHaveAttribute("aria-pressed", "false");

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

  it.each([
    {
      title: "shows a confirmation modal before switching active story chats",
      draft: "Tell me the risk here",
      confirm: true,
      button: /switch story/i,
      headline: "Second story",
    },
    {
      title: "keeps the current story when the switch confirmation is canceled",
      draft: "Hold this draft",
      confirm: false,
      button: /stay here/i,
      headline: "First story",
    },
  ])("$title", async ({ draft, confirm, button, headline }) => {
    const stories = [
      makeFeedItem({ id: "feed-1", newsItemId: "news-1", headline: "First story" }),
      makeFeedItem({ id: "feed-2", newsItemId: "news-2", headline: "Second story" }),
    ];
    const fetchMock = mockFeed(stories);

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
        target: { value: draft },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Second story"));
    });
    expect(screen.getByRole("dialog", { name: /switch story chat/i })).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: button }));
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /switch story chat/i })).toBeNull();
    });
    if (confirm) {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/article-chat?portfolioId=p1&newsItemId=news-2"),
      );
    } else {
      const articleChatCalls = fetchMock.mock.calls
        .map(([url]) => url as string)
        .filter((url) => url.includes("/api/article-chat?"));
      expect(articleChatCalls.some((url) => url.includes("newsItemId=news-2"))).toBe(false);
    }
    expect(screen.getByTestId("story-chat-sidebar").textContent).toContain(headline);
  });

  describe("audit F05 deep links", () => {
    function mockCurrentFeed() {
      mockFeed([makeFeedItem({ id: "feed-now", newsItemId: "news-now", headline: "Current story" })]);
    }

    it("opens a saved story that is outside the current feed window", async () => {
      setViewport(1440);
      mockCurrentFeed();
      const oldStory = makeFeedItem({ id: "news-old", newsItemId: "news-old", headline: "August SEC filing" });

      await act(async () => {
        render(
          <FeedView
            portfolioId="p1"
            initialStoryId="news-old"
            initialStory={{ status: "found", story: oldStory }}
          />,
        );
      });

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "August SEC filing" })).toBeTruthy();
      });
    });

    it("explains when the requested story no longer exists", async () => {
      setViewport(1440);
      mockCurrentFeed();

      await act(async () => {
        render(<FeedView portfolioId="p1" initialStoryId="news-gone" initialStory={{ status: "not_found" }} />);
      });

      expect(screen.getByRole("status")).toHaveTextContent(/no longer available/i);
    });
  });

  describe("audit F01/F14 below the xl breakpoint", () => {
    it.each([1188])(
      "at %ipx selecting a story opens its detail in a focused dialog, not after the feed",
      async (width) => {
        setViewport(width);
        mockFeed([makeFeedItem({ id: "feed-1", newsItemId: "news-1", headline: "Narrow story" })]);

        await act(async () => {
          render(<FeedView portfolioId="p1" />);
        });
        await act(async () => {
          fireEvent.click(screen.getByText("Narrow story"));
        });

        const dialog = await screen.findByRole("dialog", { name: /article details/i });
        expect(within(dialog).getByRole("heading", { name: "Narrow story" })).toBeTruthy();
        expect(dialog.contains(document.activeElement)).toBe(true);

        await act(async () => {
          fireEvent.keyDown(document, { key: "Escape" });
        });
        expect(screen.queryByRole("dialog", { name: /article details/i })).toBeNull();
      },
    );

    it("preserves an unsent draft when the chat is closed and reopened", async () => {
      setViewport(768);
      mockFeed([makeFeedItem({ id: "feed-1", newsItemId: "news-1", headline: "Any story" })]);

      await act(async () => {
        render(<FeedView portfolioId="p1" />);
      });
      await act(async () => {
        fireEvent.click(screen.getByTestId("floating-ask-ai-button"));
      });

      const sheet = await screen.findByTestId("story-chat-sheet");
      const textarea = within(sheet).getByRole("textbox");
      await act(async () => {
        fireEvent.change(textarea, { target: { value: "Unsent question" } });
      });
      await act(async () => {
        fireEvent.click(within(sheet).getByRole("button", { name: /close ask ai chat/i }));
      });
      expect(screen.queryByTestId("story-chat-sheet")).toBeNull();

      await act(async () => {
        fireEvent.click(screen.getByTestId("floating-ask-ai-button"));
      });
      const reopened = await screen.findByTestId("story-chat-sheet");
      expect(within(reopened).getByRole("textbox")).toHaveValue("Unsent question");
    });
  });

  describe("F02 latest filter request", () => {
    it.each(["late response", "late rejection"])("dispatches the new filter and ignores the old %s", async (outcome) => {
      const older = createDeferred<ReturnType<typeof feedResponse>>();
      const response = (headline: string, totalCount = 1, page = 1) => feedResponse([
        makeFeedItem({ id: headline, newsItemId: headline, headline, publishedMinutesAgo: 30 }),
      ], { totalCount, page, pageSize: 100 });
      const fetchMock = mockFeed([], (url) => {
        if (!url.startsWith("/api/feed?")) return;
        const minutes = new URL(url, "http://localhost").searchParams.get("maxMinutes");
        if (minutes === "60") return older.promise;
        return response(minutes === "120" ? "New filter story" : "Initial story");
      });
      try {
        await act(async () => { render(<FeedView portfolioId="p1" />); });
        const recency = screen.getByRole("combobox", { name: /recency/i });
        await act(async () => { fireEvent.change(recency, { target: { value: "Past hour" } }); });
        await act(async () => { fireEvent.change(recency, { target: { value: "Past 2 hours" } }); });
        await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => new URL(url, "http://localhost").searchParams.get("maxMinutes") === "120")).toBe(true));
        expect(await screen.findByText("New filter story")).toBeTruthy();
        await act(async () => {
          if (outcome === "late rejection") older.reject(new Error("Old request failed"));
          else older.resolve(response("Old filter story", 99, 2));
        });
        expect(screen.getByText("New filter story")).toBeTruthy();
        expect(screen.queryByText("Old filter story")).toBeNull();
        expect(screen.queryByText("Old request failed")).toBeNull();
        expect(screen.queryByText(/99 articles/)).toBeNull();
        expect((recency as HTMLSelectElement).value).toBe("Past 2 hours");
      } finally {
        await act(async () => { older.resolve(response("Old filter story")); });
        vi.unstubAllGlobals();
      }
    });
  });

  describe("F09 ticker identity", () => {
    it("renders every affected symbol in full", () => {
      render(<NewsFeedCard story={makeFeedItem({ stockTags: ["AMZN", "GOOG", "MSFT", "NVDA", "AAPL", "TSLA"] })} mode="market" onOpen={() => undefined} />);
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

      mockFeed([], (url) => {
        if (!url.startsWith("/api/feed?")) return;
        const filtered = url.includes("maxMinutes=60");
        return feedResponse(
          filtered ? [] : [makeFeedItem({ id: "feed-1", headline: "Older story", publishedMinutesAgo: 300 })],
          { totalCount: filtered ? 0 : 1, page: 1, pageSize: 100 },
        );
      });

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
});
