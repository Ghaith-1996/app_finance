import type { IAIProvider } from "./provider";
import { createAnthropicProvider } from "./anthropic-provider";
import { createOpenAIProvider } from "./openai-provider";

export type { IAIProvider, NewsContext, Sentiment, ImpactLevel } from "./provider";
export { stubAIProvider } from "./stub-provider";
export { createOpenAIProvider } from "./openai-provider";
export { createAnthropicProvider } from "./anthropic-provider";

export function getAIProvider(): IAIProvider {
  const id = (process.env.AI_PROVIDER ?? "openai").toLowerCase();
  if (id === "anthropic") {
    return createAnthropicProvider();
  }
  return createOpenAIProvider();
}
