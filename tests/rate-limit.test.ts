import { describe, it, expect, beforeEach } from "vitest";
import { createRateLimiter } from "@/lib/security/rate-limit";

describe("createRateLimiter", () => {
  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3 });
  });

  it("allows requests up to the limit", () => {
    expect(limiter.check("user-1").allowed).toBe(true);
    expect(limiter.check("user-1").allowed).toBe(true);
    expect(limiter.check("user-1").allowed).toBe(true);
  });

  it("blocks requests past the limit", () => {
    limiter.check("user-1");
    limiter.check("user-1");
    limiter.check("user-1");
    const result = limiter.check("user-1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks users independently", () => {
    limiter.check("user-1");
    limiter.check("user-1");
    limiter.check("user-1");

    // user-1 is exhausted
    expect(limiter.check("user-1").allowed).toBe(false);
    // user-2 still has quota
    expect(limiter.check("user-2").allowed).toBe(true);
  });

  it("decrements remaining count", () => {
    expect(limiter.check("user-1").remaining).toBe(2);
    expect(limiter.check("user-1").remaining).toBe(1);
    expect(limiter.check("user-1").remaining).toBe(0);
  });

  it("resets after window expires", async () => {
    const shortLimiter = createRateLimiter({ windowMs: 50, maxRequests: 1 });
    shortLimiter.check("user-1");
    expect(shortLimiter.check("user-1").allowed).toBe(false);

    // Wait for window to expire
    await new Promise((r) => setTimeout(r, 60));
    expect(shortLimiter.check("user-1").allowed).toBe(true);
  });
});
