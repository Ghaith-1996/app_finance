import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseChatRequestBody } from "@/lib/security/chat-request";

// Audit H4: malformed chat bodies yield deliberate 4xx; quota infrastructure faults yield 503.

describe("parseChatRequestBody", () => {
  it.each([
    ["null body", null],
    ["array body", []],
    ["numeric message", { portfolioId: "p1", message: 42 }],
    ["null portfolioId", { portfolioId: null, message: "hi" }],
    ["object portfolioId", { portfolioId: { id: 1 }, message: "hi" }],
    ["numeric turnstile token", { portfolioId: "p1", message: "hi", turnstileToken: 7 }],
    ["blank message", { portfolioId: "p1", message: "   " }],
    ["oversized message", { portfolioId: "p1", message: "x".repeat(4001) }],
    ["bad id characters", { portfolioId: "p1;drop", message: "hi" }],
  ])("rejects %s", (_label, body) => {
    expect(parseChatRequestBody(body, { allowNewsItem: true }).ok).toBe(false);
  });

  it("rejects a newsItemId where the route does not accept one", () => {
    expect(parseChatRequestBody({ portfolioId: "p1", message: "hi", newsItemId: "n1" }, { allowNewsItem: false }).ok).toBe(false);
  });

  it("normalizes a valid body and drops malformed history entries", () => {
    const result = parseChatRequestBody(
      {
        portfolioId: " p1 ",
        message: " hello ",
        newsItemId: "n1",
        modelTier: "free",
        history: [null, 5, { role: "system", content: "x" }, { role: "user", content: " earlier " }],
      },
      { allowNewsItem: true },
    );
    expect(result).toEqual({
      ok: true,
      value: {
        portfolioId: "p1",
        newsItemId: "n1",
        message: "hello",
        modelTier: "free",
        history: [{ role: "user", content: "earlier" }],
        turnstileToken: undefined,
      },
    });
  });
});

const mocked = vi.hoisted(() => ({ assertUserCanUseAI: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      single: async () => ({ data: { id: "p1", user_id: "user-1" }, error: null }),
      maybeSingle: async () => ({ data: { id: "p1", user_id: "user-1" }, error: null }),
    };
    return {
      auth: { getUser: async () => ({ data: { user: { id: "user-1", email: "u@example.test" } }, error: null }) },
      from: () => builder,
    };
  },
}));
vi.mock("@/lib/security/turnstile", () => ({
  verifyTurnstileToken: async () => ({ success: true }),
  getClientIp: () => "127.0.0.1",
}));
vi.mock("@/lib/security/ai-access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/security/ai-access")>("@/lib/security/ai-access");
  return { ...actual, assertUserCanUseAI: mocked.assertUserCanUseAI, releaseAIUsage: async () => undefined };
});

import { POST as copilotPost } from "@/app/api/portfolio-copilot/route";

describe("chat routes (H4)", () => {
  beforeEach(() => mocked.assertUserCanUseAI.mockReset());

  it("returns 400 for a non-object JSON body instead of throwing", async () => {
    const res = await copilotPost(
      new Request("http://localhost/api/portfolio-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 503 when the quota service itself fails", async () => {
    mocked.assertUserCanUseAI.mockRejectedValueOnce(new Error("connection refused"));
    const res = await copilotPost(
      new Request("http://localhost/api/portfolio-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portfolioId: "p1", message: "hi", turnstileToken: "t" }),
      }),
    );
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("usage_check_unavailable");
  });
});
