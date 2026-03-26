import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIChatError } from "@/lib/services/ai/ai-chat-errors";

// Always-pass Turnstile mock for route tests
vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

const mockAnswerArticleQuestion = vi.fn();
const mockAnswerPortfolioQuestion = vi.fn();
const mockComputePortfolioOverview = vi.fn().mockResolvedValue({
  totalValue: 125000,
  dayChange: 1400,
  lastAnalyzedAt: new Date().toISOString(),
  coverage: "Balanced",
  primaryGoal: "Compound capital",
});
const mockGetAIProviderById = vi.fn((_id: "azure" | "anthropic" | "openai" | "openrouter" | "mistral") => ({
  answerArticleQuestion: mockAnswerArticleQuestion,
  answerPortfolioQuestion: mockAnswerPortfolioQuestion,
}));

vi.mock("@/lib/services/portfolio", () => ({
  computePortfolioOverview: (...args: unknown[]) => mockComputePortfolioOverview(...args),
}));

vi.mock("@/lib/services/ai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/services/ai")>("@/lib/services/ai");
  return {
    ...actual,
    getAIProviderById: (id: "azure" | "anthropic" | "openai" | "openrouter" | "mistral") => mockGetAIProviderById(id),
  };
});

let insertAssistantCalls = 0;
let insertUserCalls = 0;
const messageRows: Array<{ id: string; role: string; content: string; created_at: string }> = [];

function createSupabaseMock(opts: { insertUserError?: Error | null }) {
  const threadId = "thread-1";
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
      if (table === "article_chat_threads") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: threadId }, error: null }),
                }),
              }),
            }),
          }),
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { id: threadId }, error: null }),
            }),
          }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "article_chat_messages") {
        return {
          insert: (row: { role: string; content: string; thread_id: string }) => {
            if (row.role === "user") {
              insertUserCalls += 1;
              messageRows.push({
                id: `u-${insertUserCalls}`,
                role: "user",
                content: row.content,
                created_at: new Date().toISOString(),
              });
              if (opts.insertUserError) return Promise.resolve({ error: opts.insertUserError });
              return Promise.resolve({ error: null });
            }
            insertAssistantCalls += 1;
            messageRows.push({
              id: `a-${insertAssistantCalls}`,
              role: "assistant",
              content: row.content,
              created_at: new Date().toISOString(),
            });
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: () => ({
              order: () =>
                Promise.resolve({
                  data: [...messageRows],
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "news_items") {
        return {
          select: () => ({
            eq: () => ({
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
              eq: () => ({
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
            eq: async () => ({ data: [{ symbol: "NVDA" }], error: null }),
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

import { POST } from "@/app/api/article-chat/route";

describe("POST /api/article-chat", () => {
  beforeEach(() => {
    insertAssistantCalls = 0;
    insertUserCalls = 0;
    messageRows.length = 0;
    mockAnswerArticleQuestion.mockReset();
    mockAnswerPortfolioQuestion.mockReset();
    mockComputePortfolioOverview.mockClear();
    mockGetAIProviderById.mockClear();
    currentSupabase = createSupabaseMock({});
  });

  it("answers a generic portfolio-level question when newsItemId is omitted", async () => {
    mockAnswerPortfolioQuestion.mockResolvedValue("Generic market answer.");

    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        message: "How should I think about today?",
        history: [{ role: "assistant", content: "Earlier context" }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages?: Array<{ role: string; content: string }> };
    expect(mockAnswerPortfolioQuestion).toHaveBeenCalledTimes(1);
    expect(mockAnswerArticleQuestion).not.toHaveBeenCalled();
    expect(body.messages?.some((message) => message.content === "Earlier context")).toBe(true);
    expect(body.messages?.some((message) => message.role === "assistant" && message.content.includes("Generic market answer"))).toBe(true);
    expect(mockGetAIProviderById).toHaveBeenCalledWith("openrouter");
  });

  it("returns 503 and does not insert assistant when AI throws AIChatError", async () => {
    mockAnswerArticleQuestion.mockRejectedValue(new AIChatError("provider_unavailable", "down"));

    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        newsItemId: "n1",
        message: "What is the risk?",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(body.code).toBe("provider_unavailable");
    expect(insertUserCalls).toBe(1);
    expect(insertAssistantCalls).toBe(0);
    expect(mockGetAIProviderById).toHaveBeenCalledWith("openrouter");
  });

  it("defaults article chat to the free tier when modelTier is omitted", async () => {
    mockAnswerArticleQuestion.mockResolvedValue("Default free-tier answer.");

    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        newsItemId: "n1",
        message: "What matters here?",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockGetAIProviderById).toHaveBeenCalledWith("openrouter");
  });

  it("uses the premium tier provider when modelTier is premium", async () => {
    mockAnswerArticleQuestion.mockResolvedValue("Premium-tier answer.");

    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        newsItemId: "n1",
        message: "What matters here?",
        modelTier: "premium",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockGetAIProviderById).toHaveBeenCalledWith("mistral");
  });

  it("uses the ultimate tier provider when modelTier is ultimate", async () => {
    mockAnswerArticleQuestion.mockResolvedValue("Ultimate-tier answer.");

    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        newsItemId: "n1",
        message: "What matters here?",
        modelTier: "ultimate",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockGetAIProviderById).toHaveBeenCalledWith("azure");
  });

  it("returns 400 for invalid model tiers", async () => {
    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        newsItemId: "n1",
        message: "What matters here?",
        modelTier: "enterprise",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockGetAIProviderById).not.toHaveBeenCalled();
  });

  it("returns provider_auth code and config-specific message for auth errors", async () => {
    mockAnswerArticleQuestion.mockRejectedValue(
      new AIChatError("provider_auth", "Azure OpenAI is misconfigured"),
    );

    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId: "p1", newsItemId: "n1", message: "test" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.code).toBe("provider_auth");
    expect(body.error).toMatch(/credentials/i);
    expect(insertAssistantCalls).toBe(0);
  });

  it("returns provider_timeout code for timeout errors", async () => {
    mockAnswerArticleQuestion.mockRejectedValue(new AIChatError("provider_timeout", "timed out"));

    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId: "p1", newsItemId: "n1", message: "test" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.code).toBe("provider_timeout");
    expect(body.error).toMatch(/too long/i);
  });

  it("returns provider_bad_response code for empty model output", async () => {
    mockAnswerArticleQuestion.mockRejectedValue(
      new AIChatError("provider_bad_response", "Model returned an empty answer."),
    );

    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId: "p1", newsItemId: "n1", message: "test" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.code).toBe("provider_bad_response");
    expect(body.error).toMatch(/unusable response/i);
  });

  it("inserts assistant message on success", async () => {
    mockAnswerArticleQuestion.mockResolvedValue("A real answer about your question.");

    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        newsItemId: "n1",
        message: "What is the risk?",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(insertAssistantCalls).toBe(1);
    const body = (await res.json()) as { messages?: Array<{ role: string; content: string }> };
    expect(body.messages?.some((m) => m.role === "assistant" && m.content.includes("real answer"))).toBe(true);
  });
});
