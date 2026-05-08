import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AIChatError } from "@/lib/services/ai/ai-chat-errors";

// ---------------------------------------------------------------------------
// Turnstile mock — we spy on calls to ensure the route only asks for a
// challenge on the FIRST request in a scope and not on subsequent ones.
// All mock fns are created via `vi.hoisted` so the `vi.mock(...)` factory
// calls (which vitest hoists to the top of the file) can reference them
// without tripping the "cannot access before initialization" error.
// ---------------------------------------------------------------------------
const {
  mockVerifyTurnstileToken,
  mockAnswerArticleQuestion,
  mockAnswerPortfolioQuestion,
  mockAssertUserCanUseAI,
} = vi.hoisted(() => ({
  mockVerifyTurnstileToken: vi.fn().mockResolvedValue({ success: true }),
  mockAnswerArticleQuestion: vi.fn(),
  mockAnswerPortfolioQuestion: vi.fn(),
  mockAssertUserCanUseAI: vi.fn(),
}));

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: mockVerifyTurnstileToken,
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/services/portfolio", () => ({
  computePortfolioOverview: vi.fn().mockResolvedValue({
    totalValue: 1,
    dayChange: 0,
    lastAnalyzedAt: new Date().toISOString(),
    coverage: "",
    primaryGoal: "",
  }),
}));

vi.mock("@/lib/security/ai-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security/ai-access")>(
    "@/lib/security/ai-access",
  );
  return {
    ...actual,
    assertUserCanUseAI: (...args: unknown[]) => mockAssertUserCanUseAI(...args),
  };
});

vi.mock("@/lib/services/ai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/ai")>(
    "@/lib/services/ai",
  );
  return {
    ...actual,
    getAIProviderById: () => ({
      answerArticleQuestion: mockAnswerArticleQuestion,
      answerPortfolioQuestion: mockAnswerPortfolioQuestion,
    }),
  };
});

// ---------------------------------------------------------------------------
// Minimal Supabase mock — only the tables we touch during article chat POST.
// ---------------------------------------------------------------------------
const messageRows: Array<{
  id: string;
  role: string;
  content: string;
  created_at: string;
}> = [];
let insertUserCalls = 0;
let insertAssistantCalls = 0;

function createSupabaseMock() {
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
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: { id: "p1" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "billing_customers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "article_chat_threads") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: "t1" }, error: null }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: "t1" }, error: null }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "article_chat_messages") {
        return {
          insert: (row: { role: string; content: string }) => {
            if (row.role === "user") {
              insertUserCalls += 1;
              messageRows.push({
                id: `u-${insertUserCalls}`,
                role: "user",
                content: row.content,
                created_at: new Date().toISOString(),
              });
            } else {
              insertAssistantCalls += 1;
              messageRows.push({
                id: `a-${insertAssistantCalls}`,
                role: "assistant",
                content: row.content,
                created_at: new Date().toISOString(),
              });
            }
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({ data: [...messageRows], error: null }),
            }),
          }),
        };
      }
      if (table === "news_items") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: "n1" }, error: null }),
              single: async () => ({
                data: {
                  headline: "H",
                  source: "S",
                  published_at: new Date().toISOString(),
                  category: "other",
                  global_summary: null,
                  raw_content: "body",
                  full_content: null,
                  extracted_content: null,
                  extraction_status: null,
                  stock_tags: [],
                  ticker_impacts: [],
                  source_type: "newsapi",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "holdings") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
              then: undefined,
            }),
          }),
        };
      }
      if (table === "analysis_runs") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
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
                eq: () => ({
                  order: () => ({
                    limit: () => ({
                      maybeSingle: async () => ({ data: null, error: null }),
                    }),
                  }),
                }),
                order: () => ({
                  order: () => ({
                    limit: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "portfolio_insights") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "watchlist_items") {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

let currentSupabase: ReturnType<typeof createSupabaseMock>;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabase,
}));

// ---------------------------------------------------------------------------

import { GET, POST } from "@/app/api/article-chat/route";
import {
  buildChatGrantCookieValue,
  chatGrantCookieName,
  type ChatGrantScope,
} from "@/lib/security/chat-turnstile-grant";

function cookieHeaderFor(scope: ChatGrantScope): string {
  return `${chatGrantCookieName(scope)}=${encodeURIComponent(buildChatGrantCookieValue(scope))}`;
}

function makePost(body: object, cookie?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return new Request("http://localhost/api/article-chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function makeGet(
  params: Record<string, string>,
  cookie?: string,
): Request {
  const url = new URL("http://localhost/api/article-chat");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request(url.toString(), { method: "GET", headers });
}

describe("POST /api/article-chat (Turnstile grant)", () => {
  beforeEach(() => {
    messageRows.length = 0;
    insertUserCalls = 0;
    insertAssistantCalls = 0;
    currentSupabase = createSupabaseMock();
    mockVerifyTurnstileToken.mockReset();
    mockVerifyTurnstileToken.mockResolvedValue({ success: true });
    mockAnswerArticleQuestion.mockReset();
    mockAnswerPortfolioQuestion.mockReset();
    mockAssertUserCanUseAI.mockReset();
    mockAssertUserCanUseAI.mockResolvedValue(undefined);
    mockAnswerArticleQuestion.mockResolvedValue("answer");
    mockAnswerPortfolioQuestion.mockResolvedValue("general-answer");
    process.env.TURNSTILE_SECRET_KEY = "test-secret-key";
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_USER_EMAILS;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requires Turnstile on the first send for a new story scope and issues a grant cookie", async () => {
    const req = makePost({
      portfolioId: "p1",
      newsItemId: "n1",
      message: "Hello",
      turnstileToken: "tok-1",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockVerifyTurnstileToken).toHaveBeenCalledTimes(1);
    const call = mockVerifyTurnstileToken.mock.calls[0][0];
    expect(call.expectedAction).toBe("article-chat");

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie!).toContain("HttpOnly");
    expect(setCookie!).toContain("SameSite=Lax");
  });

  it("does NOT require Turnstile on subsequent sends when the grant cookie is present for the same scope", async () => {
    const scope: ChatGrantScope = {
      userId: "user-1",
      surface: "article-chat",
      portfolioId: "p1",
      newsItemId: "n1",
    };
    const req = makePost(
      {
        portfolioId: "p1",
        newsItemId: "n1",
        message: "Second message",
        // No turnstileToken on purpose.
      },
      cookieHeaderFor(scope),
    );

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
    // We do not re-issue a cookie when one is already present and valid.
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("re-requires Turnstile when the newsItemId (story) changes, even if a grant exists for another story", async () => {
    const scope: ChatGrantScope = {
      userId: "user-1",
      surface: "article-chat",
      portfolioId: "p1",
      newsItemId: "n1",
    };
    const req = makePost(
      {
        portfolioId: "p1",
        newsItemId: "n2", // different story
        message: "On the other story",
        turnstileToken: "tok-other",
      },
      cookieHeaderFor(scope),
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockVerifyTurnstileToken).toHaveBeenCalledTimes(1);
  });

  it("re-requires Turnstile for the general feed chat even if a story grant exists", async () => {
    const storyScope: ChatGrantScope = {
      userId: "user-1",
      surface: "article-chat",
      portfolioId: "p1",
      newsItemId: "n1",
    };
    const req = makePost(
      {
        portfolioId: "p1",
        // no newsItemId => article-chat-general scope
        message: "General question",
        turnstileToken: "tok-general",
      },
      cookieHeaderFor(storyScope),
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockVerifyTurnstileToken).toHaveBeenCalledTimes(1);
    const call = mockVerifyTurnstileToken.mock.calls[0][0];
    // The article-chat endpoint serves both story chat and general feed chat;
    // both are rendered by the same Turnstile widget with `action="article-chat"`.
    // The server discriminates the two via `scope.surface` for grant issuance,
    // but the Turnstile action assertion must match what the widget emits.
    expect(call.expectedAction).toBe("article-chat");

    // A grant for the general surface should now be issued.
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
  });

  it("returns 503 on AI failure and does NOT re-consume the grant (cookie-bearing request should succeed once AI is healthy again)", async () => {
    const scope: ChatGrantScope = {
      userId: "user-1",
      surface: "article-chat",
      portfolioId: "p1",
      newsItemId: "n1",
    };

    // First call fails at the AI layer, but Turnstile is NOT re-checked.
    mockAnswerArticleQuestion.mockRejectedValueOnce(
      new AIChatError("provider_unavailable", "down"),
    );

    const failingReq = makePost(
      {
        portfolioId: "p1",
        newsItemId: "n1",
        message: "First try",
      },
      cookieHeaderFor(scope),
    );

    const failRes = await POST(failingReq);
    expect(failRes.status).toBe(503);
    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();

    // Second call succeeds; still no Turnstile.
    mockAnswerArticleQuestion.mockResolvedValue("retry answer");
    const retryReq = makePost(
      {
        portfolioId: "p1",
        newsItemId: "n1",
        message: "Second try",
      },
      cookieHeaderFor(scope),
    );

    const retryRes = await POST(retryReq);
    expect(retryRes.status).toBe(200);
    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("rejects with 403 turnstile_failed when no grant cookie is present and the token fails", async () => {
    mockVerifyTurnstileToken.mockResolvedValueOnce({
      success: false,
      code: "invalid-input-response",
      message: "Turnstile verification failed.",
    });

    const req = makePost({
      portfolioId: "p1",
      newsItemId: "n1",
      message: "Hi",
      turnstileToken: "bad",
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("turnstile_failed");
    // No grant cookie should be emitted on failure.
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// GET /api/article-chat — exposes `turnstileVerified` for the current scope
// so client components can avoid rendering the widget when a grant is held.
// ---------------------------------------------------------------------------
describe("GET /api/article-chat (Turnstile grant)", () => {
  beforeEach(() => {
    messageRows.length = 0;
    insertUserCalls = 0;
    insertAssistantCalls = 0;
    currentSupabase = createSupabaseMock();
    mockVerifyTurnstileToken.mockReset();
    mockAssertUserCanUseAI.mockReset();
    mockAssertUserCanUseAI.mockResolvedValue(undefined);
    process.env.TURNSTILE_SECRET_KEY = "test-secret-key";
  });

  it("returns turnstileVerified: false when no grant cookie is present", async () => {
    const res = await GET(
      makeGet({ portfolioId: "p1", newsItemId: "n1" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { turnstileVerified?: boolean };
    expect(body.turnstileVerified).toBe(false);
  });

  it("returns turnstileVerified: true when the story-scope grant cookie is valid", async () => {
    const scope: ChatGrantScope = {
      userId: "user-1",
      surface: "article-chat",
      portfolioId: "p1",
      newsItemId: "n1",
    };
    const res = await GET(
      makeGet({ portfolioId: "p1", newsItemId: "n1" }, cookieHeaderFor(scope)),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { turnstileVerified?: boolean };
    expect(body.turnstileVerified).toBe(true);
  });

  it("returns turnstileVerified: false when a grant cookie is for a different story", async () => {
    const otherScope: ChatGrantScope = {
      userId: "user-1",
      surface: "article-chat",
      portfolioId: "p1",
      newsItemId: "different-story",
    };
    const res = await GET(
      makeGet(
        { portfolioId: "p1", newsItemId: "n1" },
        cookieHeaderFor(otherScope),
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { turnstileVerified?: boolean };
    expect(body.turnstileVerified).toBe(false);
  });
});
