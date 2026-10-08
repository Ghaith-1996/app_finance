import { afterEach, describe, expect, it, vi } from "vitest";

// Providers read credentials at import time; set test values before the imports below.
const ENV = vi.hoisted(() => {
  const values = {
    OPENROUTER_API_KEY: "or-test-key",
    MISTRAL_API_KEY: "mistral-test-key",
    OPENAI_API_KEY: "sk-test-key",
    ANTHROPIC_API_KEY: "anthropic-test-key",
    AZURE_OPENAI_API_KEY: "azure-test-key-0123456789",
    AZURE_OPENAI_BASE_URL: "https://example-resource.openai.azure.com",
    AZURE_OPENAI_MODEL: "gpt-test",
  };
  Object.assign(process.env, values);
  return values;
});

import { toArticleChatError } from "@/lib/services/ai/ai-chat-errors";
import { createAnthropicProvider } from "@/lib/services/ai/anthropic-provider";
import { createAzureOpenAIProvider } from "@/lib/services/ai/azure-openai-provider";
import { createMistralProvider } from "@/lib/services/ai/mistral-provider";
import { createOpenAIProvider } from "@/lib/services/ai/openai-provider";
import { createOpenRouterProvider } from "@/lib/services/ai/openrouter-provider";

// Audit H3: every provider request carries a deadline, and a timeout is a provider_timeout.

describe("AI request deadline (H3)", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    ["openrouter", createOpenRouterProvider],
    ["mistral", createMistralProvider],
    ["openai", createOpenAIProvider],
    ["anthropic", createAnthropicProvider],
    ["azure", createAzureOpenAIProvider],
  ])("%s passes an abort signal to fetch", async (_name, create) => {
    Object.assign(process.env, ENV);
    const fetchMock = vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });
    global.fetch = fetchMock as never;

    const provider = create();
    await expect(
      provider.answerPortfolioQuestion({
        portfolio: {
          name: "Main",
          totalValue: 1000,
          dayChange: 0,
          lastAnalyzedAt: "Never",
          coverage: "0 stories",
          primaryGoal: "Growth",
        },
        holdings: [],
        insights: [],
        feed: [],
        watchlistSymbols: [],
        investmentTheses: [],
        history: [],
        question: "hello",
      } as never),
    ).rejects.toBeTruthy();

    expect(fetchMock).toHaveBeenCalled();
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("classifies a deadline abort as provider_timeout", () => {
    const error = toArticleChatError(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    expect(error.code).toBe("provider_timeout");
  });
});
