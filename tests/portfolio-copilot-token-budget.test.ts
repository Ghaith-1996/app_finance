import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAnthropicProvider } from "@/lib/services/ai/anthropic-provider";
import { createAzureOpenAIProvider } from "@/lib/services/ai/azure-openai-provider";
import { createMistralProvider } from "@/lib/services/ai/mistral-provider";
import { createOpenAIProvider } from "@/lib/services/ai/openai-provider";
import { createOpenRouterProvider } from "@/lib/services/ai/openrouter-provider";

const originalEnv = { ...process.env };

const baseContext = {
  portfolio: {
    name: "Core Portfolio",
    totalValue: 100_000,
    dayChange: 1.2,
    lastAnalyzedAt: "2026-03-24T12:00:00.000Z",
    coverage: "Balanced",
    primaryGoal: "Long-term growth",
  },
  holdings: [{ symbol: "NVDA", company: "NVIDIA", sector: "Technology" }],
  insights: [{ title: "Theme", value: "AI infra", detail: "Compute demand remains elevated." }],
  feed: [
    {
      headline: "NVIDIA suppliers expand capacity",
      source: "Wire",
      publishedAt: "2026-03-24T11:30:00.000Z",
      category: "technology" as const,
      whyItMatters: "Supply expansion can support near-term revenue visibility.",
      relevanceScore: 84,
      holdings: ["NVDA"],
      sectors: ["Technology"],
    },
  ],
  watchlistSymbols: ["AAPL"],
  history: [{ role: "user" as const, content: "Earlier question" }],
  question: "What should I prioritize this week?",
};

describe("portfolio copilot provider history", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("sends prior history once through Azure portfolio copilot", async () => {
    process.env.AZURE_OPENAI_API_KEY = "test-key";
    process.env.AZURE_OPENAI_BASE_URL = "https://example-resource.openai.azure.com/openai/v1";
    process.env.AZURE_OPENAI_MODEL = "test-deployment";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: "Azure answer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAzureOpenAIProvider();
    await provider.answerPortfolioQuestion(baseContext);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(JSON.stringify(body).match(/Earlier question/g)).toHaveLength(1);
  });

  it("sends prior history once through OpenAI portfolio copilot", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "OpenAI answer" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenAIProvider();
    await provider.answerPortfolioQuestion(baseContext);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(JSON.stringify(body).match(/Earlier question/g)).toHaveLength(1);
  });

  it("sends prior history once through OpenRouter portfolio copilot", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test-model";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "OpenRouter answer" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createOpenRouterProvider();
    await provider.answerPortfolioQuestion(baseContext);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(JSON.stringify(body).match(/Earlier question/g)).toHaveLength(1);
  });

  it("sends prior history once through Mistral portfolio copilot", async () => {
    process.env.MISTRAL_API_KEY = "test-key";
    process.env.MISTRAL_MODEL = "mistral-test-model";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Mistral answer" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createMistralProvider();
    await provider.answerPortfolioQuestion(baseContext);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(JSON.stringify(body).match(/Earlier question/g)).toHaveLength(1);
  });

  it("sends prior history once through Anthropic portfolio copilot", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [{ text: "Anthropic answer" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAnthropicProvider();
    await provider.answerPortfolioQuestion(baseContext);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(JSON.stringify(body).match(/Earlier question/g)).toHaveLength(1);
  });
});
