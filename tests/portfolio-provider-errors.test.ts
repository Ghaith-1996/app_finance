import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAzureOpenAIProvider } from "@/lib/services/ai/azure-openai-provider";
import { createMistralProvider } from "@/lib/services/ai/mistral-provider";
import { createOpenRouterProvider } from "@/lib/services/ai/openrouter-provider";

const originalEnv = { ...process.env };

const context = {
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
};

describe("portfolio chat provider errors", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("propagates OpenRouter HTTP errors instead of returning a canned answer", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test-model";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "too many requests" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(createOpenRouterProvider().answerPortfolioQuestion(context)).rejects.toThrow(
      /HTTP 429/,
    );
  });

  it("propagates Mistral HTTP errors instead of returning a canned answer", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    process.env.MISTRAL_MODEL = "mistral-test-model";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "too many requests" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(createMistralProvider().answerPortfolioQuestion(context)).rejects.toThrow(
      /HTTP 429/,
    );
  });

  it("propagates Azure HTTP errors instead of returning a canned answer", async () => {
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    process.env.AZURE_OPENAI_BASE_URL = "https://example-resource.openai.azure.com/openai/v1";
    process.env.AZURE_OPENAI_MODEL = "test-deployment";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "too many requests" } }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(createAzureOpenAIProvider().answerPortfolioQuestion(context)).rejects.toThrow(
      /HTTP 429/,
    );
  });
});
