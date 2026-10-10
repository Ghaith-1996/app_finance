import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BillingAccessError } from "@/lib/billing/subscriptions";
import { AIUsageAccessError } from "@/lib/security/ai-access";
import { AIChatError } from "@/lib/services/ai/ai-chat-errors";
import type { PortfolioCopilotContext } from "@/lib/services/ai/provider";
import { portfolioCopilotPrompt } from "@/lib/services/ai/prompts";
import {
  buildChatGrantCookieValue,
  chatGrantCookieName,
  type ChatGrantScope,
} from "@/lib/security/chat-turnstile-grant";

const mocks = vi.hoisted(() => ({
  verifyTurnstileToken: vi.fn(),
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
    totalValue: 85000,
    dayChange: 920,
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

const RESERVED_USAGE = { aiQuotaWindow: "month", aiQuotaResetsAt: "2026-11-01T04:00:00.000Z" };
type CopilotResponseBody = {
  answer?: string;
  code?: string;
  requiredPlan?: string;
  retryAfterMs?: number;
  quotaWindow?: string;
  quotaLimit?: number;
  quotaUsed?: number;
};
function createSupabaseMock(watchlistSymbols: string[] = []) {
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
      if (table === "holdings") {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
        };
      }
      if (table === "watchlist_items") {
        return {
          select: () => ({
            eq: async (column: string, value: unknown) => ({
              data: column === "user_id" && value === "user-1"
                ? watchlistSymbols.map((symbol) => ({ symbol })) : [],
              error: null,
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
                  limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

let currentSupabase: ReturnType<typeof createSupabaseMock>;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentSupabase }));

import { POST } from "@/app/api/portfolio-copilot/route";

const copilotScope: ChatGrantScope = {
  userId: "user-1", surface: "portfolio-copilot", portfolioId: "p1",
};
function cookieHeaderFor() {
  return `${chatGrantCookieName(copilotScope)}=${encodeURIComponent(buildChatGrantCookieValue(copilotScope))}`;
}
function makePost(body: object = {}, cookie?: string) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return new Request("http://localhost/api/portfolio-copilot", {
    method: "POST", headers,
    body: JSON.stringify({ portfolioId: "p1", message: "What should I watch?", ...body }),
  });
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.verifyTurnstileToken.mockResolvedValue({ success: true });
  mocks.answerPortfolioQuestion.mockResolvedValue("answer");
  mocks.assertUserCanUseAI.mockResolvedValue(RESERVED_USAGE);
  mocks.releaseAIUsage.mockResolvedValue(undefined);
  mocks.getAIProviderById.mockReturnValue({ answerPortfolioQuestion: mocks.answerPortfolioQuestion });
  currentSupabase = createSupabaseMock();
  vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret-key");
  vi.stubEnv("ADMIN_USER_IDS", undefined);
  vi.stubEnv("ADMIN_USER_EMAILS", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/portfolio-copilot", () => {
  describe("H5: failed requests do not count against quota", () => {
    it("refunds the reserved unit when the provider fails", async () => {
      mocks.answerPortfolioQuestion.mockRejectedValue(new Error("upstream timeout"));
      const res = await POST(makePost());
      expect(res.status).toBe(503);
      expect(mocks.releaseAIUsage).toHaveBeenCalledTimes(1);
      expect(mocks.releaseAIUsage).toHaveBeenCalledWith(expect.any(String), RESERVED_USAGE);
    });

    it("keeps the unit when an answer is returned", async () => {
      mocks.answerPortfolioQuestion.mockResolvedValue("Answer");
      expect((await POST(makePost())).status).toBe(200);
      expect(mocks.releaseAIUsage).not.toHaveBeenCalled();
    });
  });

  it("defaults to the free tier when modelTier is omitted", async () => {
    mocks.answerPortfolioQuestion.mockResolvedValue("OpenRouter answer");
    expect((await POST(makePost())).status).toBe(200);
    expect(mocks.getAIProviderById).toHaveBeenCalledWith("openrouter");
  });

  it.each([
    { name: "passes the authenticated user's watchlist to the copilot prompt", symbols: ["NVDA", " msft "], expected: ["NVDA", "MSFT"] },
    { name: "keeps an empty authenticated watchlist as an empty copilot context", symbols: [], expected: [] },
  ])("$name", async ({ symbols, expected }) => {
    currentSupabase = createSupabaseMock(symbols);
    mocks.answerPortfolioQuestion.mockImplementation(async (context) => portfolioCopilotPrompt(context).user);
    const res = await POST(makePost({
      message: "What should I watch next?", watchlistSymbols: ["OTHER_USER_SYMBOL"],
    }));
    const body: CopilotResponseBody = await res.json();
    expect(res.status).toBe(200);
    if (expected.length > 0) expect(body.answer).toContain("WATCHLIST\nNVDA, MSFT");
    expect(body.answer).not.toContain("OTHER_USER_SYMBOL");
    expect(mocks.answerPortfolioQuestion).toHaveBeenCalledWith(expect.objectContaining({ watchlistSymbols: expected }));
  });

  it("rejects premium requests for free users", async () => {
    mocks.assertUserCanUseAI.mockRejectedValue(new BillingAccessError({
      currentPlan: "free", requiredPlan: "premium", requestedTier: "premium",
    }));
    const res = await POST(makePost({ modelTier: "premium" }));
    const body: CopilotResponseBody = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("plan_upgrade_required");
    expect(body.requiredPlan).toBe("premium");
    expect(mocks.getAIProviderById).not.toHaveBeenCalled();
  });

  it.each([
    { name: "uses the premium provider for premium users", modelTier: "premium", provider: "nemotron", answer: "Nemotron answer" },
    { name: "uses the ultimate provider for ultimate users", modelTier: "ultimate", provider: "azure", answer: "Azure answer" },
  ])("$name", async ({ modelTier, provider, answer }) => {
    mocks.answerPortfolioQuestion.mockResolvedValue(answer);
    expect((await POST(makePost({ modelTier }))).status).toBe(200);
    expect(mocks.getAIProviderById).toHaveBeenCalledWith(provider);
  });

  it("returns 429 with retry metadata when the durable burst limit is hit", async () => {
    mocks.assertUserCanUseAI.mockRejectedValue(new AIUsageAccessError({
      code: "rate_limited", message: "Too many requests. Please wait a moment.", retryAfterMs: 10_000, resetsAt: "2026-04-04T12:01:00.000Z",
    }));
    const res = await POST(makePost());
    const body: CopilotResponseBody = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("rate_limited");
    expect(body.retryAfterMs).toBe(10_000);
  });

  it("returns 429 with quota metadata when the durable quota is exhausted", async () => {
    mocks.assertUserCanUseAI.mockRejectedValue(new AIUsageAccessError({
      code: "quota_exceeded", message: "You have reached your AI usage limit for the current billing window.",
      quotaWindow: "month", quotaLimit: 5_000, quotaUsed: 5_000, resetsAt: "2026-05-01T04:00:00.000Z",
    }));
    const res = await POST(makePost({ modelTier: "premium" }));
    const body: CopilotResponseBody = await res.json();
    expect(res.status).toBe(429);
    expect(body.code).toBe("quota_exceeded");
    expect(body.quotaWindow).toBe("month");
    expect(body.quotaLimit).toBe(5_000);
    expect(body.quotaUsed).toBe(5_000);
  });
});

describe("POST /api/portfolio-copilot (Turnstile grant)", () => {
  it("requires Turnstile on the first copilot request and issues a grant cookie", async () => {
    const res = await POST(makePost({ message: "hello", turnstileToken: "tok-1" }));
    expect(res.status).toBe(200);
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledTimes(1);
    expect(mocks.verifyTurnstileToken.mock.calls[0][0].expectedAction).toBe("portfolio-copilot");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
  });

  it("skips Turnstile entirely on subsequent sends when a valid grant cookie is present", async () => {
    const res = await POST(makePost({ message: "second" }, cookieHeaderFor()));
    expect(res.status).toBe(200);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("requires Turnstile again when the portfolioId changes (different scope)", async () => {
    const res = await POST(makePost({
      portfolioId: "p2", message: "hi from another portfolio", turnstileToken: "tok-new",
    }, cookieHeaderFor()));
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
    expect(mocks.assertUserCanUseAI).not.toHaveBeenCalled();
    expect(mocks.getAIProviderById).not.toHaveBeenCalled();
  });

  it("returns 503 on provider failure but does NOT re-require Turnstile on the next attempt", async () => {
    mocks.answerPortfolioQuestion.mockRejectedValueOnce(new AIChatError("provider_unavailable", "down"));
    const failRes = await POST(makePost({ message: "first" }, cookieHeaderFor()));
    expect(failRes.status).toBe(503);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
    mocks.answerPortfolioQuestion.mockResolvedValue("retry answer");
    const retryRes = await POST(makePost({ message: "second" }, cookieHeaderFor()));
    expect(retryRes.status).toBe(200);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("issues the grant cookie when Turnstile passes even if the provider fails", async () => {
    mocks.answerPortfolioQuestion.mockRejectedValueOnce(new AIChatError("provider_unavailable", "down"));
    const res = await POST(makePost({ message: "first", turnstileToken: "tok-1" }));
    expect(res.status).toBe(503);
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledTimes(1);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=900");
  });

  it("returns 403 turnstile_failed when no grant and the token fails", async () => {
    mocks.verifyTurnstileToken.mockResolvedValueOnce({
      success: false, code: "invalid-input-response", message: "Turnstile verification failed.",
    });
    const res = await POST(makePost({ message: "hi", turnstileToken: "bad-token" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("turnstile_failed");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
