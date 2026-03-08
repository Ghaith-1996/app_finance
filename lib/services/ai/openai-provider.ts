import type { Holding, PortfolioInsight } from "@/lib/types";
import type { IAIProvider, NewsContext, Sentiment } from "./provider";
import { stubAIProvider } from "./stub-provider";

/**
 * OpenAI-based AI provider. Uses stub when OPENAI_API_KEY is not set.
 */
export function createOpenAIProvider(): IAIProvider {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return stubAIProvider;
  }

  return {
    async generateSummary(article, holdings) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Summarize this financial news in 1-2 sentences for an investor who holds: ${holdings.map((h) => h.symbol).join(", ")}.`,
              },
              { role: "user", content: article.slice(0, 4000) },
            ],
            max_tokens: 150,
          }),
        });
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content?.trim();
        return text ?? (await stubAIProvider.generateSummary(article, holdings));
      } catch {
        return stubAIProvider.generateSummary(article, holdings);
      }
    },

    async scoreSentiment(article) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "Reply with exactly one word: positive, watch, negative, or neutral.",
              },
              { role: "user", content: `Sentiment of this headline: ${article.slice(0, 500)}` },
            ],
            max_tokens: 10,
          }),
        });
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const word = data.choices?.[0]?.message?.content?.trim()?.toLowerCase();
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
        const symbols = holdings.map((h) => h.symbol).join(", ");
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Reply with a number from 0 to 100 indicating how relevant this news is to an investor holding: ${symbols}. Only output the number.`,
              },
              { role: "user", content: article.slice(0, 1000) },
            ],
            max_tokens: 5,
          }),
        });
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const num = parseInt(
          data.choices?.[0]?.message?.content?.replace(/\D/g, "") ?? "75",
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
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `Given holdings (symbols: ${holdings.map((h) => h.symbol).join(", ")}) and these headlines, output 3 short insights as JSON array: [{ "title": "...", "value": "...", "detail": "..." }]. Title should be short (e.g. "Most exposed theme"), value a phrase, detail a sentence.`,
              },
              { role: "user", content: headlines },
            ],
            max_tokens: 400,
          }),
        });
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const raw = data.choices?.[0]?.message?.content ?? "";
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
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `In one sentence, explain why this news matters to an investor holding: ${holdings.map((h) => h.symbol).join(", ")}.`,
              },
              { role: "user", content: article.slice(0, 3000) },
            ],
            max_tokens: 100,
          }),
        });
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content?.trim();
        return text ?? (await stubAIProvider.explainWhyItMatters(article, holdings));
      } catch {
        return stubAIProvider.explainWhyItMatters(article, holdings);
      }
    },
  };
}
