import { describe, expect, it } from "vitest";
import {
  MAX_GNEWS_TARGET_QUERIES,
  buildGnewsPortfolioQueries,
} from "@/lib/services/news/gnews-targeting";

describe("buildGnewsPortfolioQueries", () => {
  it("builds deterministic company+ticker search queries", () => {
    const queries = buildGnewsPortfolioQueries([
      { symbol: "MSFT", company: "Microsoft Corporation" },
      { symbol: "AAPL", company: "Apple Inc" },
    ]);

    expect(queries).toEqual([
      "\"Apple Inc\" AAPL stock",
      "\"Microsoft Corporation\" MSFT stock",
    ]);
  });

  it("caps the query count and falls back to ticker-only when needed", () => {
    const queries = buildGnewsPortfolioQueries([
      { symbol: "TSLA", company: "" },
      ...Array.from({ length: 20 }, (_, index) => ({
        symbol: `SYM${index}`,
        company: `Company ${index}`,
      })),
    ]);

    expect(queries).toContain("TSLA stock");
    expect(queries.length).toBe(MAX_GNEWS_TARGET_QUERIES);
  });
});
