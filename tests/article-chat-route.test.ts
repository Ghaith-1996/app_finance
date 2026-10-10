import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BillingAccessError } from "@/lib/billing/subscriptions";
import { AIUsageAccessError } from "@/lib/security/ai-access";
import { AIChatError } from "@/lib/services/ai/ai-chat-errors";
import type { ArticleChatContext, PortfolioCopilotContext } from "@/lib/services/ai/provider";
import {
  buildChatGrantCookieValue,
  chatGrantCookieName,
  type ChatGrantScope,
} from "@/lib/security/chat-turnstile-grant";

const mocks = vi.hoisted(() => ({
  verifyTurnstileToken: vi.fn(),
  answerArticleQuestion: vi.fn<(context: ArticleChatContext) => Promise<string>>(),
  answerPortfolioQuestion: vi.fn<(context: PortfolioCopilotContext) => Promise<string>>(),
  assertUserCanUseAI: vi.fn(),
  releaseAIUsage: vi.fn(),
  getAIProviderById: vi.fn(),
}));

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: mocks.verifyTurnstileToken,
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/services/portfolio", () => ({
  computePortfolioOverview: vi.fn().mockResolvedValue({
    totalValue: 125000,
    dayChange: 1400,
    lastAnalyzedAt: "2026-10-04T12:00:00.000Z",
    coverage: "Balanced",
    primaryGoal: "Compound capital",
  }),
}));
vi.mock("@/lib/security/ai-access", async () => ({
  ...await vi.importActual<typeof import("@/lib/security/ai-access")>("@/lib/security/ai-access"),
  assertUserCanUseAI: mocks.assertUserCanUseAI,
  releaseAIUsage: mocks.releaseAIUsage,
}));
vi.mock("@/lib/services/ai", async () => ({
  ...await vi.importActual<typeof import("@/lib/services/ai")>("@/lib/services/ai"),
  getAIProviderById: mocks.getAIProviderById,
}));

const RESERVED_USAGE = { aiQuotaWindow: "day", aiQuotaResetsAt: "2026-10-03T04:00:00.000Z" };
type MessageInsert = { role: string; content: string; thread_id: string; created_at?: string };
type ChatResponseBody = {
  messages?: Array<{ role: string; content: string }>;
  error?: string;
  code?: string;
  requiredPlan?: string;
  retryAfterMs?: number;
  quotaWindow?: string;
  quotaLimit?: number;
  quotaUsed?: number;
  turnstileVerified?: boolean;
};
const messageRows: Array<{ id: string; role: string; content: string; created_at: string }> = [];
const insertedMessageBatches: MessageInsert[][] = [];
let insertUserCalls = 0;
let insertAssistantCalls = 0;

function createSupabaseMock() {
  const emptyRows = async () => ({ data: [], error: null });
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }) },
    from(table: string) {
      if (table === "portfolios") {
        return {
          select: () => ({
            eq: (column: string, portfolioId: string) => ({
              eq: (ownerColumn: string, userId: string) => ({
                single: async () => ({
                  data: column === "id" && portfolioId === "p1" && ownerColumn === "user_id" && userId === "user-1"
                    ? { id: "p1", name: "My Portfolio" } : null,
                  error: null,
                }),
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
                  maybeSingle: async () => ({ data: { id: "thread-1" }, error: null }),
                }),
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      if (table === "article_chat_messages") {
        return {
          insert(value: MessageInsert | MessageInsert[]) {
            const rows = Array.isArray(value) ? value : [value];
            insertedMessageBatches.push(rows);
            for (const row of rows) {
              const id = row.role === "user" ? `u-${++insertUserCalls}` : `a-${++insertAssistantCalls}`;
              messageRows.push({
                id,
                role: row.role,
                content: row.content,
                created_at: row.created_at ?? new Date().toISOString(),
              });
            }
            return Promise.resolve({ error: null });
          },
          select: () => ({
            eq: () => ({ order: async () => ({ data: [...messageRows], error: null }) }),
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
                  published_at: "2026-10-04T12:00:00.000Z",
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
        return { select: () => ({ eq: () => Object.assign(emptyRows(), { order: emptyRows }) }) };
      }
      if (table === "analysis_runs") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => ({
                  limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "watchlist_items") {
        return { select: () => ({ eq: async () => ({ data: [{ symbol: "NVDA" }], error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

let currentSupabase: ReturnType<typeof createSupabaseMock>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentSupabase }));

import { GET, POST } from "@/app/api/article-chat/route";

const storyScope: ChatGrantScope = {
  userId: "user-1", surface: "article-chat", portfolioId: "p1", newsItemId: "n1",
};
function cookieHeaderFor(scope: ChatGrantScope = storyScope) {
  return `${chatGrantCookieName(scope)}=${encodeURIComponent(buildChatGrantCookieValue(scope))}`;
}
function makePost(body: object = {}, cookie?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return new Request("http://localhost/api/article-chat", {
    method: "POST", headers,
    body: JSON.stringify({ portfolioId: "p1", newsItemId: "n1", message: "What is the risk?", ...body }),
  });
}
function makeGet(cookie?: string) {
  return new Request("http://localhost/api/article-chat?portfolioId=p1&newsItemId=n1", {
    headers: cookie ? { cookie } : {},
  });
}

beforeEach(() => {
  messageRows.length = 0;
  insertedMessageBatches.length = 0;
  insertUserCalls = 0;
  insertAssistantCalls = 0;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.verifyTurnstileToken.mockResolvedValue({ success: true });
  mocks.answerArticleQuestion.mockResolvedValue("answer");
  mocks.answerPortfolioQuestion.mockResolvedValue("general-answer");
  mocks.assertUserCanUseAI.mockResolvedValue(RESERVED_USAGE);
  mocks.releaseAIUsage.mockResolvedValue(undefined);
  mocks.getAIProviderById.mockReturnValue({
    answerArticleQuestion: mocks.answerArticleQuestion,
    answerPortfolioQuestion: mocks.answerPortfolioQuestion,
  });
  currentSupabase = createSupabaseMock();
  vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret-key");
  vi.stubEnv("ADMIN_USER_IDS", undefined);
  vi.stubEnv("ADMIN_USER_EMAILS", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/article-chat", () => {
  it("answers a generic portfolio-level question when newsItemId is omitted", async () => {
    mocks.answerPortfolioQuestion.mockResolvedValue("Generic market answer.");
    const res = await POST(makePost({
      newsItemId: undefined, message: "How should I think about today?",
      history: [{ role: "assistant", content: "Earlier context" }],
    }));
    const body: ChatResponseBody = await res.json();
    expect(res.status).toBe(200);
    expect(mocks.answerPortfolioQuestion).toHaveBeenCalledTimes(1);
    expect(mocks.answerArticleQuestion).not.toHaveBeenCalled();
    expect(body.messages?.some((message: { content: string }) => message.content === "Earlier context")).toBe(true);
    expect(body.messages?.some((message: { role: string; content: string }) => message.role === "assistant" && message.content.includes("Generic market answer"))).toBe(true);
    expect(mocks.getAIProviderById).toHaveBeenCalledWith("openrouter");
  });

  it("returns 503 without persisting either half of a failed exchange", async () => {
    mocks.answerArticleQuestion.mockRejectedValue(new AIChatError("provider_unavailable", "down"));
    const res = await POST(makePost());
    const body: ChatResponseBody = await res.json();
    expect(res.status).toBe(503);
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(body.code).toBe("provider_unavailable");
    expect(insertUserCalls).toBe(0);
    expect(insertAssistantCalls).toBe(0);
    expect(mocks.getAIProviderById).toHaveBeenCalledWith("openrouter");
    expect(mocks.releaseAIUsage).toHaveBeenCalledTimes(1);
    expect(mocks.releaseAIUsage).toHaveBeenCalledWith(expect.any(String), RESERVED_USAGE);
  });

  it("keeps the quota unit when the answer is delivered (H5)", async () => {
    mocks.answerArticleQuestion.mockResolvedValue("Delivered answer");
    expect((await POST(makePost())).status).toBe(200);
    expect(mocks.releaseAIUsage).not.toHaveBeenCalled();
  });

  it("returns 403 when a free user requests the premium tier", async () => {
    mocks.assertUserCanUseAI.mockRejectedValue(new BillingAccessError({
      currentPlan: "free", requiredPlan: "premium", requestedTier: "premium",
    }));
    const res = await POST(makePost({ message: "What matters here?", modelTier: "premium" }));
    const body: ChatResponseBody = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("plan_upgrade_required");
    expect(body.requiredPlan).toBe("premium");
    expect(mocks.getAIProviderById).not.toHaveBeenCalled();
  });

  it.each([
    { name: "uses the premium tier provider when modelTier is premium", modelTier: "premium", provider: "mistral", answer: "Premium-tier answer." },
    { name: "uses the ultimate tier provider when modelTier is ultimate", modelTier: "ultimate", provider: "azure", answer: "Ultimate-tier answer." },
  ])("$name", async ({ modelTier, provider, answer }) => {
    mocks.answerArticleQuestion.mockResolvedValue(answer);
    const res = await POST(makePost({ message: "What matters here?", modelTier }));
    expect(res.status).toBe(200);
    expect(mocks.getAIProviderById).toHaveBeenCalledWith(provider);
  });

  it("returns 400 for invalid model tiers", async () => {
    const res = await POST(makePost({ message: "What matters here?", modelTier: "enterprise" }));
    expect(res.status).toBe(400);
    expect(mocks.getAIProviderById).not.toHaveBeenCalled();
  });

  it.each([
    { name: "returns provider_auth code and config-specific message for auth errors", error: new AIChatError("provider_auth", "Azure OpenAI is misconfigured"), code: "provider_auth", copy: /credentials/i },
    { name: "returns provider_timeout code for timeout errors", error: new AIChatError("provider_timeout", "timed out"), code: "provider_timeout", copy: /too long/i },
    { name: "returns actionable copy when the upstream provider is rate limited", error: new Error("OpenRouter HTTP 429: Provider returned too many requests"), code: "provider_rate_limited", copy: /busy|rate.?limited/i },
    { name: "returns actionable copy when the provider rejects oversized context", error: new Error("Azure OpenAI HTTP 400: maximum context length exceeded"), code: "provider_context_limit", copy: /too much context/i },
    { name: "returns provider_bad_response code for empty model output", error: new AIChatError("provider_bad_response", "Model returned an empty answer."), code: "provider_bad_response", copy: /unusable response/i },
  ])("$name", async ({ error, code, copy }) => {
    mocks.answerArticleQuestion.mockRejectedValue(error);
    const res = await POST(makePost({ message: "test" }));
    const body: ChatResponseBody = await res.json();
    expect(res.status).toBe(503);
    expect(body.code).toBe(code);
    expect(body.error).toMatch(copy);
    expect(insertUserCalls).toBe(0);
    expect(insertAssistantCalls).toBe(0);
  });

  it("inserts assistant message on success", async () => {
    mocks.answerArticleQuestion.mockResolvedValue("A real answer about your question.");
    const res = await POST(makePost());
    const body: ChatResponseBody = await res.json();
    expect(res.status).toBe(200);
    expect(insertAssistantCalls).toBe(1);
    expect(insertedMessageBatches).toHaveLength(1);
    expect(insertedMessageBatches[0]?.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(Date.parse(insertedMessageBatches[0]?.[0]?.created_at ?? "") < Date.parse(insertedMessageBatches[0]?.[1]?.created_at ?? "")).toBe(true);
    expect(body.messages?.some((message: { role: string; content: string }) => message.role === "assistant" && message.content.includes("real answer"))).toBe(true);
  });

  it("passes prior thread messages without duplicating the current question in history", async () => {
    messageRows.push({ id: "prior-assistant", role: "assistant", content: "Earlier answer", created_at: "2026-03-24T12:00:00.000Z" });
    mocks.answerArticleQuestion.mockImplementation(async (context) => JSON.stringify({ history: context.history, question: context.question }));
    const res = await POST(makePost({ message: "Current question" }));
    const body: ChatResponseBody = await res.json();
    const assistantReply = body.messages?.findLast((message: { role: string }) => message.role === "assistant");
    expect(res.status).toBe(200);
    expect(JSON.parse(assistantReply?.content ?? "{}")).toEqual({
      history: [{ role: "assistant", content: "Earlier answer" }], question: "Current question",
    });
  });

  it("does not add a failed question to history when the user retries", async () => {
    mocks.answerArticleQuestion
      .mockRejectedValueOnce(new AIChatError("provider_unavailable", "down"))
      .mockImplementationOnce(async (context) => JSON.stringify({ history: context.history, question: context.question }));
    const firstResponse = await POST(makePost({ message: "Retry this question" }));
    const retryResponse = await POST(makePost({ message: "Retry this question" }));
    const body: ChatResponseBody = await retryResponse.json();
    const assistantReply = body.messages?.findLast((message: { role: string }) => message.role === "assistant");
    expect(firstResponse.status).toBe(503);
    expect(retryResponse.status).toBe(200);
    expect(JSON.parse(assistantReply?.content ?? "{}")).toEqual({ history: [], question: "Retry this question" });
    expect(insertUserCalls).toBe(1);
    expect(insertAssistantCalls).toBe(1);
  });

  it("returns 429 with retry metadata when the durable burst limit is hit", async () => {
    mocks.assertUserCanUseAI.mockRejectedValue(new AIUsageAccessError({
      code: "rate_limited", message: "Too many requests. Please wait a moment.", retryAfterMs: 12_000, resetsAt: "2026-04-04T12:01:00.000Z",
    }));
    const res = await POST(makePost({ message: "What matters here?" }));
    const body: ChatResponseBody = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("rate_limited");
    expect(body.retryAfterMs).toBe(12_000);
    expect(mocks.getAIProviderById).not.toHaveBeenCalled();
  });

  it("returns 429 with quota metadata when the durable quota is exhausted", async () => {
    mocks.assertUserCanUseAI.mockRejectedValue(new AIUsageAccessError({
      code: "quota_exceeded", message: "You have reached your AI usage limit for the current billing window.",
      quotaWindow: "day", quotaLimit: 100, quotaUsed: 100, resetsAt: "2026-04-05T04:00:00.000Z",
    }));
    const res = await POST(makePost({ message: "What matters here?" }));
    const body: ChatResponseBody = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("quota_exceeded");
    expect(body.quotaWindow).toBe("day");
    expect(body.quotaLimit).toBe(100);
    expect(body.quotaUsed).toBe(100);
  });

  it("checks durable AI access exactly once even when the provider later fails", async () => {
    mocks.answerArticleQuestion.mockRejectedValue(new AIChatError("provider_unavailable", "down"));
    expect((await POST(makePost())).status).toBe(503);
    expect(mocks.assertUserCanUseAI).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/article-chat (Turnstile grant)", () => {
  it("requires Turnstile on the first send for a new story scope and issues a grant cookie", async () => {
    const res = await POST(makePost({ message: "Hello", turnstileToken: "tok-1" }));
    expect(res.status).toBe(200);
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledTimes(1);
    expect(mocks.verifyTurnstileToken.mock.calls[0][0].expectedAction).toBe("article-chat");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it.each([
    { name: "does NOT require Turnstile on subsequent sends when the grant cookie is present for the same scope", newsItemId: "n1", message: "Second message" },
    { name: "does NOT require Turnstile when the story changes within a verified portfolio chat window", newsItemId: "n2", message: "On the other story" },
    { name: "does NOT require Turnstile for general feed chat when a story grant exists for the same portfolio", newsItemId: undefined, message: "General question" },
  ])("$name", async ({ newsItemId, message }) => {
    const res = await POST(makePost({ newsItemId, message }, cookieHeaderFor()));
    expect(res.status).toBe(200);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns 503 on AI failure and does NOT re-consume the grant (cookie-bearing request should succeed once AI is healthy again)", async () => {
    mocks.answerArticleQuestion.mockRejectedValueOnce(new AIChatError("provider_unavailable", "down"));
    const failRes = await POST(makePost({ message: "First try" }, cookieHeaderFor()));
    expect(failRes.status).toBe(503);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
    mocks.answerArticleQuestion.mockResolvedValue("retry answer");
    const retryRes = await POST(makePost({ message: "Second try" }, cookieHeaderFor()));
    expect(retryRes.status).toBe(200);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("issues the grant cookie when Turnstile passes even if the AI provider fails", async () => {
    mocks.answerArticleQuestion.mockRejectedValueOnce(new AIChatError("provider_unavailable", "down"));
    const res = await POST(makePost({ message: "First try", turnstileToken: "tok-1" }));
    expect(res.status).toBe(503);
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledTimes(1);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=900");
  });

  it("rejects with 403 turnstile_failed when no grant cookie is present and the token fails", async () => {
    mocks.verifyTurnstileToken.mockResolvedValueOnce({
      success: false, code: "invalid-input-response", message: "Turnstile verification failed.",
    });
    const res = await POST(makePost({ message: "Hi", turnstileToken: "bad" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("turnstile_failed");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("GET /api/article-chat (Turnstile grant)", () => {
  it.each([
    { name: "returns turnstileVerified: false when no grant cookie is present", verified: false },
    { name: "returns turnstileVerified: true when a grant cookie is for a different story in the same portfolio", verified: true },
  ])("$name", async ({ verified }) => {
    const cookie = verified ? cookieHeaderFor({ ...storyScope, newsItemId: "different-story" }) : undefined;
    const res = await GET(makeGet(cookie));
    expect(res.status).toBe(200);
    expect((await res.json()).turnstileVerified).toBe(verified);
  });
});
