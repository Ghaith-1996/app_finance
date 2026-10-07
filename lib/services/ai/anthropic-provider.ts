import type { PortfolioInsight } from "@/lib/types";
import { parseArticleAnalysis } from "./provider";
import type {
  ArticleAnalysis,
  ArticleChatContext,
  IAIProvider,
  PortfolioMatchAssessment,
  PortfolioCopilotContext,
  Sentiment,
} from "./provider";
import { assertNonEmptyArticleChatReply } from "./ai-chat-errors";
import {
  ARTICLE_CHAT_MAX_TOKENS,
  PORTFOLIO_COPILOT_MAX_TOKENS,
  AI_REQUEST_TIMEOUT_MS,
} from "./constants";
import { stubAIProvider } from "./stub-provider";
import { parsePortfolioMatchAssessment } from "./portfolio-match";
import {
  articleEnrichmentPrompt,
  articleChatPrompt,
  portfolioCopilotPrompt,
  portfolioMatchPrompt,
  summaryPrompt,
  sentimentPrompt,
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
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
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

    // No stub fallback: enrichment must see provider failures so the article stays retryable.
    async analyzeArticle(headline, content, hintTickers): Promise<ArticleAnalysis> {
      const p = articleEnrichmentPrompt(headline, content, hintTickers);
      const raw = await ask(key, `${p.system}\n\nHeadline: ${headline}\n\n${(content ?? "").slice(0, 4000)}`, 500);
      if (!raw) throw new Error("Anthropic returned an empty article analysis");
      return parseArticleAnalysis(raw, headline, hintTickers, { dropEmptyStockTags: false });
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

    // Failures surface as errors (503 + quota refund), never as a canned stub answer.
    async answerPortfolioQuestion(context: PortfolioCopilotContext) {
      const p = portfolioCopilotPrompt(context);
      const text = await ask(
        key,
        `${p.system}\n\n${p.user}`,
        PORTFOLIO_COPILOT_MAX_TOKENS,
      );
      return assertNonEmptyArticleChatReply(text);
    },
  };
}
