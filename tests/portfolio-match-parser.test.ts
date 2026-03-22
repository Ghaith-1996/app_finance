import { describe, expect, it } from "vitest";
import {
  emptyPortfolioMatchAssessment,
  parseNumericRelevance,
  parsePortfolioMatchAssessment,
} from "@/lib/services/ai/portfolio-match";

const holdings = [
  { symbol: "AAPL", company: "Apple Inc.", sector: "Technology" },
  { symbol: "MSFT", company: "Microsoft Corp.", sector: "Technology" },
];

describe("portfolio match parsing", () => {
  it("fails closed for empty numeric relevance", () => {
    expect(parseNumericRelevance("")).toBe(0);
    expect(parseNumericRelevance(null)).toBe(0);
    expect(parseNumericRelevance("no score")).toBe(0);
  });

  it("fails closed for invalid assessment payloads", () => {
    expect(parsePortfolioMatchAssessment("", holdings)).toEqual(
      emptyPortfolioMatchAssessment(),
    );
    expect(parsePortfolioMatchAssessment("{bad json", holdings)).toEqual(
      emptyPortfolioMatchAssessment(),
    );
  });

  it("normalizes valid structured assessments", () => {
    const parsed = parsePortfolioMatchAssessment(
      JSON.stringify({
        relevanceScore: 82,
        whyItMatters: "Apple could benefit from stronger iPhone demand.",
        matchedHoldings: ["aapl", "TSLA"],
        matchReasonCodes: ["held_ticker_tag", "invalid_code", "held_ticker_tag"],
      }),
      holdings,
    );

    expect(parsed).toEqual({
      relevanceScore: 82,
      whyItMatters: "Apple could benefit from stronger iPhone demand.",
      matchedHoldings: ["AAPL"],
      matchReasonCodes: ["held_ticker_tag"],
    });
  });
});
