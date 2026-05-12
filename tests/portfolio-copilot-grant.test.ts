import { beforeEach, describe, expect, it, vi } from "vitest";

import { AIChatError } from "@/lib/services/ai/ai-chat-errors";

// ---------------------------------------------------------------------------
// Turnstile + AI/billing mocks — hoisted so the `vi.mock(...)` factories
// (which vitest hoists above imports) can reference them safely.
// ---------------------------------------------------------------------------
const {
  mockVerifyTurnstileToken,
  mockAnswerPortfolioQuestion,
  mockAssertUserCanUseAI,
} = vi.hoisted(() => ({
  mockVerifyTurnstileToken: vi.fn().mockResolvedValue({ success: true }),
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
      answerPortfolioQuestion: mockAnswerPortfolioQuestion,
    }),
  };
});

function createSupabaseMock() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from(table: string) {
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
      if (table === "portfolios") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: { id: "p1", name: "P" },
                  error: null,
                }),
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
      if (table === "portfolio_insights") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "feed_items") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
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
      throw new Error(`unexpected table ${table}`);
    },
  };
}

let currentSupabase: ReturnType<typeof createSupabaseMock>;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => currentSupabase,
}));

import { POST } from "@/app/api/portfolio-copilot/route";
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
  return new Request("http://localhost/api/portfolio-copilot", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/portfolio-copilot (Turnstile grant)", () => {
  beforeEach(() => {
    currentSupabase = createSupabaseMock();
    mockVerifyTurnstileToken.mockReset();
    mockVerifyTurnstileToken.mockResolvedValue({ success: true });
    mockAnswerPortfolioQuestion.mockReset();
    mockAssertUserCanUseAI.mockReset();
    mockAssertUserCanUseAI.mockResolvedValue(undefined);
    mockAnswerPortfolioQuestion.mockResolvedValue("answer");
    process.env.TURNSTILE_SECRET_KEY = "test-secret-key";
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_USER_EMAILS;
  });

  it("requires Turnstile on the first copilot request and issues a grant cookie", async () => {
    const req = makePost({
      portfolioId: "p1",
      message: "hello",
      turnstileToken: "tok-1",
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockVerifyTurnstileToken).toHaveBeenCalledTimes(1);
    const call = mockVerifyTurnstileToken.mock.calls[0][0];
    expect(call.expectedAction).toBe("portfolio-copilot");

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie!).toContain("HttpOnly");
    expect(setCookie!).toContain("SameSite=Lax");
  });

  it("skips Turnstile entirely on subsequent sends when a valid grant cookie is present", async () => {
    const scope: ChatGrantScope = {
      userId: "user-1",
      surface: "portfolio-copilot",
      portfolioId: "p1",
    };

    const req = makePost(
      {
        portfolioId: "p1",
        message: "second",
      },
      cookieHeaderFor(scope),
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("requires Turnstile again when the portfolioId changes (different scope)", async () => {
    const scope: ChatGrantScope = {
      userId: "user-1",
      surface: "portfolio-copilot",
      portfolioId: "p1",
    };

    const req = makePost(
      {
        portfolioId: "p2",
        message: "hi from another portfolio",
        turnstileToken: "tok-new",
      },
      cookieHeaderFor(scope),
    );

    const res = await POST(req);
    // portfolio p2 isn't in the mock -> we'll hit 404; what matters is that
    // Turnstile was still invoked because the grant for p1 doesn't cover p2.
    expect(mockVerifyTurnstileToken).toHaveBeenCalledTimes(1);
    expect([200, 404]).toContain(res.status);
  });

  it("returns 503 on provider failure but does NOT re-require Turnstile on the next attempt", async () => {
    const scope: ChatGrantScope = {
      userId: "user-1",
      surface: "portfolio-copilot",
      portfolioId: "p1",
    };

    mockAnswerPortfolioQuestion.mockRejectedValueOnce(
      new AIChatError("provider_unavailable", "down"),
    );

    const failingReq = makePost(
      {
        portfolioId: "p1",
        message: "first",
      },
      cookieHeaderFor(scope),
    );

    const failRes = await POST(failingReq);
    expect(failRes.status).toBe(503);
    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();

    // Next try succeeds — still no Turnstile.
    mockAnswerPortfolioQuestion.mockResolvedValue("retry answer");
    const retryReq = makePost(
      {
        portfolioId: "p1",
        message: "second",
      },
      cookieHeaderFor(scope),
    );
    const retryRes = await POST(retryReq);
    expect(retryRes.status).toBe(200);
    expect(mockVerifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("issues the grant cookie when Turnstile passes even if the provider fails", async () => {
    mockAnswerPortfolioQuestion.mockRejectedValueOnce(
      new AIChatError("provider_unavailable", "down"),
    );

    const req = makePost({
      portfolioId: "p1",
      message: "first",
      turnstileToken: "tok-1",
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    expect(mockVerifyTurnstileToken).toHaveBeenCalledTimes(1);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=900");
  });

  it("returns 403 turnstile_failed when no grant and the token fails", async () => {
    mockVerifyTurnstileToken.mockResolvedValueOnce({
      success: false,
      code: "invalid-input-response",
      message: "Turnstile verification failed.",
    });

    const req = makePost({
      portfolioId: "p1",
      message: "hi",
      turnstileToken: "bad-token",
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("turnstile_failed");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
