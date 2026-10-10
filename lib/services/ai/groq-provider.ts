import { parseArticleAnalysis } from "./provider";
import type { ArticleAnalysis, IAIProvider } from "./provider";
import { AIChatError } from "./ai-chat-errors";
import { AI_REQUEST_TIMEOUT_MS } from "./constants";
import { articleEnrichmentPrompt } from "./prompts";

const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";
/** Measured on the enrichment prompt: medium reasoning + JSON mode parsed every reply in under 1 s. */
const DEFAULT_MODEL = "openai/gpt-oss-120b";

type ChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

/** Groq handles article enrichment only; chat and analysis never use it. */
export function createGroqEnrichmentProvider(): Pick<IAIProvider, "analyzeArticle"> {
  const key = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_MODEL;

  return {
    async analyzeArticle(headline, content, hintTickers): Promise<ArticleAnalysis> {
      if (!key) throw new AIChatError("provider_auth", "Groq is misconfigured: GROQ_API_KEY is missing.");
      const p = articleEnrichmentPrompt(headline, content, hintTickers);
      const res = await fetch(GROQ_BASE, {
        method: "POST",
        signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: p.system },
            { role: "user", content: p.user },
          ],
          max_completion_tokens: 1000,
          reasoning_effort: "medium",
          response_format: { type: "json_object" },
        }),
      });
      const data = (await res.json()) as ChatResponse;
      if (!res.ok) {
        throw new Error(`Groq HTTP ${res.status}: ${data.error?.message ?? res.statusText}`);
      }
      const raw = data.choices?.[0]?.message?.content?.trim();
      if (!raw) throw new Error("Groq returned an empty article analysis");
      return parseArticleAnalysis(raw, headline, hintTickers, { dropEmptyStockTags: true });
    },
  };
}
