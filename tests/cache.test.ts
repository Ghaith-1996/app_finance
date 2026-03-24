import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheGet, cacheSet, cacheDel, cached } from "@/lib/services/cache";

describe("server-side cache", () => {
  beforeEach(() => {
    cacheDel("test-key");
    cacheDel("fn-key");
  });

  it("returns undefined for missing keys", () => {
    expect(cacheGet("nonexistent")).toBeUndefined();
  });

  it("stores and retrieves values", () => {
    cacheSet("test-key", { a: 1 });
    expect(cacheGet("test-key")).toEqual({ a: 1 });
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    cacheSet("test-key", "value", 1000);
    expect(cacheGet("test-key")).toBe("value");

    vi.advanceTimersByTime(1001);
    expect(cacheGet("test-key")).toBeUndefined();
    vi.useRealTimers();
  });

  it("deletes entries", () => {
    cacheSet("test-key", 42);
    cacheDel("test-key");
    expect(cacheGet("test-key")).toBeUndefined();
  });

  it("cached() returns stored value on hit", async () => {
    const fn = vi.fn().mockResolvedValue("fresh");
    cacheSet("fn-key", "cached-val", 60_000);

    const result = await cached("fn-key", fn, 60_000);
    expect(result).toBe("cached-val");
    expect(fn).not.toHaveBeenCalled();
  });

  it("cached() calls fn on miss and stores result", async () => {
    const fn = vi.fn().mockResolvedValue("computed");

    const result = await cached("fn-key", fn, 60_000);
    expect(result).toBe("computed");
    expect(fn).toHaveBeenCalledOnce();
    expect(cacheGet("fn-key")).toBe("computed");
  });
});
