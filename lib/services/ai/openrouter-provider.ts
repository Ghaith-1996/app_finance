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

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
/** Default: StepFun Step 3.5 Flash (free) — strong on finance; override with OPENROUTER_MODEL. */
const DEFAULT_MODEL = "stepfun/step-3.5-flash:free";

type ChatMessage = {
  content?: string | null;
  /** Reasoning models (e.g. StepFun Step 3.5) may put chain-of-thought here instead of `content`. */
  reasoning?: string | null;
};

type ChatResponse = { choices?: Array<{ message?: ChatMessage }> };

/** Prefer final answer in `content`; fall back to `reasoning` for models that only stream thinking. */
function extractOpenRouterAssistantText(msg: ChatMessage | undefined): string | null {
  if (!msg) return null;
  const c = typeof msg.content === "string" ? msg.content.trim() : "";
  if (c) return c;
  const r = typeof msg.reasoning === "string" ? msg.reasoning.trim() : "";
  return r || null;
}

async function chatComplete(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxTokens: number,
  extraHeaders: Record<string, string>,
): Promise<string | null> {
  const res = await fetch(OPENROUTER_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      // Reasoning models may otherwise fill `reasoning` and leave `content` null while hitting max_tokens.
      // See https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
      reasoning: { exclude: true },
    }),
  });
  const data = (await res.json()) as ChatResponse;
  return extractOpenRouterAssistantText(data.choices?.[0]?.message);
}

export function createOpenRouterProvider(): IAIProvider {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
  const referer =
    process.env.OPENROUTER_HTTP_REFERER?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  const title = process.env.OPENROUTER_APP_NAME?.trim() || "Portfolio Signal";

  const extraHeaders: Record<string, string> = {};
  if (referer) extraHeaders["HTTP-Referer"] = referer;
  if (title) extraHeaders["X-Title"] = title;

  if (!key) return stubAIProvider;

  function msgs(p: { system: string; user: string }) {
    return [
      { role: "system", content: p.system },
      { role: "user", content: p.user },
    ];
  }

  return {
    async generateSummary(article, holdings) {
      try {
        const text = await chatComplete(key, model, msgs(summaryPrompt(article, holdings)), 150, extraHeaders);
        return text ?? (await stubAIProvider.generateSummary(article, holdings));
      } catch {
        return stubAIProvider.generateSummary(article, holdings);
      }
    },

    async scoreSentiment(article) {
      try {
        const word = (await chatComplete(key, model, msgs(sentimentPrompt(article)), 64, extraHeaders))?.toLowerCase().trim();
        if (word === "positive" || word === "watch" || word === "negative" || word === "neutral") {
          return word as Sentiment;
        }
      } catch { /* fallback */ }
      return stubAIProvider.scoreSentiment(article);
    },

    async scoreRelevance(article, holdings) {
      try {
        const raw = await chatComplete(key, model, msgs(relevancePrompt(article, holdings)), 32, extraHeaders);
        return parseNumericRelevance(raw);
      } catch {
        return stubAIProvider.scoreRelevance(article, holdings);
      }
    },

    async assessPortfolioMatch(article, holdings): Promise<PortfolioMatchAssessment> {
      try {
        const raw = await chatComplete(
          key,
          model,
          msgs(portfolioMatchPrompt(article, holdings)),
          250,
          extraHeaders,
        );
        return parsePortfolioMatchAssessment(raw, holdings);
      } catch {
        return stubAIProvider.assessPortfolioMatch(article, holdings);
      }
    },

    async generateInsights(holdings, newsContexts) {
      try {
        const raw = await chatComplete(key, model, msgs(insightsPrompt(holdings, newsContexts)), 400, extraHeaders) ?? "";
        const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, "").trim()) as PortfolioInsight[];
        if (Array.isArray(parsed) && parsed.length >= 1) return parsed.slice(0, 3);
      } catch { /* fallback */ }
      return stubAIProvider.generateInsights(holdings, newsContexts);
    },

    async explainWhyItMatters(article, holdings) {
      try {
        const text = await chatComplete(key, model, msgs(whyItMattersPrompt(article, holdings)), 100, extraHeaders);
        return text ?? (await stubAIProvider.explainWhyItMatters(article, holdings));
      } catch {
        return stubAIProvider.explainWhyItMatters(article, holdings);
      }
    },

    async analyzeArticle(headline, content, hintTickers): Promise<ArticleAnalysis> {
      try {
        const raw = await chatComplete(key, model, msgs(articleEnrichmentPrompt(headline, content, hintTickers)), 500, extraHeaders);
        if (raw) {
          const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, "").trim());
          return {
            category: NEWS_CATEGORIES.includes(parsed.category) ? parsed.category : "other",
            globalSummary: parsed.globalSummary || headline,
            overallEffect: ["bullish", "bearish", "neutral"].includes(parsed.overallEffect) ? parsed.overallEffect : "neutral",
            stockTags: Array.isArray(parsed.stockTags) ? parsed.stockTags.map((t: string) => String(t).toUpperCase()).filter(Boolean) : (hintTickers ?? []),
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
        const text = await chatComplete(key, model, msgs(articleChatPrompt(context)), 350, extraHeaders);
        return text ?? (await stubAIProvider.answerArticleQuestion(context));
      } catch {
        return stubAIProvider.answerArticleQuestion(context);
      }
    },

    async answerPortfolioQuestion(context: PortfolioCopilotContext) {
      try {
        const text = await chatComplete(
          key,
          model,
          msgs(portfolioCopilotPrompt(context)),
          450,
          extraHeaders,
        );
        return text ?? (await stubAIProvider.answerPortfolioQuestion(context));
      } catch {
        return stubAIProvider.answerPortfolioQuestion(context);
      }
    },
  };
}
