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

type ChatResponse = { choices?: Array<{ message?: { content?: string } }> };

async function chat(
  key: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
): Promise<string | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      max_tokens: maxTokens,
    }),
  });
  const data = (await res.json()) as ChatResponse;
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

export function createOpenAIProvider(): IAIProvider {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return stubAIProvider;

  return {
    async generateSummary(article, holdings) {
      try {
        const p = summaryPrompt(article, holdings);
        const text = await chat(key, [{ role: "system", content: p.system }, { role: "user", content: p.user }], 150);
        return text ?? (await stubAIProvider.generateSummary(article, holdings));
      } catch {
        return stubAIProvider.generateSummary(article, holdings);
      }
    },

    async scoreSentiment(article) {
      try {
        const p = sentimentPrompt(article);
        const word = (await chat(key, [{ role: "system", content: p.system }, { role: "user", content: p.user }], 10))?.toLowerCase();
        if (word === "positive" || word === "watch" || word === "negative" || word === "neutral") {
          return word as Sentiment;
        }
      } catch { /* fallback */ }
      return stubAIProvider.scoreSentiment(article);
    },

    async scoreRelevance(article, holdings) {
      try {
        const p = relevancePrompt(article, holdings);
        const raw = await chat(key, [{ role: "system", content: p.system }, { role: "user", content: p.user }], 5);
        return parseNumericRelevance(raw);
      } catch {
        return stubAIProvider.scoreRelevance(article, holdings);
      }
    },

    async assessPortfolioMatch(article, holdings): Promise<PortfolioMatchAssessment> {
      try {
        const p = portfolioMatchPrompt(article, holdings);
        const raw = await chat(
          key,
          [{ role: "system", content: p.system }, { role: "user", content: p.user }],
          250,
        );
        return parsePortfolioMatchAssessment(raw, holdings);
      } catch {
        return stubAIProvider.assessPortfolioMatch(article, holdings);
      }
    },

    async generateInsights(holdings, newsContexts) {
      try {
        const p = insightsPrompt(holdings, newsContexts);
        const raw = await chat(key, [{ role: "system", content: p.system }, { role: "user", content: p.user }], 400);
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
        const text = await chat(key, [{ role: "system", content: p.system }, { role: "user", content: p.user }], 100);
        return text ?? (await stubAIProvider.explainWhyItMatters(article, holdings));
      } catch {
        return stubAIProvider.explainWhyItMatters(article, holdings);
      }
    },

    async analyzeArticle(headline, content, hintTickers): Promise<ArticleAnalysis> {
      try {
        const p = articleEnrichmentPrompt(headline, content, hintTickers);
        const raw = await chat(key, [{ role: "system", content: p.system }, { role: "user", content: p.user }], 500);
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
      try {
        const p = articleChatPrompt(context);
        const text = await chat(key, [{ role: "system", content: p.system }, { role: "user", content: p.user }], 350);
        return text ?? (await stubAIProvider.answerArticleQuestion(context));
      } catch {
        return stubAIProvider.answerArticleQuestion(context);
      }
    },

    async answerPortfolioQuestion(context: PortfolioCopilotContext) {
      try {
        const p = portfolioCopilotPrompt(context);
        const text = await chat(
          key,
          [{ role: "system", content: p.system }, { role: "user", content: p.user }],
          450,
        );
        return text ?? (await stubAIProvider.answerPortfolioQuestion(context));
      } catch {
        return stubAIProvider.answerPortfolioQuestion(context);
      }
    },
  };
}
