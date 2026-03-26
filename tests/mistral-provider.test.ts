import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AIChatError } from "@/lib/services/ai/ai-chat-errors";
import { createMistralProvider } from "@/lib/services/ai/mistral-provider";

const originalEnv = { ...process.env };

describe("createMistralProvider", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns stubbed non-chat behavior and throws provider_auth for chat when the key is missing", async () => {
    delete process.env.MISTRAL_API_KEY;

    const provider = createMistralProvider();

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
    ).rejects.toMatchObject({
      code: "provider_auth",
    });

    await expect(provider.generateSummary("Market headline", [])).resolves.toContain(
      "Market headline",
    );
  });

  it("parses structured JSON for article enrichment", async () => {
    process.env.MISTRAL_API_KEY = "mistral-real-key";
    process.env.MISTRAL_MODEL = "mistral-large-latest";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  category: "technology",
                  globalSummary: "AI demand is lifting NVDA.",
                  overallEffect: "bullish",
                  stockTags: ["nvda"],
                  tickerImpacts: [{ symbol: "nvda", effect: "bullish" }],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createMistralProvider();
    const result = await provider.analyzeArticle("Headline", "Body", ["NVDA"]);

    expect(result).toEqual({
      category: "technology",
      globalSummary: "AI demand is lifting NVDA.",
      overallEffect: "bullish",
      stockTags: ["NVDA"],
      tickerImpacts: [{ symbol: "NVDA", effect: "bullish" }],
    });
  });

  it("parses structured JSON for insights", async () => {
    process.env.MISTRAL_API_KEY = "mistral-real-key";
    process.env.MISTRAL_MODEL = "mistral-large-latest";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { title: "Most exposed theme", value: "Technology", detail: "NVDA leads risk." },
                  { title: "Macro watch", value: "Rates", detail: "Watch rate sensitivity." },
                  { title: "Fresh catalyst", value: "Earnings", detail: "Next print matters." },
                ]),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createMistralProvider();
    const insights = await provider.generateInsights(
      [{ symbol: "NVDA", company: "NVIDIA", sector: "Technology" }],
      [
        {
          headline: "AI servers surge",
          source: "News",
          publishedAt: "2026-03-24T12:00:00.000Z",
        },
      ],
    );

    expect(insights).toHaveLength(3);
    expect(insights[0]?.value).toBe("Technology");
  });
});
