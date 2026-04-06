import type { HoldingContext, PortfolioMatchAssessment } from "./provider";
import type { MatchReasonCode } from "@/lib/types";

const VALID_REASON_CODES: MatchReasonCode[] = [
  "held_ticker_tag",
  "held_ticker_impact",
  "held_company_mention",
  "sector_exposure_explicit",
];

export function emptyPortfolioMatchAssessment(): PortfolioMatchAssessment {
  return {
    relevanceScore: 0,
    whyItMatters: "",
    matchedHoldings: [],
    matchReasonCodes: [],
  };
}

export function parseNumericRelevance(raw: string | null | undefined): number {
  const match = String(raw ?? "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return 0;

  const parsed = Number(match[0]);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(100, Math.max(0, parsed));
}

export function parsePortfolioMatchAssessment(
  raw: string | null | undefined,
  holdings: HoldingContext[],
): PortfolioMatchAssessment {
  if (!raw) return emptyPortfolioMatchAssessment();

  try {
    const parsed = JSON.parse(raw.replace(/```json?\s*|\s*```/g, "").trim()) as {
      relevanceScore?: unknown;
      whyItMatters?: unknown;
      matchedHoldings?: unknown;
      matchReasonCodes?: unknown;
    };

    const holdingSymbols = new Set(
      holdings.map((holding) => holding.symbol.toUpperCase()),
    );

    const matchedHoldings = Array.isArray(parsed.matchedHoldings)
      ? parsed.matchedHoldings
          .map((value) => String(value).trim().toUpperCase())
          .filter((value) => holdingSymbols.has(value))
      : [];

    const matchReasonCodes = Array.isArray(parsed.matchReasonCodes)
      ? parsed.matchReasonCodes
          .map((value) => String(value).trim())
          .filter((value): value is MatchReasonCode =>
            VALID_REASON_CODES.includes(value as MatchReasonCode),
          )
      : [];

    return {
      relevanceScore: parseNumericRelevance(String(parsed.relevanceScore ?? "")),
      whyItMatters:
        typeof parsed.whyItMatters === "string" ? parsed.whyItMatters.trim() : "",
      matchedHoldings: [...new Set(matchedHoldings)],
      matchReasonCodes: [...new Set(matchReasonCodes)],
    };
  } catch {
    return emptyPortfolioMatchAssessment();
  }
}
