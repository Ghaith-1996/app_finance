import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock Turnstile verification — controls all protected routes/actions
// ---------------------------------------------------------------------------
const mockVerifyTurnstileToken = vi.fn();

vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: (...args: unknown[]) => mockVerifyTurnstileToken(...args),
  getClientIp: () => "127.0.0.1",
}));

// ---------------------------------------------------------------------------
// article-chat route mocks
// ---------------------------------------------------------------------------
const mockAnswerArticleQuestion = vi.fn();
const mockAnswerPortfolioQuestion = vi.fn();
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
    getAIProvider: () => ({
      answerPortfolioQuestion: mockAnswerPortfolioQuestion,
    }),
  };
});

vi.mock("@/lib/services/portfolio", () => ({
  computePortfolioOverview: vi.fn().mockResolvedValue({
    totalValue: 100000,
    dayChange: 500,
    lastAnalyzedAt: null,
    coverage: "Moderate",
    primaryGoal: "Growth",
  }),
}));

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-1", user_metadata: {}, email: "u@x.com" } },
      error: null,
    }),
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: "p1", name: "My Portfolio" }, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockSupabase),
}));

// ---------------------------------------------------------------------------
// Turnstile helpers
// ---------------------------------------------------------------------------
function turnstilePass() {
  mockVerifyTurnstileToken.mockResolvedValue({
    success: true,
    challengeTs: "2026-03-26T12:00:00Z",
    hostname: "example.com",
    action: "",
  });
}

function turnstileFail(code = "invalid-input-response") {
  mockVerifyTurnstileToken.mockResolvedValue({
    success: false,
    code,
    message: "Bot verification failed. Please try again.",
  });
}

// ---------------------------------------------------------------------------
// Tests: article-chat route
// ---------------------------------------------------------------------------
describe("POST /api/article-chat — Turnstile gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnswerArticleQuestion.mockReset();
    mockAnswerPortfolioQuestion.mockReset();
  });

  async function callRoute(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/article-chat/route");
    const req = new Request("http://localhost/api/article-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it("rejects when turnstileToken is missing", async () => {
    turnstileFail("missing-input-response");

    const res = await callRoute({
      portfolioId: "p1",
      message: "Hello",
      modelTier: "free",
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("turnstile_failed");
    expect(mockAnswerArticleQuestion).not.toHaveBeenCalled();
  });

  it("rejects when turnstileToken is invalid", async () => {
    turnstileFail("invalid-input-response");

    const res = await callRoute({
      portfolioId: "p1",
      message: "Hello",
      modelTier: "free",
      turnstileToken: "bad-token",
    });

    expect(res.status).toBe(403);
    expect(mockAnswerArticleQuestion).not.toHaveBeenCalled();
  });

  it("proceeds when turnstileToken is valid", async () => {
    turnstilePass();
    mockAnswerPortfolioQuestion.mockResolvedValue("AI says hello");

    const res = await callRoute({
      portfolioId: "p1",
      message: "Hello",
      modelTier: "free",
      turnstileToken: "valid-token",
    });

    // The route may error on DB issues downstream, but it should pass the Turnstile gate
    expect(res.status).not.toBe(403);
    expect(mockVerifyTurnstileToken).toHaveBeenCalledWith({
      token: "valid-token",
      remoteIp: "127.0.0.1",
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: portfolio-copilot route
// ---------------------------------------------------------------------------
describe("POST /api/portfolio-copilot — Turnstile gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnswerPortfolioQuestion.mockReset();
  });

  async function callRoute(body: Record<string, unknown>) {
    const { POST } = await import("@/app/api/portfolio-copilot/route");
    const req = new Request("http://localhost/api/portfolio-copilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return POST(req);
  }

  it("rejects when turnstileToken is missing", async () => {
    turnstileFail("missing-input-response");

    const res = await callRoute({
      portfolioId: "p1",
      message: "What is my risk?",
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("turnstile_failed");
    expect(mockAnswerPortfolioQuestion).not.toHaveBeenCalled();
  });

  it("proceeds when turnstileToken is valid", async () => {
    turnstilePass();
    mockAnswerPortfolioQuestion.mockResolvedValue("risk is moderate");

    const res = await callRoute({
      portfolioId: "p1",
      message: "What is my risk?",
      turnstileToken: "valid-token",
    });

    expect(res.status).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Tests: community createPost server action
// ---------------------------------------------------------------------------
describe("createPost — Turnstile gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects post creation when Turnstile fails", async () => {
    turnstileFail();

    const { createPost } = await import("@/lib/actions/community");
    const result = await createPost("Hello world $AAPL", "bad-token");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("verification failed");
  });

  it("allows post creation when Turnstile passes", async () => {
    turnstilePass();

    // Make supabase mock return a valid post
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "community_posts") {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "post-1", user_id: "user-1", body: "Hello", created_at: new Date().toISOString() },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "community_post_tickers") {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === "user_profiles") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const { createPost } = await import("@/lib/actions/community");
    const result = await createPost("Hello world", "valid-token");

    // Should have attempted the action (not blocked at Turnstile)
    expect(mockVerifyTurnstileToken).toHaveBeenCalledWith({ token: "valid-token" });
    // It may succeed or fail on DB mock details, but shouldn't fail on Turnstile
    if (!result.ok) {
      expect(result.error).not.toContain("verification");
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: community createComment server action
// ---------------------------------------------------------------------------
describe("createComment — Turnstile gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects comment creation when Turnstile fails", async () => {
    turnstileFail();

    const { createComment } = await import("@/lib/actions/community");
    const result = await createComment("post-1", "Nice post!", "bad-token");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("verification failed");
  });
});
