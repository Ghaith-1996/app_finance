import { describe, expect, it } from "vitest";

import { buildScoreExplanation } from "@/lib/feed/score-explanation";
import type { NewsItem } from "@/lib/types";

const baseStory: NewsItem = {
  id: "item-1",
  newsItemId: "news-1",
  headline: "Apple supplier raises guidance",
  source: "Reuters",
  publishedAt: "35 minutes ago",
  publishedMinutesAgo: 35,
  category: "technology",
  stockTags: ["AAPL"],
  globalSummary: "Supplier commentary points to stronger demand.",
  displayEffect: "bullish",
  tickerImpacts: [{ symbol: "AAPL", effect: "bullish" }],
  sourceType: "newsapi",
  sourceConfidence: "standard",
  metadata: {},
  angle: "demand",
};

describe("buildScoreExplanation", () => {
  it("explains personal ranking with portfolio match signals", () => {
    const explanation = buildScoreExplanation(
      {
        ...baseStory,
        relevanceScore: 94,
        category: "earnings",
        holdings: ["AAPL"],
        matchedStockTags: ["AAPL"],
        impact: "High",
        sourceConfidence: "high",
        matchReasonCodes: ["held_ticker_tag", "held_ticker_impact"],
      },
      "personal",
    );

    expect(explanation.title).toBe("Score drivers");
    expect(explanation.scoreLabel).toBe("94% match");
    expect(explanation.confidenceLabel).toBe("High confidence");
    expect(explanation.horizonLabel).toBe("Past hour");
    expect(explanation.summary).toContain("held ticker");
    expect(explanation.factors.map((factor) => factor.label)).toEqual(
      expect.arrayContaining([
        "Held ticker",
        "Ticker impact",
        "Connected symbols",
        "High impact",
        "Bullish read",
      ]),
    );
  });

  it("explains market ranking with portfolio and watchlist overlap", () => {
    const explanation = buildScoreExplanation(
      {
        ...baseStory,
        isPortfolioMatch: true,
        isWatchlistMatch: true,
        matchedStockTags: ["AAPL", "MSFT"],
      },
      "market",
    );

    expect(explanation.title).toBe("Market drivers");
    expect(explanation.scoreLabel).toBeNull();
    expect(explanation.factors.map((factor) => factor.label)).toEqual(
      expect.arrayContaining([
        "Portfolio overlap",
        "Watchlist overlap",
        "Ticker overlap",
        "Fresh story",
      ]),
    );
  });
});
