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
const mockAssertUserCanUseAI = vi.fn().mockResolvedValue(undefined);
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

vi.mock("@/lib/security/ai-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security/ai-access")>(
    "@/lib/security/ai-access",
  );
  return {
    ...actual,
    assertUserCanUseAI: (...args: unknown[]) => mockAssertUserCanUseAI(...args),
  };
});

vi.mock("@/lib/security/rate-limit", () => ({
  communityPostLimiter: {
    check: vi.fn(),
  },
  communityCommentLimiter: {
    check: vi.fn(),
  },
}));

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-1", user_metadata: {}, email: "u@x.com" } },
      error: null,
    }),
  },
  from: vi.fn(),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockSupabase),
}));

// ---------------------------------------------------------------------------
// Turnstile helpers
// ---------------------------------------------------------------------------
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
    mockAssertUserCanUseAI.mockResolvedValue(undefined);
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
});

// ---------------------------------------------------------------------------
// Tests: portfolio-copilot route
// ---------------------------------------------------------------------------
describe("POST /api/portfolio-copilot — Turnstile gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnswerPortfolioQuestion.mockReset();
    mockAssertUserCanUseAI.mockResolvedValue(undefined);
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
