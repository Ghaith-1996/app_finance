import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ENV_BACKUP = { ...process.env };

describe("Finnhub service error handling", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    process.env = { ...ENV_BACKUP };
  });

  afterAll(() => {
    process.env = ENV_BACKUP;
    vi.restoreAllMocks();
  });

  it("throws missing_key when FINNHUB_API_KEY is absent", async () => {
    delete process.env.FINNHUB_API_KEY;
    const { searchSymbols } = await import("@/lib/services/finnhub");
    await expect(searchSymbols("AAPL")).rejects.toMatchObject({ code: "missing_key" });
  });

  it("throws unauthorized on 401", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
    const { searchSymbols } = await import("@/lib/services/finnhub");
    await expect(searchSymbols("AAPL")).rejects.toMatchObject({ code: "unauthorized", status: 401 });
  });

  it("throws unauthorized on 403", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });
    const { searchSymbols } = await import("@/lib/services/finnhub");
    await expect(searchSymbols("AAPL")).rejects.toMatchObject({ code: "unauthorized", status: 403 });
  });

  it("throws rate_limited on 429", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    fetchMock.mockResolvedValueOnce({ ok: false, status: 429 });
    const { searchSymbols } = await import("@/lib/services/finnhub");
    await expect(searchSymbols("AAPL")).rejects.toMatchObject({ code: "rate_limited", status: 429 });
  });

  it("throws http_error on 500", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const { searchSymbols } = await import("@/lib/services/finnhub");
    await expect(searchSymbols("AAPL")).rejects.toMatchObject({ code: "http_error", status: 500 });
  });

  it("throws bad_payload when JSON parsing fails", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => { throw new SyntaxError("bad json"); },
    });
    const { getQuote } = await import("@/lib/services/finnhub");
    await expect(getQuote("AAPL")).rejects.toMatchObject({ code: "bad_payload" });
  });

  it("returns empty array when search has no equity matches", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ count: 1, result: [{ symbol: "FOO", description: "Foo", type: "Forex", displaySymbol: "FOO" }] }),
    });
    const { searchSymbols } = await import("@/lib/services/finnhub");
    const results = await searchSymbols("FOO");
    expect(results).toEqual([]);
  });

  it("returns candidates when search finds equities", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          count: 1,
          result: [{ symbol: "AAPL", description: "Apple Inc.", type: "Common Stock", displaySymbol: "AAPL" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ c: 195.5, d: 1.2, dp: 0.62, h: 196, l: 194, o: 194.5, pc: 194.3, t: 0 }),
      });

    const { searchSymbols } = await import("@/lib/services/finnhub");
    const results = await searchSymbols("AAPL");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ symbol: "AAPL", company: "Apple Inc.", price: 195.5 });
  });
});
