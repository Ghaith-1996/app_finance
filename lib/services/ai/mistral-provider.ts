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
import { ARTICLE_CHAT_MAX_TOKENS } from "./constants";
import { validateMistralConfig } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { stubAIProvider } from "./stub-provider";
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

const mistralLog = createLogger("mistral");
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type MistralChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

async function respond(
  apiKey: string,
  model: string,
  system: string,
  input: string | Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens: number,
): Promise<string | null> {
  const messages: ChatMessage[] = [{ role: "system", content: system }];

  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else {
    for (const message of input) {
      messages.push({ role: message.role, content: message.content });
    }
  }

  const res = await fetch(MISTRAL_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
    }),
  });

  const data = (await res.json()) as MistralChatResponse;
  if (!res.ok) {
    const detail = data.error?.message ?? res.statusText;
    throw new Error(`Mistral HTTP ${res.status}: ${detail}`);
  }

  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

export function createMistralProvider(): IAIProvider {
  const validation = validateMistralConfig();

  if (!validation.ok) {
    const summary = validation.issues.map((issue) => `${issue.field}: ${issue.reason}`).join("; ");
    mistralLog.error("Mistral config invalid — falling back to stub for non-chat methods", {
      issues: validation.issues,
    });

    const chatError = new AIChatError(
      "provider_auth",
      `Mistral is misconfigured: ${summary}. Check .env and the Mistral dashboard.`,
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
  const model = validation.model;

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
        const text = await respond(key, model, p.system, p.user, 150);
        return text ?? (await stubAIProvider.generateSummary(article, holdings));
      } catch {
        return stubAIProvider.generateSummary(article, holdings);
      }
    },

    async scoreSentiment(article) {
      try {
        const p = sentimentPrompt(article);
        const word = (await respond(key, model, p.system, p.user, 64))?.toLowerCase().trim();
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
        const raw = await respond(key, model, p.system, p.user, 32);
        return parseNumericRelevance(raw);
      } catch {
        return stubAIProvider.scoreRelevance(article, holdings);
      }
    },

    async assessPortfolioMatch(article, holdings): Promise<PortfolioMatchAssessment> {
      try {
        const p = portfolioMatchPrompt(article, holdings);
        const raw = await respond(key, model, p.system, p.user, 250);
        return parsePortfolioMatchAssessment(raw, holdings);
      } catch {
        return stubAIProvider.assessPortfolioMatch(article, holdings);
      }
    },

    async generateInsights(holdings, newsContexts) {
      try {
        const p = insightsPrompt(holdings, newsContexts);
        const raw = await respond(key, model, p.system, p.user, 400);
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
        const text = await respond(key, model, p.system, p.user, 100);
        return text ?? (await stubAIProvider.explainWhyItMatters(article, holdings));
      } catch {
        return stubAIProvider.explainWhyItMatters(article, holdings);
      }
    },

    async analyzeArticle(headline, content, hintTickers): Promise<ArticleAnalysis> {
      try {
        const p = articleEnrichmentPrompt(headline, content, hintTickers);
        const raw = await respond(key, model, p.system, p.user, 500);
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
        model,
        request.system,
        request.input,
        ARTICLE_CHAT_MAX_TOKENS,
      );
      return assertNonEmptyArticleChatReply(text);
    },

    async answerPortfolioQuestion(context: PortfolioCopilotContext) {
      try {
        const p = portfolioCopilotPrompt(context);
        const request = msgs(p, context.history);
        const text = await respond(key, model, request.system, request.input, 450);
        return text ?? (await stubAIProvider.answerPortfolioQuestion(context));
      } catch {
        return stubAIProvider.answerPortfolioQuestion(context);
      }
    },
  };
}
