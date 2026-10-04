import { describe, expect, it } from "vitest";
import { parseArticleAnalysis } from "@/lib/services/ai/provider";

const parse = (value: unknown, dropEmptyStockTags = false, hints?: string[]) =>
  parseArticleAnalysis(JSON.stringify(value), "Headline", hints, { dropEmptyStockTags });

describe("article analysis codec contract", () => {
  it("reads fenced output and preserves recognized fields", () => {
    expect(parseArticleAnalysis('```json\n{"category":"technology","globalSummary":"Summary","overallEffect":"bullish"}\n```', "Headline", undefined, { dropEmptyStockTags: false }))
      .toEqual({ category: "technology", globalSummary: "Summary", overallEffect: "bullish", stockTags: [], tickerImpacts: [] });
  });

  it("defaults unknown fields and falsey summaries without coercing truthy summaries", () => {
    expect(parse({ category: "invalid", overallEffect: "invalid", globalSummary: "" }))
      .toEqual({ category: "other", globalSummary: "Headline", overallEffect: "neutral", stockTags: [], tickerImpacts: [] });
    expect(parse({ globalSummary: 42 }).globalSummary).toBe(42);
  });

  it.each([
    [false, ["", "NULL", "42", " AAPL ", "AAPL", "AAPL"]],
    [true, ["NULL", "42", " AAPL ", "AAPL", "AAPL"]],
  ])("preserves tag coercion with dropEmptyStockTags=%s", (drop, expected) => {
    expect(parse({ stockTags: ["", null, 42, " aapl ", "aapl", "aapl"] }, drop as boolean).stockTags).toEqual(expected);
  });

  it("uses hints unchanged only when stockTags is not an array", () => {
    const hints = [" aapl ", "", "nvda"];
    expect(parse({ stockTags: null }, true, hints).stockTags).toBe(hints);
    expect(parse({ stockTags: [] }, false, hints).stockTags).toEqual([]);
  });

  it("filters falsey impact fields, uppercases symbols, and defaults unknown effects", () => {
    expect(parse({ tickerImpacts: [{ symbol: " aapl ", effect: "bearish" }, { symbol: "nvda", effect: "invalid" }, { symbol: "", effect: "bullish" }, { symbol: "MSFT" }] }).tickerImpacts)
      .toEqual([{ symbol: " AAPL ", effect: "bearish" }, { symbol: "NVDA", effect: "neutral" }]);
    expect(parse({ tickerImpacts: {} }).tickerImpacts).toEqual([]);
  });

  it.each(["invalid", "", "null"])("throws for malformed top-level output %s", (raw) => {
    expect(() => parseArticleAnalysis(raw, "Headline", undefined, { dropEmptyStockTags: false })).toThrow();
  });

  it.each([null, { symbol: 42, effect: "bullish" }])("throws for malformed impact %j", (impact) => {
    expect(() => parse({ tickerImpacts: [impact] })).toThrow();
  });
});
