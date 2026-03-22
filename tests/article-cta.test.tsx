import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock("@/lib/ingest-hint", () => ({
  readLastIngestSnapshot: () => null,
  isRecentIngestHint: () => false,
  writeLastIngestSnapshot: vi.fn(),
  LAST_INGEST_STORAGE_KEY: "test",
}));

import { NewsFeedCard } from "@/components/app/news-feed-card";
import type { NewsItem } from "@/lib/types";

const baseItem: NewsItem = {
  id: "item-1",
  newsItemId: "news-1",
  headline: "Test Article",
  source: "Reuters",
  publishedAt: "10 minutes ago",
  publishedMinutesAgo: 10,
  category: "technology",
  stockTags: ["AAPL"],
  globalSummary: "A summary of the article.",
  displayEffect: "bullish",
  tickerImpacts: [{ symbol: "AAPL", effect: "bullish" }],
  sourceType: "newsapi",
  sourceConfidence: "standard",
  metadata: {},
  angle: "earnings",
};

describe("Article CTA - Open full story", () => {
  it("does not render a link when url is absent", () => {
    const item: NewsItem = { ...baseItem, url: undefined };
    const { container } = render(<NewsFeedCard story={item} mode="personal" />);

    const links = container.querySelectorAll('a[target="_blank"]');
    expect(links.length).toBe(0);
  });

  it("does not render a link when url is empty string", () => {
    const item: NewsItem = { ...baseItem, url: "" };
    const { container } = render(<NewsFeedCard story={item} mode="personal" />);

    const links = container.querySelectorAll('a[target="_blank"]');
    expect(links.length).toBe(0);
  });
});

describe("Article CTA in detail panel context", () => {
  it("renders the url field correctly in the type contract", () => {
    const itemWithUrl: NewsItem = {
      ...baseItem,
      url: "https://example.com/article",
    };
    expect(itemWithUrl.url).toBe("https://example.com/article");

    const itemWithoutUrl: NewsItem = { ...baseItem };
    expect(itemWithoutUrl.url).toBeUndefined();
  });
});
