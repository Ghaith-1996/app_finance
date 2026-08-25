import { beforeEach, describe, expect, it, vi } from "vitest";
import { BillingAccessError } from "@/lib/billing/subscriptions";
import { AIUsageAccessError } from "@/lib/security/ai-access";
import { portfolioCopilotPrompt } from "@/lib/services/ai/prompts";

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue({ success: true }),
  getClientIp: () => "127.0.0.1",
}));

const mockAnswerPortfolioQuestion = vi.fn();
const mockAssertUserCanUseAI = vi.fn();
const mockComputePortfolioOverview = vi.fn().mockResolvedValue({
  totalValue: 85000,
  dayChange: 920,
  lastAnalyzedAt: new Date().toISOString(),
  coverage: "Balanced",
  primaryGoal: "Compound capital",
});
const mockGetAIProviderById = vi.fn(
  (_id: "azure" | "anthropic" | "openai" | "openrouter" | "mistral") => ({
    answerPortfolioQuestion: mockAnswerPortfolioQuestion,
  }),
);

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
  const actual = await vi.importActual<typeof import("@/lib/services/ai")>(
    "@/lib/services/ai",
  );
  return {
    ...actual,
    getAIProviderById: (id: "azure" | "anthropic" | "openai" | "openrouter" | "mistral") =>
      mockGetAIProviderById(id),
  };
});

function createSupabaseMock(opts: {
  currentPlan?: "free" | "premium" | "ultimate";
  watchlistSymbols?: string[];
}) {
  const currentPeriodEnd = new Date(Date.now() + 86_400_000).toISOString();
  const watchlistSymbols = opts.watchlistSymbols ?? [];
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
            status: "active",
            current_period_start: new Date().toISOString(),
            current_period_end: currentPeriodEnd,
            cancel_at_period_end: false,
            canceled_at: null,
            trial_start: null,
            trial_end: null,
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
      if (table === "portfolios") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: { id: "p1", name: "My Portfolio" }, error: null }),
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
      if (table === "watchlist_items") {
        return {
          select: () => ({
            eq: async (column: string, value: unknown) => ({
              data:
                column === "user_id" && value === "user-1"
                  ? watchlistSymbols.map((symbol) => ({ symbol }))
                  : [],
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

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => currentSupabase,
}));

import { POST } from "@/app/api/portfolio-copilot/route";

describe("POST /api/portfolio-copilot", () => {
  beforeEach(() => {
    mockAnswerPortfolioQuestion.mockReset();
    mockAssertUserCanUseAI.mockReset();
    mockAssertUserCanUseAI.mockResolvedValue(undefined);
    mockComputePortfolioOverview.mockClear();
    mockGetAIProviderById.mockClear();
    currentSupabase = createSupabaseMock({});
    delete process.env.ADMIN_USER_IDS;
    delete process.env.ADMIN_USER_EMAILS;
  });

  it("defaults to the free tier when modelTier is omitted", async () => {
    mockAnswerPortfolioQuestion.mockResolvedValue("OpenRouter answer");

    const req = new Request("http://localhost/api/portfolio-copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        message: "What should I watch?",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockGetAIProviderById).toHaveBeenCalledWith("openrouter");
  });

  it("passes the authenticated user's watchlist to the copilot prompt", async () => {
    currentSupabase = createSupabaseMock({ watchlistSymbols: ["NVDA", " msft "] });
    mockAnswerPortfolioQuestion.mockImplementation((context) =>
      portfolioCopilotPrompt(context).user,
    );

    const req = new Request("http://localhost/api/portfolio-copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        message: "What should I watch next?",
        watchlistSymbols: ["OTHER_USER_SYMBOL"],
      }),
    });

    const res = await POST(req);
    const body = (await res.json()) as { answer?: string };

    expect(res.status).toBe(200);
    expect(body.answer).toContain("WATCHLIST\nNVDA, MSFT");
    expect(body.answer).not.toContain("OTHER_USER_SYMBOL");
    expect(mockAnswerPortfolioQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ watchlistSymbols: ["NVDA", "MSFT"] }),
    );
  });

  it("keeps an empty authenticated watchlist as an empty copilot context", async () => {
    currentSupabase = createSupabaseMock({ watchlistSymbols: [] });
    mockAnswerPortfolioQuestion.mockImplementation((context) =>
      portfolioCopilotPrompt(context).user,
    );

    const req = new Request("http://localhost/api/portfolio-copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        message: "What should I watch next?",
        watchlistSymbols: ["OTHER_USER_SYMBOL"],
      }),
    });

    const res = await POST(req);
    const body = (await res.json()) as { answer?: string };

    expect(res.status).toBe(200);
    expect(body.answer).toContain("WATCHLIST\nNo watchlist symbols connected.");
    expect(body.answer).not.toContain("OTHER_USER_SYMBOL");
    expect(mockAnswerPortfolioQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ watchlistSymbols: [] }),
    );
  });

  it("rejects premium requests for free users", async () => {
    mockAssertUserCanUseAI.mockRejectedValue(
      new BillingAccessError({
        currentPlan: "free",
        requiredPlan: "premium",
        requestedTier: "premium",
      }),
    );

    const req = new Request("http://localhost/api/portfolio-copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        message: "What should I watch?",
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

  it("uses the premium provider for premium users", async () => {
    mockAnswerPortfolioQuestion.mockResolvedValue("Mistral answer");

    const req = new Request("http://localhost/api/portfolio-copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        message: "What should I watch?",
        modelTier: "premium",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockGetAIProviderById).toHaveBeenCalledWith("mistral");
  });

  it("uses the ultimate provider for ultimate users", async () => {
    mockAnswerPortfolioQuestion.mockResolvedValue("Azure answer");

    const req = new Request("http://localhost/api/portfolio-copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        message: "What should I watch?",
        modelTier: "ultimate",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockGetAIProviderById).toHaveBeenCalledWith("azure");
  });

  it("allows admin users to request the ultimate provider without a paid plan", async () => {
    mockAnswerPortfolioQuestion.mockResolvedValue("Admin Azure answer");

    const req = new Request("http://localhost/api/portfolio-copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        message: "Give me the strongest answer",
        modelTier: "ultimate",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockGetAIProviderById).toHaveBeenCalledWith("azure");
  });

  it("returns 429 with retry metadata when the durable burst limit is hit", async () => {
    mockAssertUserCanUseAI.mockRejectedValue(
      new AIUsageAccessError({
        code: "rate_limited",
        message: "Too many requests. Please wait a moment.",
        retryAfterMs: 10_000,
        resetsAt: "2026-04-04T12:01:00.000Z",
      }),
    );

    const req = new Request("http://localhost/api/portfolio-copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        message: "What should I watch?",
      }),
    });

    const res = await POST(req);
    const body = (await res.json()) as { code?: string; retryAfterMs?: number };
    expect(res.status).toBe(429);
    expect(body.code).toBe("rate_limited");
    expect(body.retryAfterMs).toBe(10_000);
  });

  it("returns 429 with quota metadata when the durable quota is exhausted", async () => {
    mockAssertUserCanUseAI.mockRejectedValue(
      new AIUsageAccessError({
        code: "quota_exceeded",
        message: "You have reached your AI usage limit for the current billing window.",
        quotaWindow: "month",
        quotaLimit: 5_000,
        quotaUsed: 5_000,
        resetsAt: "2026-05-01T04:00:00.000Z",
      }),
    );

    const req = new Request("http://localhost/api/portfolio-copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolioId: "p1",
        message: "What should I watch?",
        modelTier: "premium",
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
    expect(body.quotaWindow).toBe("month");
    expect(body.quotaLimit).toBe(5_000);
    expect(body.quotaUsed).toBe(5_000);
  });
});
