import type { IAIProvider } from "./provider";
import { createAnthropicProvider } from "./anthropic-provider";
import { createAzureOpenAIProvider } from "./azure-openai-provider";
import { createMistralProvider } from "./mistral-provider";
import { createOpenAIProvider } from "./openai-provider";
import { createNemotronProvider, createOpenRouterProvider } from "./openrouter-provider";
import { createGroqEnrichmentProvider } from "./groq-provider";
import { toArticleChatError } from "./ai-chat-errors";
import { createLogger } from "@/lib/logger";

const log = createLogger("ai-enrichment");

export type AIProviderId = "azure" | "anthropic" | "openai" | "openrouter" | "mistral" | "nemotron";

export type {
  IAIProvider,
  HoldingContext,
  PortfolioMatchAssessment,
} from "./provider";
export type { AIChatErrorCode } from "./ai-chat-errors";
export {
  AIChatError,
  toArticleChatError,
} from "./ai-chat-errors";

export function getAIProviderById(id: AIProviderId): IAIProvider {
  if (id === "azure") {
    return createAzureOpenAIProvider();
  }
  if (id === "anthropic") {
    return createAnthropicProvider();
  }
  if (id === "openai") {
    return createOpenAIProvider();
  }
  if (id === "mistral") {
    return createMistralProvider();
  }
  if (id === "nemotron") {
    return createNemotronProvider();
  }
  return createOpenRouterProvider();
}

/**
 * Enrichment tries Groq first and uses the AI_PROVIDER provider only when Groq refuses for
 * provider-wide reasons (key, quota, rate limit). Other Groq failures stay per-article failures.
 * Analysis keeps AI_PROVIDER alone so its many calls never spend Groq's daily token budget.
 */
export function getEnrichmentProvider(): Pick<IAIProvider, "analyzeArticle"> {
  const groq = createGroqEnrichmentProvider();
  const fallback = getAIProvider();
  return {
    async analyzeArticle(headline, content, hintTickers) {
      try {
        return await groq.analyzeArticle(headline, content, hintTickers);
      } catch (error) {
        const { code } = toArticleChatError(error);
        if (code !== "provider_auth" && code !== "provider_rate_limited") throw error;
        log.warn("Groq refused enrichment; using the fallback provider", { code });
        return fallback.analyzeArticle(headline, content, hintTickers);
      }
    },
  };
}

export function getAIProvider(): IAIProvider {
  const rawId = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (
    rawId === "azure" ||
    rawId === "anthropic" ||
    rawId === "openai" ||
    rawId === "openrouter" ||
    rawId === "mistral" ||
    rawId === "nemotron"
  ) {
    return getAIProviderById(rawId);
  }
  return createOpenAIProvider();
}
