import { beforeEach, describe, expect, it } from "vitest";

import { createRateLimiter } from "@/lib/security/rate-limit";

function createSharedConsumer() {
  const store = new Map<string, { count: number; windowStart: number }>();

  return async ({
    key,
    limiterKey,
    windowMs,
    maxRequests,
  }: {
    key: string;
    limiterKey: string;
    windowMs: number;
    maxRequests: number;
  }) => {
    const now = Date.now();
    const storeKey = `${limiterKey}:${key}`;
    const entry = store.get(storeKey);

    if (!entry || now - entry.windowStart >= windowMs) {
      store.set(storeKey, { count: 1, windowStart: now });
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetsAt: new Date(now + windowMs).toISOString(),
      };
    }

    if (entry.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: windowMs - (now - entry.windowStart),
        resetsAt: new Date(entry.windowStart + windowMs).toISOString(),
      };
    }

    entry.count += 1;
    return {
      allowed: true,
      remaining: maxRequests - entry.count,
      resetsAt: new Date(entry.windowStart + windowMs).toISOString(),
    };
  };
}

describe("createRateLimiter", () => {
  let limiter: ReturnType<typeof createRateLimiter>;
  let secondaryLimiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    const consume = createSharedConsumer();
    limiter = createRateLimiter({
      limiterKey: "test",
      windowMs: 60_000,
      maxRequests: 3,
      consume,
    });
    secondaryLimiter = createRateLimiter({
      limiterKey: "test",
      windowMs: 60_000,
      maxRequests: 3,
      consume,
    });
  });

  it("allows requests up to the limit", async () => {
    expect((await limiter.check("user-1")).allowed).toBe(true);
    expect((await limiter.check("user-1")).allowed).toBe(true);
    expect((await limiter.check("user-1")).allowed).toBe(true);
  });

  it("blocks requests past the limit", async () => {
    await limiter.check("user-1");
    await limiter.check("user-1");
    await limiter.check("user-1");
    const result = await limiter.check("user-1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks users independently", async () => {
    await limiter.check("user-1");
    await limiter.check("user-1");
    await limiter.check("user-1");

    expect((await limiter.check("user-1")).allowed).toBe(false);
    expect((await limiter.check("user-2")).allowed).toBe(true);
  });

  it("decrements remaining count", async () => {
    expect((await limiter.check("user-1")).remaining).toBe(2);
    expect((await limiter.check("user-1")).remaining).toBe(1);
    expect((await limiter.check("user-1")).remaining).toBe(0);
  });

  it("shares limiter state across instances backed by the same store", async () => {
    await limiter.check("user-1");
    await secondaryLimiter.check("user-1");
    await limiter.check("user-1");

    const result = await secondaryLimiter.check("user-1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window expires", async () => {
    const consume = createSharedConsumer();
    const shortLimiter = createRateLimiter({
      limiterKey: "short",
      windowMs: 50,
      maxRequests: 1,
      consume,
    });

    await shortLimiter.check("user-1");
    expect((await shortLimiter.check("user-1")).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect((await shortLimiter.check("user-1")).allowed).toBe(true);
  });
});
