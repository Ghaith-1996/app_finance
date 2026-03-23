import type { IAIProvider } from "./provider";
import { createAnthropicProvider } from "./anthropic-provider";
import { createAzureOpenAIProvider } from "./azure-openai-provider";
import { createOpenAIProvider } from "./openai-provider";
import { createOpenRouterProvider } from "./openrouter-provider";

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
export { createOpenAIProvider } from "./openai-provider";
export { createAnthropicProvider } from "./anthropic-provider";
export { createAzureOpenAIProvider } from "./azure-openai-provider";
export { createOpenRouterProvider } from "./openrouter-provider";

export function getAIProvider(): IAIProvider {
  const id = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  if (id === "azure") {
    return createAzureOpenAIProvider();
  }
  if (id === "anthropic") {
    return createAnthropicProvider();
  }
  if (id === "openai") {
    return createOpenAIProvider();
  }
  return createOpenRouterProvider();
}
