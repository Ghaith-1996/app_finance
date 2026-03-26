import type { IAIProvider } from "./provider";
import { createAnthropicProvider } from "./anthropic-provider";
import { createAzureOpenAIProvider } from "./azure-openai-provider";
import { createMistralProvider } from "./mistral-provider";
import { createOpenAIProvider } from "./openai-provider";
import { createOpenRouterProvider } from "./openrouter-provider";

export type AIProviderId = "azure" | "anthropic" | "openai" | "openrouter" | "mistral";

export type {
  IAIProvider,
  HoldingContext,
  NewsContext,
  Sentiment,
  ImpactLevel,
  ArticleAnalysis,
  PortfolioMatchAssessment,
} from "./provider";
export type { ArticleChatContext, PortfolioCopilotContext } from "./provider";
export { stubAIProvider } from "./stub-provider";
export type { AIChatErrorCode } from "./ai-chat-errors";
export {
  AIChatError,
  assertNonEmptyArticleChatReply,
  toArticleChatError,
} from "./ai-chat-errors";
export { createOpenAIProvider } from "./openai-provider";
export { createAnthropicProvider } from "./anthropic-provider";
export { createAzureOpenAIProvider } from "./azure-openai-provider";
export { createOpenRouterProvider } from "./openrouter-provider";
export { createMistralProvider } from "./mistral-provider";

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
  return createOpenRouterProvider();
}

export function getAIProvider(): IAIProvider {
  const rawId = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (
    rawId === "azure" ||
    rawId === "anthropic" ||
    rawId === "openai" ||
    rawId === "openrouter" ||
    rawId === "mistral"
  ) {
    return getAIProviderById(rawId);
  }
  return createOpenAIProvider();
}
