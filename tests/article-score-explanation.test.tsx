import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NewsFeedCard } from "@/components/app/news-feed-card";
import type { NewsItem } from "@/lib/types";

const baseItem: NewsItem = {
  id: "item-1",
  newsItemId: "news-1",
  headline: "Apple supplier raises guidance",
  source: "Reuters",
  publishedAt: "35 minutes ago",
  publishedMinutesAgo: 35,
  category: "earnings",
  stockTags: ["AAPL"],
  globalSummary: "Supplier commentary points to stronger demand.",
  displayEffect: "bullish",
  tickerImpacts: [{ symbol: "AAPL", effect: "bullish" }],
  sourceType: "newsapi",
  sourceConfidence: "high",
  metadata: {},
  angle: "demand",
};

describe("article score explanation", () => {
  it("shows one score and no driver block on personal feed cards (D02)", () => {
    render(
      <NewsFeedCard
        story={{
          ...baseItem,
          relevanceScore: 94,
          holdings: ["AAPL"],
          matchedStockTags: ["AAPL"],
          impact: "High",
          matchReasonCodes: ["held_ticker_tag"],
        }}
        mode="personal"
      />,
    );

    // Drivers are shown in the story detail panel; the card keeps one score and one sentence.
    expect(screen.getAllByText("94% match")).toHaveLength(1);
    expect(screen.queryByText("Score drivers")).toBeNull();
    expect(screen.getByText("Supplier commentary points to stronger demand.")).toBeInTheDocument();
  });

  it("keeps market cards free of the driver block (D02)", () => {
    render(
      <NewsFeedCard
        story={{
          ...baseItem,
          isPortfolioMatch: true,
          matchedStockTags: ["AAPL"],
        }}
        mode="market"
      />,
    );

    expect(screen.getByText("In portfolio")).toBeInTheDocument();
    expect(screen.queryByText("Market drivers")).toBeNull();
  });

  it("renders thesis tracker matches on feed cards", () => {
    render(
      <NewsFeedCard
        story={{
          ...baseItem,
          relevanceScore: 88,
          holdings: ["AAPL"],
          matchedStockTags: ["AAPL"],
          impact: "Medium",
          thesisMatches: [
            {
              symbol: "AAPL",
              label: "AAPL risk",
              detail: "Touches saved risk: margin pressure",
              tone: "watch",
            },
          ],
        }}
        mode="personal"
      />,
    );

    expect(screen.getByText("Thesis watch")).toBeInTheDocument();
    expect(screen.getByText("Thesis tracker")).toBeInTheDocument();
    expect(screen.getByText("Touches saved risk: margin pressure")).toBeInTheDocument();
  });
});
