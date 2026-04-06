import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIChatError } from "@/lib/services/ai/ai-chat-errors";
import { BillingAccessError } from "@/lib/billing/subscriptions";
import { AIUsageAccessError } from "@/lib/security/ai-access";

// Always-pass Turnstile mock for route tests
vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

const mockAnswerArticleQuestion = vi.fn();
const mockAnswerPortfolioQuestion = vi.fn();
const mockAssertUserCanUseAI = vi.fn();
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
  const actual = await vi.importActual<typeof import("@/lib/services/ai")>("@/lib/services/ai");
  return {
    ...actual,
    getAIProviderById: (id: "azure" | "anthropic" | "openai" | "openrouter" | "mistral") => mockGetAIProviderById(id),
  };
});

let insertAssistantCalls = 0;
let insertUserCalls = 0;
const messageRows: Array<{ id: string; role: string; content: string; created_at: string }> = [];

function createSupabaseMock(opts: {
  insertUserError?: Error | null;
  currentPlan?: "free" | "premium" | "ultimate";
  currentStatus?: string;
  hasUsedTrial?: boolean;
}) {
  const threadId = "thread-1";
  const currentPeriodEnd = new Date(Date.now() + 86_400_000).toISOString();
  const subscriptionRows =
    opts.currentPlan && opts.currentPlan !== "free"
      ? [
          {
            id: "sub-row-1",
            user_id: "user-1",
            stripe_subscription_id: "sub_123",
            stripe_customer_id: "cus_123",
            stripe_price_id: opts.currentPlan === "premium" ? "price_premium" : "price_ultimate",
            stripe_product_id: opts.currentPlan === "premium" ? "prod_premium" : "prod_ultimate",
            plan_key: opts.currentPlan,
            status: opts.currentStatus ?? "active",
            current_period_start: new Date().toISOString(),
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            trial_start: opts.hasUsedTrial ? new Date().toISOString() : null,
            trial_end: opts.hasUsedTrial ? currentPeriodEnd : null,
            raw: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]
      : [];
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
              maybeSingle: async () => ({
                data:
                  subscriptionRows.length > 0
                    ? { user_id: "user-1", stripe_customer_id: "cus_123" }
                    : null,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: async () => ({ data: subscriptionRows, error: null }),
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
              maybeSingle: async () => ({
                data: { id: "n1" },
                error: null,
              }),
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

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => currentSupabase,
}));

import { POST } from "@/app/api/article-chat/route";

describe("POST /api/article-chat", () => {
  beforeEach(() => {
    insertAssistantCalls = 0;
    insertUserCalls = 0;
    messageRows.length = 0;
    mockAnswerArticleQuestion.mockReset();
    mockAnswerPortfolioQuestion.mockReset();
    mockAssertUserCanUseAI.mockReset();
    mockAssertUserCanUseAI.mockResolvedValue(undefined);
    mockComputePortfolioOverview.mockClear();
    mockGetAIProviderById.mockClear();
    currentSupabase = createSupabaseMock({});
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_USER_EMAILS;
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

  it("returns 403 when a free user requests the premium tier", async () => {
    mockAssertUserCanUseAI.mockRejectedValue(
      new BillingAccessError({
        currentPlan: "free",
        requiredPlan: "premium",
        requestedTier: "premium",
      }),
    );

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
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string; requiredPlan?: string };
    expect(body.code).toBe("plan_upgrade_required");
    expect(body.requiredPlan).toBe("premium");
    expect(mockGetAIProviderById).not.toHaveBeenCalled();
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

  it("allows admin users to request the ultimate tier without a paid plan", async () => {
    mockAnswerArticleQuestion.mockResolvedValue("Admin answer.");

    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        newsItemId: "n1",
        message: "Use the best model.",
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

  it("returns 429 with retry metadata when the durable burst limit is hit", async () => {
    mockAssertUserCanUseAI.mockRejectedValue(
      new AIUsageAccessError({
        code: "rate_limited",
        message: "Too many requests. Please wait a moment.",
        retryAfterMs: 12_000,
        resetsAt: "2026-04-04T12:01:00.000Z",
      }),
    );

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
    const body = (await res.json()) as { code?: string; retryAfterMs?: number };
    expect(res.status).toBe(429);
    expect(body.code).toBe("rate_limited");
    expect(body.retryAfterMs).toBe(12_000);
    expect(mockGetAIProviderById).not.toHaveBeenCalled();
  });

  it("returns 429 with quota metadata when the durable quota is exhausted", async () => {
    mockAssertUserCanUseAI.mockRejectedValue(
      new AIUsageAccessError({
        code: "quota_exceeded",
        message: "You have reached your AI usage limit for the current billing window.",
        quotaWindow: "day",
        quotaLimit: 100,
        quotaUsed: 100,
        resetsAt: "2026-04-05T04:00:00.000Z",
      }),
    );

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
    const body = (await res.json()) as {
      code?: string;
      quotaWindow?: string;
      quotaLimit?: number;
      quotaUsed?: number;
    };
    expect(res.status).toBe(429);
    expect(body.code).toBe("quota_exceeded");
    expect(body.quotaWindow).toBe("day");
    expect(body.quotaLimit).toBe(100);
    expect(body.quotaUsed).toBe(100);
  });

  it("checks durable AI access exactly once even when the provider later fails", async () => {
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
    expect(mockAssertUserCanUseAI).toHaveBeenCalledTimes(1);
  });
});
