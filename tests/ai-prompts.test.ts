import { describe, it, expect } from "vitest";
import {
  articleChatPrompt,
  portfolioCopilotPrompt,
} from "@/lib/services/ai/prompts";

describe("AI prompt builders", () => {
  describe("articleChatPrompt", () => {
    it("caps each persisted history entry at 4000 characters", () => {
      const longHistory = "H".repeat(4_500);
      const { user } = articleChatPrompt({
        article: {
          headline: "Headline",
          source: "Source",
          publishedAt: "2026-03-24T12:00:00.000Z",
          category: "other",
          stockTags: [],
          tickerImpacts: [],
        },
        holdings: [],
        history: [{ role: "assistant", content: longHistory }],
        question: "What matters?",
      });

      expect(user).toContain("H".repeat(4_000));
      expect(user).not.toContain("H".repeat(4_001));
    });

    it("caps saved-thesis text at the domain limit", () => {
      const longThesis = "T".repeat(1_500);
      const { user } = articleChatPrompt({
        article: {
          headline: "Headline",
          source: "Source",
          publishedAt: "2026-03-24T12:00:00.000Z",
          category: "other",
          stockTags: ["NVDA"],
          tickerImpacts: [],
        },
        holdings: [],
        investmentTheses: [
          {
            symbol: "NVDA",
            thesis: longThesis,
            risks: [],
            invalidationNotes: "",
            horizon: "long",
            conviction: "high",
          },
        ],
        history: [],
        question: "What matters?",
      });

      expect(user).toContain("T".repeat(1_200));
      expect(user).not.toContain("T".repeat(1_201));
    });
  });

  describe("portfolioCopilotPrompt", () => {
    it("includes saved investment theses as first-class context", () => {
      const { user } = portfolioCopilotPrompt({
        portfolio: {
          name: "My Portfolio",
          totalValue: 100000,
          dayChange: 1.2,
          lastAnalyzedAt: "2026-01-01",
          coverage: "Balanced",
          primaryGoal: "Growth",
        },
        holdings: [{ symbol: "NVDA", company: "NVIDIA", sector: "Technology" }],
        investmentTheses: [
          {
            symbol: "NVDA",
            thesis: "AI accelerator demand stays durable.",
            risks: ["gross margin pressure"],
            invalidationNotes: "Data center growth slows for two quarters.",
            horizon: "long",
            conviction: "high",
          },
        ],
        insights: [],
        feed: [],
        history: [],
        question: "What should I watch next?",
      });

      expect(user).toContain("AI accelerator demand stays durable.");
      expect(user).toContain("gross margin pressure");
      expect(user).toContain("Data center growth slows");
    });
  });
});
