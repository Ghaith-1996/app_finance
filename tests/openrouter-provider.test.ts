import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenRouterProvider } from "@/lib/services/ai/openrouter-provider";

const originalEnv = { ...process.env };

describe("createOpenRouterProvider", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws provider_auth for article chat when the API key is missing", async () => {
    const provider = createOpenRouterProvider();

    await expect(
      provider.answerArticleQuestion({
        article: {
          headline: "Headline",
          source: "Source",
          publishedAt: "2026-03-24T12:00:00.000Z",
          category: "other",
          stockTags: [],
          tickerImpacts: [],
        },
        holdings: [],
        history: [],
        question: "Why does this matter?",
      }),
    ).rejects.toMatchObject({ code: "provider_auth" });
  });

  it("throws provider_auth for portfolio chat when the API key is missing", async () => {
    const provider = createOpenRouterProvider();

    await expect(
      provider.answerPortfolioQuestion({
        portfolio: {
          name: "Core Portfolio",
          totalValue: 100_000,
          dayChange: 250,
          lastAnalyzedAt: "2026-03-24T12:00:00.000Z",
          coverage: "Balanced",
          primaryGoal: "Growth",
        },
        holdings: [],
        insights: [],
        feed: [],
        history: [],
        question: "How is my portfolio doing?",
      }),
    ).rejects.toMatchObject({ code: "provider_auth" });
  });
});
