import type { PortfolioInsight } from "@/lib/types";
import { NEWS_CATEGORIES } from "@/lib/types";
import type {
  ArticleAnalysis,
  ArticleChatContext,
  IAIProvider,
  PortfolioMatchAssessment,
  PortfolioCopilotContext,
  Sentiment,
} from "./provider";
import { AIChatError, assertNonEmptyArticleChatReply } from "./ai-chat-errors";
import { stubAIProvider } from "./stub-provider";
import {
  ARTICLE_CHAT_MAX_TOKENS,
  PORTFOLIO_COPILOT_MAX_TOKENS,
} from "./constants";
import { validateAzureConfig } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const azureLog = createLogger("azure-openai");
import {
  parseNumericRelevance,
  parsePortfolioMatchAssessment,
} from "./portfolio-match";
import {
  articleEnrichmentPrompt,
  articleChatPrompt,
  portfolioCopilotPrompt,
  portfolioMatchPrompt,
  summaryPrompt,
  sentimentPrompt,
  relevancePrompt,
  whyItMattersPrompt,
  insightsPrompt,
} from "./prompts";

const DEFAULT_BASE_PATH = "/openai/v1";
const DEFAULT_MODEL = "gpt-5.2";
const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high"]);

type InputMessage = {
  role: "user" | "assistant";
  content: string;
};

type AzureOpenAIResponse = {
  output_text?: string | null;
  output?: Array<{
    type?: string;
    role?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.endsWith(DEFAULT_BASE_PATH)) return `${trimmed}/`;
  if (trimmed.includes("/openai/")) return `${trimmed}/`;
  return `${trimmed}${DEFAULT_BASE_PATH}/`;
}

function extractOutputText(data: AzureOpenAIResponse): string | null {
  const direct = typeof data.output_text === "string" ? data.output_text.trim() : "";
  if (direct) return direct;

  for (const item of data.output ?? []) {
    if (item.type !== "message" || item.role !== "assistant") continue;
    for (const part of item.content ?? []) {
      if (part.type !== "output_text") continue;
      const text = typeof part.text === "string" ? part.text.trim() : "";
      if (text) return text;
    }
  }

  return null;
}

async function respond(
  apiKey: string,
  baseUrl: string,
  model: string,
  system: string,
  input: string | InputMessage[],
  maxOutputTokens: number,
  reasoningEffort?: string,
): Promise<string | null> {
  const body: Record<string, unknown> = {
    model,
    instructions: system,
    input,
    max_output_tokens: maxOutputTokens,
  };

  if (reasoningEffort) {
    body.reasoning = { effort: reasoningEffort };
  }

  const res = await fetch(`${baseUrl}responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as AzureOpenAIResponse & {
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    const detail = data.error?.message ?? res.statusText;
    const azCode = data.error?.code ?? "";
    throw new Error(
      `Azure OpenAI HTTP ${res.status} [${azCode || "unknown"}]: ${detail}`,
    );
  }
  return extractOutputText(data);
}

export function createAzureOpenAIProvider(): IAIProvider {
  const validation = validateAzureConfig();

  if (!validation.ok) {
    const summary = validation.issues.map((i) => `${i.field}: ${i.reason}`).join("; ");
    azureLog.error("Azure OpenAI config invalid — falling back to stub for non-chat methods", {
      issues: validation.issues,
    });

    const chatError = new AIChatError(
      "provider_auth",
      `Azure OpenAI is misconfigured: ${summary}. Check .env and the Azure portal.`,
    );

    return {
      ...stubAIProvider,
      async answerArticleQuestion() {
        throw chatError;
      },
      async answerPortfolioQuestion() {
        throw chatError;
      },
    };
  }

  const key = validation.key;
  const baseUrl = normalizeBaseUrl(validation.baseUrl);
  const model = validation.model || DEFAULT_MODEL;
  const rawEffort = process.env.AZURE_OPENAI_REASONING_EFFORT?.trim().toLowerCase() || "";
  const reasoningEffort = REASONING_EFFORTS.has(rawEffort) ? rawEffort : undefined;

  function msgs(
    p: { system: string; user: string },
    history?: Array<{ role: "user" | "assistant"; content: string }>,
  ) {
    const input = history?.map((message) => ({
      role: message.role,
      content: message.content,
    })) ?? [];
    input.push({ role: "user", content: p.user });
    return {
      system: p.system,
      input,
    };
  }

  return {
    async generateSummary(article, holdings) {
      try {
        const p = summaryPrompt(article, holdings);
        const text = await respond(key, baseUrl, model, p.system, p.user, 150, reasoningEffort);
        return text ?? (await stubAIProvider.generateSummary(article, holdings));
      } catch {
        return stubAIProvider.generateSummary(article, holdings);
      }
    },

    async scoreSentiment(article) {
      try {
        const p = sentimentPrompt(article);
        const word = (await respond(key, baseUrl, model, p.system, p.user, 64, reasoningEffort))
          ?.toLowerCase()
          .trim();
        if (word === "positive" || word === "watch" || word === "negative" || word === "neutral") {
          return word as Sentiment;
        }
      } catch {
        /* fallback */
      }
      return stubAIProvider.scoreSentiment(article);
    },

    async scoreRelevance(article, holdings) {
      try {
        const p = relevancePrompt(article, holdings);
        const raw = await respond(key, baseUrl, model, p.system, p.user, 32, reasoningEffort);
        return parseNumericRelevance(raw);
      } catch {
        return stubAIProvider.scoreRelevance(article, holdings);
      }
    },

    async assessPortfolioMatch(article, holdings): Promise<PortfolioMatchAssessment> {
      try {
        const p = portfolioMatchPrompt(article, holdings);
        const raw = await respond(key, baseUrl, model, p.system, p.user, 250, reasoningEffort);
        return parsePortfolioMatchAssessment(raw, holdings);
      } catch {
        return stubAIProvider.assessPortfolioMatch(article, holdings);
      }
    },

    async generateInsights(holdings, newsContexts) {
      try {
        const p = insightsPrompt(holdings, newsContexts);
        const raw = await respond(key, baseUrl, model, p.system, p.user, 400, reasoningEffort);
        if (raw) {
          const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, "").trim()) as PortfolioInsight[];
          if (Array.isArray(parsed) && parsed.length >= 1) return parsed.slice(0, 3);
        }
      } catch {
        /* fallback */
      }
      return stubAIProvider.generateInsights(holdings, newsContexts);
    },

    async explainWhyItMatters(article, holdings) {
      try {
        const p = whyItMattersPrompt(article, holdings);
        const text = await respond(key, baseUrl, model, p.system, p.user, 100, reasoningEffort);
        return text ?? (await stubAIProvider.explainWhyItMatters(article, holdings));
      } catch {
        return stubAIProvider.explainWhyItMatters(article, holdings);
      }
    },

    async analyzeArticle(headline, content, hintTickers): Promise<ArticleAnalysis> {
      try {
        const p = articleEnrichmentPrompt(headline, content, hintTickers);
        const raw = await respond(key, baseUrl, model, p.system, p.user, 500, reasoningEffort);
        if (raw) {
          const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, "").trim());
          return {
            category: NEWS_CATEGORIES.includes(parsed.category) ? parsed.category : "other",
            globalSummary: parsed.globalSummary || headline,
            overallEffect: ["bullish", "bearish", "neutral"].includes(parsed.overallEffect) ? parsed.overallEffect : "neutral",
            stockTags: Array.isArray(parsed.stockTags)
              ? parsed.stockTags.map((t: string) => String(t).toUpperCase()).filter(Boolean)
              : (hintTickers ?? []),
            tickerImpacts: Array.isArray(parsed.tickerImpacts)
              ? parsed.tickerImpacts
                  .filter((i: { symbol?: string; effect?: string }) => i.symbol && i.effect)
                  .map((i: { symbol: string; effect: string }) => ({
                    symbol: i.symbol.toUpperCase(),
                    effect: ["bullish", "bearish", "neutral"].includes(i.effect) ? i.effect : "neutral",
                  }))
              : [],
          } as ArticleAnalysis;
        }
      } catch {
        /* fallback */
      }
      return stubAIProvider.analyzeArticle(headline, content, hintTickers);
    },

    async answerArticleQuestion(context: ArticleChatContext) {
      const p = articleChatPrompt(context);
      const request = msgs(p, context.history);
      const text = await respond(
        key,
        baseUrl,
        model,
        request.system,
        request.input,
        ARTICLE_CHAT_MAX_TOKENS,
        reasoningEffort,
      );
      return assertNonEmptyArticleChatReply(text);
    },

    async answerPortfolioQuestion(context: PortfolioCopilotContext) {
      try {
        const p = portfolioCopilotPrompt(context);
        const request = msgs(p, context.history);
        const text = await respond(
          key,
          baseUrl,
          model,
          request.system,
          request.input,
          PORTFOLIO_COPILOT_MAX_TOKENS,
          reasoningEffort,
        );
        return text ?? (await stubAIProvider.answerPortfolioQuestion(context));
      } catch {
        return stubAIProvider.answerPortfolioQuestion(context);
      }
    },
  };
}
