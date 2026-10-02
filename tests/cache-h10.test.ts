import { describe, expect, it, vi } from "vitest";

import { CACHE_MAX_ENTRIES, cacheGet, cacheSet, cacheSize, cached } from "@/lib/services/cache";

// Audit H10: the provider cache is bounded and deduplicates concurrent misses.

describe("cache bounds", () => {
  it("never grows past the cap under key churn, evicting the least recently used", () => {
    cacheSet("h10:keep", "kept");
    for (let i = 0; i < CACHE_MAX_ENTRIES * 3; i += 1) {
      if (i % 50 === 0) cacheGet("h10:keep"); // keep touching one key
      cacheSet(`h10:churn:${i}`, i);
    }
    expect(cacheSize()).toBe(CACHE_MAX_ENTRIES);
    expect(cacheGet("h10:keep")).toBe("kept");
    expect(cacheGet("h10:churn:0")).toBeUndefined();
    expect(cacheGet(`h10:churn:${CACHE_MAX_ENTRIES * 3 - 1}`)).toBe(CACHE_MAX_ENTRIES * 3 - 1);
  });
});

describe("cached()", () => {
  it("shares one provider call between concurrent misses", async () => {
    let resolve: (value: string) => void = () => {};
    const fn = vi.fn(() => new Promise<string>((r) => { resolve = r; }));

    const calls = [cached("h10:quote:AAPL", fn), cached("h10:quote:AAPL", fn), cached("h10:quote:AAPL", fn)];
    resolve("quote");

    expect(await Promise.all(calls)).toEqual(["quote", "quote", "quote"]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(await cached("h10:quote:AAPL", fn)).toBe("quote");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures; the next call retries", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce("ok");

    const [first, second] = await Promise.allSettled([cached("h10:flaky", fn), cached("h10:flaky", fn)]);
    expect(first.status).toBe("rejected");
    expect(second.status).toBe("rejected");
    expect(fn).toHaveBeenCalledTimes(1);

    expect(await cached("h10:flaky", fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
