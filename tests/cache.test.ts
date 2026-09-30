import { beforeEach, describe, expect, it, vi } from "vitest";
let cache: typeof import("@/lib/services/cache");

describe("server-side cache", () => {
  beforeEach(async () => {
    vi.resetModules();
    cache = await import("@/lib/services/cache");
  });

  it("returns undefined for missing keys", () => {
    expect(cache.cacheGet("nonexistent")).toBeUndefined();
  });

  it("stores and retrieves values", () => {
    cache.cacheSet("test-key", { a: 1 });
    expect(cache.cacheGet("test-key")).toEqual({ a: 1 });
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    cache.cacheSet("test-key", "value", 1000);
    expect(cache.cacheGet("test-key")).toBe("value");

    vi.advanceTimersByTime(1001);
    expect(cache.cacheGet("test-key")).toBeUndefined();
    vi.useRealTimers();
  });

  it("cached() returns stored value on hit", async () => {
    const fn = vi.fn().mockResolvedValue("fresh");
    cache.cacheSet("fn-key", "cached-val", 60_000);

    const result = await cache.cached("fn-key", fn, 60_000);
    expect(result).toBe("cached-val");
    expect(fn).not.toHaveBeenCalled();
  });

  it("cached() calls fn on miss and stores result", async () => {
    const fn = vi.fn().mockResolvedValue("computed");

    const result = await cache.cached("fn-key", fn, 60_000);
    expect(result).toBe("computed");
    expect(fn).toHaveBeenCalledOnce();
    expect(cache.cacheGet("fn-key")).toBe("computed");
  });
});
