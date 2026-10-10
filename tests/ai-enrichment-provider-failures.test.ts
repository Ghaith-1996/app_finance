import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IAIProvider } from "@/lib/services/ai/provider";
import { createAnthropicProvider } from "@/lib/services/ai/anthropic-provider";
import { createAzureOpenAIProvider } from "@/lib/services/ai/azure-openai-provider";
import { createMistralProvider } from "@/lib/services/ai/mistral-provider";
import { createOpenAIProvider } from "@/lib/services/ai/openai-provider";
import { createOpenRouterProvider } from "@/lib/services/ai/openrouter-provider";

// Review P1: enrichment must see every provider failure, including a missing or invalid configuration;
// returning stub output would let the enrichment worker record placeholder text as `succeeded`.

const originalEnv = { ...process.env };
const PROVIDER_ENV = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "MISTRAL_API_KEY",
  "MISTRAL_MODEL",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_BASE_URL",
  "AZURE_OPENAI_MODEL",
  "AZURE_OPENAI_DEPLOYMENT",
];

const providers: Array<[string, () => IAIProvider]> = [
  ["OpenAI", createOpenAIProvider],
  ["Anthropic", createAnthropicProvider],
  ["OpenRouter", createOpenRouterProvider],
  ["Mistral", createMistralProvider],
  ["Azure OpenAI", createAzureOpenAIProvider],
];

describe("article enrichment provider failures", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const name of PROVIDER_ENV) delete process.env[name];
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it.each(providers)("%s without configuration rejects instead of returning stub output", async (_name, create) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(create().analyzeArticle("Headline", "Body", ["AAPL"])).rejects.toThrow(/misconfigured/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a configured provider's HTTP failure rejects instead of returning stub output", async () => {
    process.env.OPENROUTER_API_KEY = "test-key";
    process.env.OPENROUTER_MODEL = "test-model";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "upstream unavailable" } }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(createOpenRouterProvider().analyzeArticle("Headline", "Body")).rejects.toThrow(/503/);
  });
});
