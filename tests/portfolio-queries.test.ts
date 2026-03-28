import { describe, expect, it } from "vitest";
import {
  buildPortfolioQueries,
  MAX_PORTFOLIO_QUERIES,
} from "@/lib/services/news/portfolio-queries";

describe("buildPortfolioQueries", () => {
  it("builds deterministic company+ticker search queries", () => {
    const queries = buildPortfolioQueries([
      { symbol: "MSFT", company: "Microsoft Corporation" },
      { symbol: "AAPL", company: "Apple Inc" },
    ]);

    expect(queries).toEqual([
      '"Apple Inc" AAPL stock',
      '"Microsoft Corporation" MSFT stock',
    ]);
  });

  it("falls back to ticker-only when company is missing", () => {
    const queries = buildPortfolioQueries([
      { symbol: "TSLA", company: "" },
      { symbol: "NVDA", company: null },
    ]);

    expect(queries).toEqual(["NVDA stock", "TSLA stock"]);
  });

  it("falls back to company-only when symbol is missing", () => {
    const queries = buildPortfolioQueries([
      { symbol: null, company: "Acme Corp" },
    ]);

    expect(queries).toEqual(['"Acme Corp" stock']);
  });

  it("skips holdings with no symbol and no company", () => {
    const queries = buildPortfolioQueries([
      { symbol: null, company: null },
      { symbol: "", company: "" },
      { symbol: "AAPL", company: "Apple Inc" },
    ]);

    expect(queries).toEqual(['"Apple Inc" AAPL stock']);
  });

  it("caps the query count at MAX_PORTFOLIO_QUERIES", () => {
    const holdings = Array.from({ length: 20 }, (_, i) => ({
      symbol: `SYM${String(i).padStart(2, "0")}`,
      company: `Company ${i}`,
    }));

    const queries = buildPortfolioQueries(holdings);
    expect(queries.length).toBe(MAX_PORTFOLIO_QUERIES);
  });

  it("deduplicates identical queries", () => {
    const queries = buildPortfolioQueries([
      { symbol: "AAPL", company: "Apple Inc" },
      { symbol: "AAPL", company: "Apple Inc" },
    ]);

    expect(queries).toEqual(['"Apple Inc" AAPL stock']);
  });

  it("normalizes whitespace in company names", () => {
    const queries = buildPortfolioQueries([
      { symbol: "TSLA", company: " Tesla   Inc  " },
    ]);

    expect(queries).toEqual(['"Tesla Inc" TSLA stock']);
  });

  it("returns an empty array for empty holdings", () => {
    expect(buildPortfolioQueries([])).toEqual([]);
  });

  it("uses company-only when company matches symbol (case-insensitive)", () => {
    // When company name uppercased === symbol, only company-based query
    const queries = buildPortfolioQueries([
      { symbol: "TSLA", company: "TSLA" },
    ]);

    expect(queries).toEqual(['"TSLA" stock']);
  });

  it("exports MAX_PORTFOLIO_QUERIES as 8", () => {
    expect(MAX_PORTFOLIO_QUERIES).toBe(8);
  });
});
