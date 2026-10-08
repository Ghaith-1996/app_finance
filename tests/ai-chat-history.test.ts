import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAnthropicProvider } from "@/lib/services/ai/anthropic-provider";
import { createAzureOpenAIProvider } from "@/lib/services/ai/azure-openai-provider";
import { createMistralProvider } from "@/lib/services/ai/mistral-provider";
import { createOpenAIProvider } from "@/lib/services/ai/openai-provider";
import { createOpenRouterProvider } from "@/lib/services/ai/openrouter-provider";

const originalEnv = { ...process.env };

const articleContext = {
  article: {
    headline: "Test headline",
    source: "Test source",
    publishedAt: "2026-03-24T12:00:00.000Z",
    category: "other" as const,
    globalSummary: "Test summary",
    rawContent: "Snippet",
    extractedContent: "Longer extracted article body.",
    fullContent: undefined,
    primaryBody: "Longer extracted article body.",
    extractionPending: false,
    extractionStatus: "complete",
    stockTags: ["NVDA"],
    tickerImpacts: [],
    sourceType: "newsapi",
    whyItMatters: "It matters.",
    matchedHoldings: ["NVDA"],
    relevanceScore: 82,
  },
  holdings: [{ symbol: "NVDA", company: "NVIDIA", sector: "Technology" }],
  history: [{ role: "user" as const, content: "Earlier question" }],
  question: "Why does this matter?",
};

const portfolioContext = {
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

function providerCases() {
  const completion = (answer: string) => ({ choices: [{ message: { content: answer } }] });
  const messages = (body: { messages: Array<{ role: string; content: string }> }) => body.messages;
  return [
    { name: "Azure", env: { AZURE_OPENAI_API_KEY: "test-key", AZURE_OPENAI_BASE_URL: "https://example-resource.openai.azure.com/openai/v1", AZURE_OPENAI_MODEL: "test-deployment" }, create: createAzureOpenAIProvider, response: { output_text: "Azure answer" }, messages: (body: { input: Array<{ role: string; content: string }> }) => body.input },
    { name: "OpenAI", env: { OPENAI_API_KEY: "test-key" }, create: createOpenAIProvider, response: completion("OpenAI answer"), messages },
    { name: "OpenRouter", env: { OPENROUTER_API_KEY: "test-key", OPENROUTER_MODEL: "test-model" }, create: createOpenRouterProvider, response: completion("OpenRouter answer"), messages },
    { name: "Mistral", env: { MISTRAL_API_KEY: "test-key", MISTRAL_MODEL: "mistral-test-model" }, create: createMistralProvider, response: completion("Mistral answer"), messages },
    { name: "Anthropic", env: { ANTHROPIC_API_KEY: "test-key" }, create: createAnthropicProvider, response: { content: [{ text: "Anthropic answer" }] }, messages },
  ];
}

beforeEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});
afterEach(() => { process.env = { ...originalEnv }; });

function mockProviderResponse(response: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return () => JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
}

describe("article chat provider history", () => {
  it.each(providerCases())("sends the current question once through $name article chat", async (testCase) => {
    Object.assign(process.env, testCase.env);
    const body = mockProviderResponse(testCase.response);
    await testCase.create().answerArticleQuestion(articleContext);
    const payload = body();
    if (testCase.name !== "Anthropic") {
      expect(testCase.messages(payload).filter((message) => message.content.includes("Earlier question"))).toHaveLength(1);
    }
    expect(JSON.stringify(payload).match(/Why does this matter\?/g)).toHaveLength(1);
  });
});

describe("portfolio copilot provider history", () => {
  it.each(providerCases())("sends prior history once through $name portfolio copilot", async (testCase) => {
    Object.assign(process.env, testCase.env);
    const body = mockProviderResponse(testCase.response);
    await testCase.create().answerPortfolioQuestion(portfolioContext);
    expect(JSON.stringify(body()).match(/Earlier question/g)).toHaveLength(1);
  });
});
