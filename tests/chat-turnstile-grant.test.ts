import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

const envBackup: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  if (!(key in envBackup)) {
    envBackup[key] = process.env[key];
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function restoreEnv() {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function loadModule() {
  return import("@/lib/security/chat-turnstile-grant");
}

describe("chat-turnstile-grant", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    restoreEnv();
    setEnv("TURNSTILE_SECRET_KEY", "test-secret-key");
    setEnv("NODE_ENV", "test");
  });

  // -------------------------------------------------------------------------
  // Cookie name derivation
  // -------------------------------------------------------------------------

  it("uses one cookie name per user and portfolio across chat surfaces", async () => {
    const { chatGrantCookieName } = await loadModule();

    const story = chatGrantCookieName({
      userId: "user-1",
      surface: "article-chat",
      portfolioId: "p-1",
      newsItemId: "n-1",
    });
    const otherStory = chatGrantCookieName({
      userId: "user-1",
      surface: "article-chat",
      portfolioId: "p-1",
      newsItemId: "n-2",
    });
    const general = chatGrantCookieName({
      userId: "user-1",
      surface: "article-chat-general",
      portfolioId: "p-1",
    });
    const copilot = chatGrantCookieName({
      userId: "user-1",
      surface: "portfolio-copilot",
      portfolioId: "p-1",
    });
    const otherUser = chatGrantCookieName({
      userId: "user-2",
      surface: "article-chat",
      portfolioId: "p-1",
      newsItemId: "n-1",
    });
    const otherPortfolio = chatGrantCookieName({
      userId: "user-1",
      surface: "article-chat",
      portfolioId: "p-2",
      newsItemId: "n-1",
    });

    expect(story).toBe(otherStory);
    expect(story).toBe(general);
    expect(story).toBe(copilot);
    expect(story).not.toBe(otherUser);
    expect(story).not.toBe(otherPortfolio);
    expect(story.startsWith("cv_")).toBe(true);
  });

  it("produces a stable name for the same scope across calls", async () => {
    const { chatGrantCookieName } = await loadModule();
    const scope = {
      userId: "user-1",
      surface: "portfolio-copilot" as const,
      portfolioId: "p-1",
    };
    expect(chatGrantCookieName(scope)).toBe(chatGrantCookieName(scope));
  });

  // -------------------------------------------------------------------------
  // Cookie value signing / validation
  // -------------------------------------------------------------------------

  it("validates a freshly minted grant value for the exact same scope", async () => {
    const { buildChatGrantCookieValue, hasValidChatGrantValue } =
      await loadModule();

    const scope = {
      userId: "u1",
      surface: "article-chat" as const,
      portfolioId: "p1",
      newsItemId: "n1",
    };
    const value = buildChatGrantCookieValue(scope);
    expect(hasValidChatGrantValue(value, scope)).toBe(true);
  });

  it("rejects a grant value whose signature has been altered", async () => {
    const { buildChatGrantCookieValue, hasValidChatGrantValue } =
      await loadModule();

    const scope = {
      userId: "u1",
      surface: "article-chat" as const,
      portfolioId: "p1",
      newsItemId: "n1",
    };
    const value = buildChatGrantCookieValue(scope);
    // Flip the last character of the signature portion.
    const parts = value.split(".");
    const sig = parts[1];
    const tampered =
      parts[0] +
      "." +
      sig.slice(0, -1) +
      (sig.slice(-1) === "A" ? "B" : "A");

    expect(hasValidChatGrantValue(tampered, scope)).toBe(false);
  });

  it("rejects a grant value when the userId in the scope changes", async () => {
    const { buildChatGrantCookieValue, hasValidChatGrantValue } =
      await loadModule();

    const value = buildChatGrantCookieValue({
      userId: "alice",
      surface: "portfolio-copilot",
      portfolioId: "p1",
    });
    expect(
      hasValidChatGrantValue(value, {
        userId: "eve",
        surface: "portfolio-copilot",
        portfolioId: "p1",
      }),
    ).toBe(false);
  });

  it("accepts a grant across chat surfaces but rejects another portfolio", async () => {
    const { buildChatGrantCookieValue, hasValidChatGrantValue } =
      await loadModule();

    const value = buildChatGrantCookieValue({
      userId: "u1",
      surface: "article-chat-general",
      portfolioId: "p1",
    });
    expect(
      hasValidChatGrantValue(value, {
        userId: "u1",
        surface: "portfolio-copilot",
        portfolioId: "p1",
      }),
    ).toBe(true);
    expect(
      hasValidChatGrantValue(value, {
        userId: "u1",
        surface: "article-chat-general",
        portfolioId: "p2",
      }),
    ).toBe(false);
  });

  it("accepts a story-chat grant when the newsItemId changes in the same portfolio", async () => {
    const { buildChatGrantCookieValue, hasValidChatGrantValue } =
      await loadModule();

    const value = buildChatGrantCookieValue({
      userId: "u1",
      surface: "article-chat",
      portfolioId: "p1",
      newsItemId: "story-A",
    });
    expect(
      hasValidChatGrantValue(value, {
        userId: "u1",
        surface: "article-chat",
        portfolioId: "p1",
        newsItemId: "story-B",
      }),
    ).toBe(true);
  });

  it("expires a grant after the 15-minute verification window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T12:00:00.000Z"));

    const {
      buildChatGrantCookieValue,
      hasValidChatGrantValue,
    } = await loadModule();
    const scope = {
      userId: "u1",
      surface: "portfolio-copilot" as const,
      portfolioId: "p1",
    };
    const value = buildChatGrantCookieValue(scope);

    vi.setSystemTime(new Date("2026-03-25T12:14:59.000Z"));
    expect(hasValidChatGrantValue(value, scope)).toBe(true);

    vi.setSystemTime(new Date("2026-03-25T12:15:01.000Z"));
    expect(hasValidChatGrantValue(value, scope)).toBe(false);

    vi.useRealTimers();
  });

  it("rejects malformed, empty, and wrong-version grant values", async () => {
    const { hasValidChatGrantValue } = await loadModule();

    const scope = {
      userId: "u1",
      surface: "article-chat" as const,
      portfolioId: "p1",
      newsItemId: "n1",
    };
    expect(hasValidChatGrantValue(undefined, scope)).toBe(false);
    expect(hasValidChatGrantValue(null, scope)).toBe(false);
    expect(hasValidChatGrantValue("", scope)).toBe(false);
    expect(hasValidChatGrantValue("not-a-grant", scope)).toBe(false);
    expect(hasValidChatGrantValue("v9.somesig", scope)).toBe(false);
  });

  it("rejects all grant values when TURNSTILE_SECRET_KEY is missing", async () => {
    // First mint a real grant with the key set.
    const {
      buildChatGrantCookieValue,
      hasValidChatGrantValue,
    } = await loadModule();
    const scope = {
      userId: "u1",
      surface: "portfolio-copilot" as const,
      portfolioId: "p1",
    };
    const value = buildChatGrantCookieValue(scope);
    expect(hasValidChatGrantValue(value, scope)).toBe(true);

    // Now reload the module without the key; even a valid cookie string should
    // fail closed.
    setEnv("TURNSTILE_SECRET_KEY", undefined);
    vi.resetModules();
    const reloaded = await loadModule();
    expect(reloaded.hasValidChatGrantValue(value, scope)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Request-based helpers
  // -------------------------------------------------------------------------

  function makeRequest(cookieHeader: string | null): Request {
    const headers = new Headers();
    if (cookieHeader !== null) headers.set("cookie", cookieHeader);
    return new Request("https://example.com/api/article-chat", {
      method: "POST",
      headers,
    });
  }

  it("reads a grant out of a Cookie header and validates it", async () => {
    const {
      buildChatGrantCookieValue,
      chatGrantCookieName,
      hasValidChatGrantCookie,
    } = await loadModule();

    const scope = {
      userId: "u1",
      surface: "article-chat" as const,
      portfolioId: "p1",
      newsItemId: "n1",
    };
    const name = chatGrantCookieName(scope);
    const value = buildChatGrantCookieValue(scope);

    const req = makeRequest(`${name}=${encodeURIComponent(value)}; other=xyz`);
    expect(hasValidChatGrantCookie(req, scope)).toBe(true);
  });

  it("ignores other cookie entries and rejects when the grant is absent", async () => {
    const { hasValidChatGrantCookie, chatGrantRequired } = await loadModule();

    const scope = {
      userId: "u1",
      surface: "article-chat" as const,
      portfolioId: "p1",
      newsItemId: "n1",
    };
    const req = makeRequest("session=abc; cart=1");
    expect(hasValidChatGrantCookie(req, scope)).toBe(false);
    expect(chatGrantRequired(req, scope)).toBe(true);
  });

  it("chatGrantRequired returns false once a valid grant cookie is present", async () => {
    const {
      buildChatGrantCookieValue,
      chatGrantCookieName,
      chatGrantRequired,
    } = await loadModule();

    const scope = {
      userId: "u1",
      surface: "portfolio-copilot" as const,
      portfolioId: "p1",
    };
    const req = makeRequest(
      `${chatGrantCookieName(scope)}=${encodeURIComponent(buildChatGrantCookieValue(scope))}`,
    );
    expect(chatGrantRequired(req, scope)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Set-Cookie serialization
  // -------------------------------------------------------------------------

  it("builds a 15-minute Set-Cookie header with secure flag only in production", async () => {
    const { buildChatGrantSetCookieHeader } = await loadModule();
    const scope = {
      userId: "u1",
      surface: "article-chat-general" as const,
      portfolioId: "p1",
    };
    const header = buildChatGrantSetCookieHeader(scope);

    expect(header).toContain("Path=/");
    expect(header).toContain("Max-Age=900");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).not.toMatch(/Expires/i);
    // Not production -> no Secure attribute
    expect(header).not.toContain("Secure");
  });

  it("adds the Secure attribute to the Set-Cookie header in production", async () => {
    setEnv("NODE_ENV", "production");
    vi.resetModules();
    const { buildChatGrantSetCookieHeader } = await loadModule();
    const header = buildChatGrantSetCookieHeader({
      userId: "u1",
      surface: "article-chat" as const,
      portfolioId: "p1",
      newsItemId: "n1",
    });
    expect(header).toContain("Secure");
  });

  // -------------------------------------------------------------------------
  // Cookie header parsing
  // -------------------------------------------------------------------------

  it("parseCookieHeader handles empty / null input", async () => {
    const { parseCookieHeader } = await loadModule();
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader("")).toEqual({});
  });

  it("parseCookieHeader splits on ';' and decodes values", async () => {
    const { parseCookieHeader } = await loadModule();
    const parsed = parseCookieHeader("a=1; b=hello%20world; c=%2Fx");
    expect(parsed).toEqual({ a: "1", b: "hello world", c: "/x" });
  });
});
