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
import { assertNonEmptyArticleChatReply } from "./ai-chat-errors";
import { ARTICLE_CHAT_MAX_TOKENS } from "./constants";
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

type AnthropicResponse = { content?: Array<{ text?: string }>; error?: { message?: string } };

async function ask(
  key: string,
  prompt: string,
  maxTokens: number,
): Promise<string | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = (await res.json()) as AnthropicResponse;
  if (!res.ok) {
    const detail = data.error?.message ?? res.statusText;
    throw new Error(`Anthropic HTTP ${res.status}: ${detail}`);
  }
  return data.content?.[0]?.text?.trim() ?? null;
}

export function createAnthropicProvider(): IAIProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return stubAIProvider;

  return {
    async generateSummary(article, holdings) {
      try {
        const p = summaryPrompt(article, holdings);
        const text = await ask(key, `${p.system}\n\n${p.user}`, 150);
        return text ?? (await stubAIProvider.generateSummary(article, holdings));
      } catch {
        return stubAIProvider.generateSummary(article, holdings);
      }
    },

    async scoreSentiment(article) {
      try {
        const p = sentimentPrompt(article);
        const word = (await ask(key, `${p.system}\n\n${p.user}`, 10))?.toLowerCase();
        if (word === "positive" || word === "watch" || word === "negative" || word === "neutral") {
          return word as Sentiment;
        }
      } catch { /* fallback */ }
      return stubAIProvider.scoreSentiment(article);
    },

    async scoreRelevance(article, holdings) {
      try {
        const p = relevancePrompt(article, holdings);
        const raw = await ask(key, `${p.system}\n\n${p.user}`, 5);
        return parseNumericRelevance(raw);
      } catch {
        return stubAIProvider.scoreRelevance(article, holdings);
      }
    },

    async assessPortfolioMatch(article, holdings): Promise<PortfolioMatchAssessment> {
      try {
        const p = portfolioMatchPrompt(article, holdings);
        const raw = await ask(key, `${p.system}\n\n${p.user}`, 250);
        return parsePortfolioMatchAssessment(raw, holdings);
      } catch {
        return stubAIProvider.assessPortfolioMatch(article, holdings);
      }
    },

    async generateInsights(holdings, newsContexts) {
      try {
        const p = insightsPrompt(holdings, newsContexts);
        const raw = await ask(key, `${p.system}\n\n${p.user}`, 400);
        if (raw) {
          const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, "").trim()) as PortfolioInsight[];
          if (Array.isArray(parsed) && parsed.length >= 1) return parsed.slice(0, 3);
        }
      } catch { /* fallback */ }
      return stubAIProvider.generateInsights(holdings, newsContexts);
    },

    async explainWhyItMatters(article, holdings) {
      try {
        const p = whyItMattersPrompt(article, holdings);
        const text = await ask(key, `${p.system}\n\n${p.user}`, 100);
        return text ?? (await stubAIProvider.explainWhyItMatters(article, holdings));
      } catch {
        return stubAIProvider.explainWhyItMatters(article, holdings);
      }
    },

    async analyzeArticle(headline, content, hintTickers): Promise<ArticleAnalysis> {
      try {
        const p = articleEnrichmentPrompt(headline, content, hintTickers);
        const raw = await ask(key, `${p.system}\n\nHeadline: ${headline}\n\n${(content ?? "").slice(0, 4000)}`, 500);
        if (raw) {
          const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, "").trim());
          return {
            category: NEWS_CATEGORIES.includes(parsed.category) ? parsed.category : "other",
            globalSummary: parsed.globalSummary || headline,
            overallEffect: ["bullish", "bearish", "neutral"].includes(parsed.overallEffect) ? parsed.overallEffect : "neutral",
            stockTags: Array.isArray(parsed.stockTags) ? parsed.stockTags.map((t: string) => String(t).toUpperCase()) : (hintTickers ?? []),
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
      } catch { /* fallback */ }
      return stubAIProvider.analyzeArticle(headline, content, hintTickers);
    },

    async answerArticleQuestion(context: ArticleChatContext) {
      const p = articleChatPrompt(context);
      const text = await ask(
        key,
        `${p.system}\n\n${p.user}`,
        ARTICLE_CHAT_MAX_TOKENS,
      );
      return assertNonEmptyArticleChatReply(text);
    },

    async answerPortfolioQuestion(context: PortfolioCopilotContext) {
      try {
        const p = portfolioCopilotPrompt(context);
        const text = await ask(key, `${p.system}\n\n${p.user}`, 450);
        return text ?? (await stubAIProvider.answerPortfolioQuestion(context));
      } catch {
        return stubAIProvider.answerPortfolioQuestion(context);
      }
    },
  };
}
