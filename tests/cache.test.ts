import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
let cache: typeof import("@/lib/services/cache");

beforeEach(async () => {
  vi.resetModules();
  cache = await import("@/lib/services/cache");
});

afterEach(() => vi.useRealTimers());

describe("server-side cache", () => {

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    cache.cacheSet("test-key", "value", 1000);
    expect(cache.cacheGet("test-key")).toBe("value");

    vi.advanceTimersByTime(1001);
    expect(cache.cacheGet("test-key")).toBeUndefined();
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

// Audit H10: the provider cache is bounded and deduplicates concurrent misses.

describe("cache bounds", () => {
  it("never grows past the cap under key churn, evicting the least recently used", () => {
    cache.cacheSet("h10:keep", "kept");
    for (let i = 0; i < cache.CACHE_MAX_ENTRIES * 3; i += 1) {
      if (i % 50 === 0) cache.cacheGet("h10:keep"); // keep touching one key
      cache.cacheSet(`h10:churn:${i}`, i);
    }
    expect(cache.cacheSize()).toBe(cache.CACHE_MAX_ENTRIES);
    expect(cache.cacheGet("h10:keep")).toBe("kept");
    expect(cache.cacheGet("h10:churn:0")).toBeUndefined();
    expect(cache.cacheGet(`h10:churn:${cache.CACHE_MAX_ENTRIES * 3 - 1}`)).toBe(cache.CACHE_MAX_ENTRIES * 3 - 1);
  });
});

describe("cached()", () => {
  it("shares one provider call between concurrent misses", async () => {
    let resolve: (value: string) => void = () => {};
    const fn = vi.fn(() => new Promise<string>((r) => { resolve = r; }));

    const calls = [cache.cached("h10:quote:AAPL", fn), cache.cached("h10:quote:AAPL", fn), cache.cached("h10:quote:AAPL", fn)];
    resolve("quote");

    expect(await Promise.all(calls)).toEqual(["quote", "quote", "quote"]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(await cache.cached("h10:quote:AAPL", fn)).toBe("quote");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures; the next call retries", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce("ok");

    const [first, second] = await Promise.allSettled([cache.cached("h10:flaky", fn), cache.cached("h10:flaky", fn)]);
    expect(first.status).toBe("rejected");
    expect(second.status).toBe("rejected");
    expect(fn).toHaveBeenCalledTimes(1);

    expect(await cache.cached("h10:flaky", fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
