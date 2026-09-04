import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ARTICLE_CHAT_MAX_TOKENS } from "@/lib/services/ai/constants";
import { createAnthropicProvider } from "@/lib/services/ai/anthropic-provider";
import { createAzureOpenAIProvider } from "@/lib/services/ai/azure-openai-provider";
import { createMistralProvider } from "@/lib/services/ai/mistral-provider";
import { createOpenAIProvider } from "@/lib/services/ai/openai-provider";
import { createOpenRouterProvider } from "@/lib/services/ai/openrouter-provider";

const originalEnv = { ...process.env };

const baseContext = {
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

describe("article chat token budgets", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses 2000 tokens for the Azure article-chat path", async () => {
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
    await provider.answerArticleQuestion(baseContext);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      max_output_tokens: number;
      input: Array<{ role: string; content: string }>;
    };
    expect(body.max_output_tokens).toBe(ARTICLE_CHAT_MAX_TOKENS);
    expect(
      body.input.filter((message) => message.content.includes("Earlier question")),
    ).toHaveLength(1);
    expect(JSON.stringify(body).match(/Why does this matter\?/g)).toHaveLength(1);
  });

  it("uses 2000 tokens for the OpenAI article-chat path", async () => {
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
    await provider.answerArticleQuestion(baseContext);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.max_tokens).toBe(ARTICLE_CHAT_MAX_TOKENS);
    expect(
      body.messages.filter((message) => message.content.includes("Earlier question")),
    ).toHaveLength(1);
    expect(JSON.stringify(body).match(/Why does this matter\?/g)).toHaveLength(1);
  });

  it("uses 2000 tokens for the OpenRouter article-chat path", async () => {
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
    await provider.answerArticleQuestion(baseContext);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.max_tokens).toBe(ARTICLE_CHAT_MAX_TOKENS);
    expect(
      body.messages.filter((message) => message.content.includes("Earlier question")),
    ).toHaveLength(1);
    expect(JSON.stringify(body).match(/Why does this matter\?/g)).toHaveLength(1);
  });

  it("uses 2000 tokens for the Mistral article-chat path", async () => {
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
    await provider.answerArticleQuestion(baseContext);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.max_tokens).toBe(ARTICLE_CHAT_MAX_TOKENS);
    expect(
      body.messages.filter((message) => message.content.includes("Earlier question")),
    ).toHaveLength(1);
    expect(JSON.stringify(body).match(/Why does this matter\?/g)).toHaveLength(1);
  });

  it("uses 2000 tokens for the Anthropic article-chat path", async () => {
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
    await provider.answerArticleQuestion(baseContext);

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as {
      max_tokens: number;
    };
    expect(body.max_tokens).toBe(ARTICLE_CHAT_MAX_TOKENS);
    expect(JSON.stringify(body).match(/Why does this matter\?/g)).toHaveLength(1);
  });
});
