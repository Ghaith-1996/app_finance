import type { InvestmentThesis, InvestmentThesisMatch } from "@/lib/investment-theses/types";
import type { NewsItem, TickerImpact } from "@/lib/types";

type ThesisMatchStory = Pick<
  NewsItem,
  | "headline"
  | "globalSummary"
  | "stockTags"
  | "tickerImpacts"
  | "matchedStockTags"
  | "holdings"
  | "aiSummary"
  | "whyItMatters"
>;

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9%.$\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, max = 54): string {
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value;
}

function storySymbols(story: ThesisMatchStory): Set<string> {
  return new Set(
    [
      ...(story.stockTags ?? []),
      ...(story.matchedStockTags ?? []),
      ...(story.holdings ?? []),
      ...((story.tickerImpacts ?? []) as TickerImpact[]).map((impact) => impact.symbol),
    ]
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean),
  );
}

function storyText(story: ThesisMatchStory): string {
  return normalizeForSearch(
    [
      story.headline,
      story.globalSummary,
      story.aiSummary,
      story.whyItMatters,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function findRiskTerm(storyTextValue: string, thesis: InvestmentThesis): string | null {
  const candidates = [
    ...thesis.risks,
    ...thesis.invalidationNotes.split(/[.;\n]/),
  ]
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);

  for (const candidate of candidates) {
    const searchable = normalizeForSearch(candidate);
    if (searchable.length >= 4 && storyTextValue.includes(searchable)) {
      return candidate;
    }
  }

  return null;
}

export function buildInvestmentThesisMatches(
  story: ThesisMatchStory,
  theses: InvestmentThesis[],
): InvestmentThesisMatch[] {
  const symbols = storySymbols(story);
  if (symbols.size === 0 || theses.length === 0) return [];

  const text = storyText(story);
  return theses
    .filter((thesis) => symbols.has(thesis.symbol))
    .map((thesis) => {
      const riskTerm = findRiskTerm(text, thesis);
      if (riskTerm) {
        return {
          symbol: thesis.symbol,
          label: `${thesis.symbol} risk`,
          detail: `Touches saved risk: ${truncate(riskTerm)}`,
          tone: "watch",
        } satisfies InvestmentThesisMatch;
      }

      return {
        symbol: thesis.symbol,
        label: `${thesis.symbol} thesis`,
        detail:
          thesis.thesis.length > 0
            ? truncate(thesis.thesis, 72)
            : "Saved thesis is linked by ticker exposure.",
        tone: "neutral",
      } satisfies InvestmentThesisMatch;
    })
    .slice(0, 3);
}
