import { describe, expect, it, vi } from "vitest";

import { createRateLimiter } from "@/lib/security/rate-limit";

describe("createRateLimiter", () => {
  it("forwards every request and returns each consumer result without caching", async () => {
    const blocked = {
      allowed: false,
      remaining: 0,
      retryAfterMs: 15_000,
      resetsAt: "2026-04-04T12:01:00.000Z",
    };
    const allowed = { ...blocked, allowed: true, remaining: 2, retryAfterMs: undefined };
    const consume = vi.fn()
      .mockResolvedValueOnce(allowed)
      .mockResolvedValueOnce(blocked)
      .mockResolvedValueOnce(blocked);
    const options = {
      limiterKey: "test",
      windowMs: 60_000,
      maxRequests: 3,
      consume,
    };
    const limiter = createRateLimiter(options);

    await expect(limiter.check("user-1")).resolves.toEqual(allowed);
    await expect(limiter.check("user-2")).resolves.toEqual(blocked);
    await expect(limiter.check("user-1")).resolves.toEqual(blocked);

    expect(consume).toHaveBeenCalledTimes(3);
    for (const [index, key] of ["user-1", "user-2", "user-1"].entries()) {
      expect(consume).toHaveBeenNthCalledWith(index + 1, {
        key,
        limiterKey: options.limiterKey,
        windowMs: options.windowMs,
        maxRequests: options.maxRequests,
      });
    }
  });
});
