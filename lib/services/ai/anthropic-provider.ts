import type { Holding, PortfolioInsight } from "@/lib/types";
import type { IAIProvider, NewsContext, Sentiment } from "./provider";
import { stubAIProvider } from "./stub-provider";

/**
 * Anthropic Claude-based AI provider. Uses stub when ANTHROPIC_API_KEY is not set.
 */
export function createAnthropicProvider(): IAIProvider {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return stubAIProvider;
  }

  return {
    async generateSummary(article, holdings) {
      try {
        const res = await fetch(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-3-5-haiku-20241022",
              max_tokens: 150,
              messages: [
                {
                  role: "user",
                  content: `Summarize this financial news in 1-2 sentences for an investor who holds: ${holdings.map((h) => h.symbol).join(", ")}.\n\n${article.slice(0, 4000)}`,
                },
              ],
            }),
          }
        );
        const data = (await res.json()) as { content?: Array<{ text?: string }> };
        const text = data.content?.[0]?.text?.trim();
        return text ?? (await stubAIProvider.generateSummary(article, holdings));
      } catch {
        return stubAIProvider.generateSummary(article, holdings);
      }
    },

    async scoreSentiment(article) {
      try {
        const res = await fetch(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-3-5-haiku-20241022",
              max_tokens: 10,
              messages: [
                {
                  role: "user",
                  content: `Reply with exactly one word: positive, watch, negative, or neutral. Sentiment of: ${article.slice(0, 500)}`,
                },
              ],
            }),
          }
        );
        const data = (await res.json()) as { content?: Array<{ text?: string }> };
        const word = data.content?.[0]?.text?.trim()?.toLowerCase();
        if (
          word === "positive" ||
          word === "watch" ||
          word === "negative" ||
          word === "neutral"
        ) {
          return word as Sentiment;
        }
      } catch {
        // fallback
      }
      return stubAIProvider.scoreSentiment(article);
    },

    async scoreRelevance(article, holdings) {
      try {
        const res = await fetch(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-3-5-haiku-20241022",
              max_tokens: 5,
              messages: [
                {
                  role: "user",
                  content: `Reply with a number 0-100 for relevance to holdings ${holdings.map((h) => h.symbol).join(", ")}. Only the number.\n\n${article.slice(0, 1000)}`,
                },
              ],
            }),
          }
        );
        const data = (await res.json()) as { content?: Array<{ text?: string }> };
        const num = parseInt(
          data.content?.[0]?.text?.replace(/\D/g, "") ?? "75",
          10
        );
        return Math.min(100, Math.max(0, num));
      } catch {
        return stubAIProvider.scoreRelevance(article, holdings);
      }
    },

    async generateInsights(holdings, newsContexts) {
      try {
        const headlines = newsContexts.map((n) => n.headline).slice(0, 10).join("\n");
        const res = await fetch(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-3-5-haiku-20241022",
              max_tokens: 400,
              messages: [
                {
                  role: "user",
                  content: `Holdings: ${holdings.map((h) => h.symbol).join(", ")}. Headlines:\n${headlines}\n\nOutput 3 insights as JSON array: [{"title":"...","value":"...","detail":"..."}].`,
                },
              ],
            }),
          }
        );
        const data = (await res.json()) as { content?: Array<{ text?: string }> };
        const raw = data.content?.[0]?.text ?? "";
        const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, "").trim()) as PortfolioInsight[];
        if (Array.isArray(parsed) && parsed.length >= 1) {
          return parsed.slice(0, 3);
        }
      } catch {
        // fallback
      }
      return stubAIProvider.generateInsights(holdings, newsContexts);
    },

    async explainWhyItMatters(article, holdings) {
      try {
        const res = await fetch(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": key,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-3-5-haiku-20241022",
              max_tokens: 100,
              messages: [
                {
                  role: "user",
                  content: `In one sentence, why does this news matter to an investor holding ${holdings.map((h) => h.symbol).join(", ")}?\n\n${article.slice(0, 3000)}`,
                },
              ],
            }),
          }
        );
        const data = (await res.json()) as { content?: Array<{ text?: string }> };
        const text = data.content?.[0]?.text?.trim();
        return text ?? (await stubAIProvider.explainWhyItMatters(article, holdings));
      } catch {
        return stubAIProvider.explainWhyItMatters(article, holdings);
      }
    },
  };
}
