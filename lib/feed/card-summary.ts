import type { NewsItem } from "@/lib/types";

/**
 * The one summary sentence a feed card shows (audit D02). AI summaries often open by restating
 * the headline; that prefix is removed so the card adds information instead of repeating it.
 * Returns "" when the summary is only the headline.
 */
export function cardSummary(story: Pick<NewsItem, "headline" | "globalSummary" | "aiSummary">): string {
  const text = (story.globalSummary || story.aiSummary || "").trim();
  return stripHeadlinePrefix(text, story.headline);
}

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function stripHeadlinePrefix(text: string, headline: string): string {
  const head = normalize(headline);
  if (!text || !head || !normalize(text).startsWith(head)) return text;

  const headlineWords = headline.trim().split(/\s+/).length;
  const rest = text
    .split(/\s+/)
    .slice(headlineWords)
    .join(" ")
    .replace(/^[\s:;,.\-–—]+/, "");
  return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : "";
}
