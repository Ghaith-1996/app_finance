import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Reset env between tests
const envBackup: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  envBackup[key] = process.env[key];
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

describe("verifyTurnstileToken", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFetch.mockReset();
    restoreEnv();
    setEnv("TURNSTILE_SECRET_KEY", "test-secret-key");
  });

  async function loadModule() {
    return import("@/lib/security/turnstile");
  }

  // ---- Missing inputs ----

  it("returns missing-token when token is null", async () => {
    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({ token: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("missing-token");
      expect(result.message).toContain("verification is required");
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns missing-token when token is empty string", async () => {
    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({ token: "  " });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("missing-token");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns missing-token when token is undefined", async () => {
    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({ token: undefined });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("missing-token");
  });

  it("returns missing-secret when TURNSTILE_SECRET_KEY is not set", async () => {
    setEnv("TURNSTILE_SECRET_KEY", undefined);
    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({ token: "valid-token" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("missing-secret");
      expect(result.message).toContain("misconfigured");
    }
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ---- Successful verification ----

  it("returns success when Cloudflare confirms the token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        challenge_ts: "2026-03-26T12:00:00Z",
        hostname: "example.com",
        action: "article-chat",
        "error-codes": [],
      }),
    });

    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({
      token: "test-token",
      remoteIp: "1.2.3.4",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.challengeTs).toBe("2026-03-26T12:00:00Z");
      expect(result.hostname).toBe("example.com");
      expect(result.action).toBe("article-chat");
    }

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(options.method).toBe("POST");
    // Verify secret is sent but not logged
    const bodyStr = options.body as string;
    expect(bodyStr).toContain("secret=test-secret-key");
    expect(bodyStr).toContain("response=test-token");
    expect(bodyStr).toContain("remoteip=1.2.3.4");
  });

  // ---- Failed verification ----

  it("returns timeout-or-duplicate when token is reused", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        "error-codes": ["timeout-or-duplicate"],
      }),
    });

    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({ token: "duplicate-token" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("timeout-or-duplicate");
      expect(result.message).toContain("expired");
      expect(result.errorCodes).toContain("timeout-or-duplicate");
    }
  });

  it("returns invalid-input-response for a bad token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        "error-codes": ["invalid-input-response"],
      }),
    });

    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({ token: "bad-token" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("invalid-input-response");
      expect(result.message).toContain("failed");
    }
  });

  // ---- Network / upstream errors ----

  it("returns network-error when Siteverify returns non-200", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({ token: "some-token" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("network-error");
      expect(result.message).toContain("Could not verify");
    }
  });

  it("returns network-error when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("DNS failure"));

    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({ token: "some-token" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("network-error");
    }
  });

  it("returns network-error on abort/timeout", async () => {
    const abortErr = new DOMException("Aborted", "AbortError");
    mockFetch.mockRejectedValueOnce(abortErr);

    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({ token: "some-token" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.code).toBe("network-error");
    }
  });

  // ---- Action / hostname mismatch ----

  it("rejects when action does not match expected", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        challenge_ts: "2026-03-26T12:00:00Z",
        hostname: "example.com",
        action: "wrong-action",
      }),
    });

    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({
      token: "valid-token",
      expectedAction: "article-chat",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("bad-request");
  });

  it("rejects when hostname does not match expected", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        challenge_ts: "2026-03-26T12:00:00Z",
        hostname: "evil.com",
        action: "article-chat",
      }),
    });

    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({
      token: "valid-token",
      expectedHostname: "example.com",
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe("bad-request");
  });

  // ---- Passes when Cloudflare omits optional fields ----

  it("succeeds even when Cloudflare response omits optional fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { verifyTurnstileToken } = await loadModule();
    const result = await verifyTurnstileToken({ token: "token" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.challengeTs).toBe("");
      expect(result.hostname).toBe("");
      expect(result.action).toBe("");
    }
  });

  // ---- Idempotency key is forwarded ----

  it("includes idempotency_key in the request body when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const { verifyTurnstileToken } = await loadModule();
    await verifyTurnstileToken({
      token: "token",
      idempotencyKey: "idem-123",
    });

    const bodyStr = mockFetch.mock.calls[0][1].body as string;
    expect(bodyStr).toContain("idempotency_key=idem-123");
  });
});

describe("getClientIp", () => {
  it("extracts cf-connecting-ip first", async () => {
    const { getClientIp } = await import("@/lib/security/turnstile");
    const req = new Request("https://example.com", {
      headers: {
        "cf-connecting-ip": "10.0.0.1",
        "x-forwarded-for": "10.0.0.2, 10.0.0.3",
      },
    });
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("falls back to x-forwarded-for when cf-connecting-ip is absent", async () => {
    const { getClientIp } = await import("@/lib/security/turnstile");
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "10.0.0.2, 10.0.0.3" },
    });
    expect(getClientIp(req)).toBe("10.0.0.2");
  });

  it("returns null when no IP headers present", async () => {
    const { getClientIp } = await import("@/lib/security/turnstile");
    const req = new Request("https://example.com");
    expect(getClientIp(req)).toBeNull();
  });
});
