import { describe, expect, it } from "vitest";

import { buildInvestmentThesisMatches } from "@/lib/investment-theses/matching";
import type { InvestmentThesis } from "@/lib/investment-theses/types";

const thesis: InvestmentThesis = {
  id: "thesis-1",
  symbol: "AAPL",
  portfolioId: "portfolio-1",
  scope: "holding",
  thesis: "Apple services growth can support margins over a long horizon.",
  risks: ["services margin pressure", "China demand weakness"],
  invalidationNotes: "Revisit if iPhone demand falls for two quarters.",
  horizon: "long",
  conviction: "high",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("buildInvestmentThesisMatches", () => {
  it("surfaces saved risks when an article text touches them", () => {
    const matches = buildInvestmentThesisMatches(
      {
        headline: "Apple faces services margin pressure after App Store ruling",
        globalSummary: "The ruling could pressure services profitability.",
        stockTags: ["AAPL"],
        tickerImpacts: [],
      },
      [thesis],
    );

    expect(matches).toEqual([
      {
        symbol: "AAPL",
        label: "AAPL risk",
        detail: "Touches saved risk: services margin pressure",
        tone: "watch",
      },
    ]);
  });

  it("falls back to a tracked thesis match when only the ticker connects", () => {
    const matches = buildInvestmentThesisMatches(
      {
        headline: "Apple announces new developer tools",
        globalSummary: "The company introduced new software capabilities.",
        stockTags: ["AAPL"],
        tickerImpacts: [],
      },
      [thesis],
    );

    expect(matches[0]).toMatchObject({
      symbol: "AAPL",
      label: "AAPL thesis",
      tone: "neutral",
    });
  });
});
