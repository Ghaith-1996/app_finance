import type {
  InvestmentThesis,
  InvestmentThesisConviction,
  InvestmentThesisHorizon,
  InvestmentThesisHistoryItem,
  InvestmentThesisHistoryRow,
  InvestmentThesisRow,
  InvestmentThesisScope,
} from "@/lib/investment-theses/types";

const MAX_TEXT_LENGTH = 1200;
const MAX_RISKS = 8;

export function normalizeThesisSymbol(value: string): string | null {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (normalized.length < 1 || normalized.length > 16) return null;
  return normalized;
}

export function normalizeThesisText(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT_LENGTH);
}

export function normalizeRiskList(value: string[] | string): string[] {
  const rawItems = Array.isArray(value) ? value : value.split(/\r?\n|;/);
  return [
    ...new Set(
      rawItems
        .map((item) => normalizeThesisText(item))
        .filter((item) => item.length > 0),
    ),
  ].slice(0, MAX_RISKS);
}

export function normalizeThesisScope(value: string | null | undefined): InvestmentThesisScope {
  return value === "watchlist" ? "watchlist" : "holding";
}

export function normalizeThesisHorizon(value: string | null | undefined): InvestmentThesisHorizon {
  if (value === "watch" || value === "short" || value === "long") return value;
  return "medium";
}

export function normalizeThesisConviction(
  value: string | null | undefined,
): InvestmentThesisConviction {
  if (value === "low" || value === "high") return value;
  return "medium";
}

export function mapInvestmentThesisRow(row: InvestmentThesisRow): InvestmentThesis {
  return {
    id: row.id,
    symbol: normalizeThesisSymbol(row.symbol) ?? row.symbol,
    portfolioId: row.portfolio_id,
    scope: normalizeThesisScope(row.scope),
    thesis: row.thesis ?? "",
    risks: row.risks ?? [],
    invalidationNotes: row.invalidation_notes ?? "",
    horizon: normalizeThesisHorizon(row.horizon),
    conviction: normalizeThesisConviction(row.conviction),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapInvestmentThesisHistoryRow(
  row: InvestmentThesisHistoryRow,
): InvestmentThesisHistoryItem {
  const changeType =
    row.change_type === "created" || row.change_type === "deleted"
      ? row.change_type
      : "updated";

  return {
    id: row.id,
    thesisId: row.thesis_id,
    symbol: normalizeThesisSymbol(row.symbol) ?? row.symbol,
    portfolioId: row.portfolio_id,
    scope: normalizeThesisScope(row.scope),
    thesis: row.thesis ?? "",
    risks: row.risks ?? [],
    invalidationNotes: row.invalidation_notes ?? "",
    horizon: normalizeThesisHorizon(row.horizon),
    conviction: normalizeThesisConviction(row.conviction),
    changeType,
    capturedAt: row.captured_at,
  };
}
