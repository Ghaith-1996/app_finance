import type { Holding, PortfolioInsight } from "@/lib/types";
import type { IAIProvider, Sentiment } from "./provider";

/**
 * Stub AI provider that returns deterministic defaults without calling any API.
 * Use when AI_PROVIDER is unset or when no API key is configured.
 */
export const stubAIProvider: IAIProvider = {
  async generateSummary(article, holdings) {
    const tickers = holdings.map((h) => h.symbol).join(", ");
    return `This story may be relevant to holdings: ${tickers}. ${article.slice(0, 200)}...`;
  },

  async scoreSentiment() {
    return "neutral" as Sentiment;
  },

  async scoreRelevance() {
    return 75;
  },

  async generateInsights(holdings, _newsContexts) {
    const sectors = [...new Set(holdings.map((h) => h.sector))];
    const topSector = sectors[0] ?? "Diversified";
    const topWeight = holdings[0];
    return [
      {
        title: "Most exposed theme",
        value: topSector,
        detail: holdings.length
          ? `${topWeight?.symbol ?? "—"} and others drive sector concentration.`
          : "Add holdings to see insights.",
      },
      {
        title: "Macro watch",
        value: "Rates + energy",
        detail: "Energy and growth names are sensitive to rate and inflation surprises.",
      },
      {
        title: "Fresh catalyst",
        value: "Earnings and policy",
        detail: "Upcoming catalysts may affect portfolio names; check the feed for updates.",
      },
    ];
  },

  async explainWhyItMatters(article, holdings) {
    const symbols = holdings.map((h) => h.symbol).slice(0, 3).join(", ");
    return `This story may affect positions such as ${symbols}. ${article.slice(0, 150)}...`;
  },
};
