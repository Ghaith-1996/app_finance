import "server-only";

import type { InvestmentThesis, InvestmentThesisRow } from "@/lib/investment-theses/types";
import { mapInvestmentThesisRow, normalizeThesisSymbol } from "@/lib/investment-theses/utils";

type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => unknown;
  };
};

const THESIS_COLUMNS =
  "id, symbol, portfolio_id, scope, thesis, risks, invalidation_notes, horizon, conviction, created_at, updated_at";

function uniqueSymbols(symbols: string[]): string[] {
  return [
    ...new Set(
      symbols
        .map((symbol) => normalizeThesisSymbol(symbol))
        .filter((symbol): symbol is string => Boolean(symbol)),
    ),
  ];
}

export async function loadInvestmentThesesForSymbols(
  supabase: SupabaseLike,
  symbols: string[],
  portfolioId?: string | null,
): Promise<InvestmentThesis[]> {
  const normalizedSymbols = uniqueSymbols(symbols);
  if (normalizedSymbols.length === 0) return [];

  let query = (
    supabase.from("user_investment_theses").select(THESIS_COLUMNS) as {
      in: (column: string, values: string[]) => unknown;
    }
  ).in("symbol", normalizedSymbols) as {
    is?: (column: string, value: null) => unknown;
    or?: (filter: string) => unknown;
    then: (
      onFulfilled: (value: { data: InvestmentThesisRow[] | null; error: unknown }) => unknown,
    ) => Promise<unknown>;
  };

  if (portfolioId && typeof query.or === "function") {
    query = query.or(`portfolio_id.is.null,portfolio_id.eq.${portfolioId}`) as typeof query;
  } else if (typeof query.is === "function") {
    query = query.is("portfolio_id", null) as typeof query;
  }

  const { data } = (await query) as { data: InvestmentThesisRow[] | null };
  return (data ?? []).map(mapInvestmentThesisRow);
}

export { THESIS_COLUMNS };
