import type { MatchReasonCode, TickerImpact } from "@/lib/types";

export interface DirectStockMatch {
  matchedTags: string[];
  matchedImpacts: string[];
  matchedSymbols: string[];
  matchReasonCodes: MatchReasonCode[];
}

function uniqueUppercase(values: string[]): string[] {
  return [...new Set(values.map((value) => value.toUpperCase()).filter(Boolean))];
}

export function resolveDirectStockMatch(
  articleTags: string[],
  tickerImpacts: TickerImpact[],
  holdingSymbols: Iterable<string>,
): DirectStockMatch {
  const holdingSet = new Set(
    [...holdingSymbols].map((symbol) => symbol.toUpperCase()).filter(Boolean),
  );

  const matchedTags = uniqueUppercase(articleTags).filter((tag) => holdingSet.has(tag));
  const matchedImpacts = uniqueUppercase(
    tickerImpacts.map((impact) => impact.symbol),
  ).filter((symbol) => holdingSet.has(symbol));
  const matchedSymbols = uniqueUppercase([...matchedTags, ...matchedImpacts]);

  const matchReasonCodes: MatchReasonCode[] = [];
  if (matchedTags.length > 0) matchReasonCodes.push("held_ticker_tag");
  if (matchedImpacts.length > 0) matchReasonCodes.push("held_ticker_impact");

  return {
    matchedTags,
    matchedImpacts,
    matchedSymbols,
    matchReasonCodes,
  };
}
