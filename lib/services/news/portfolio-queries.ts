/**
 * Provider-agnostic portfolio query builder.
 *
 * Builds keyword queries suitable for any news API that accepts
 * free-text search strings (NewsAPI.ai, NewsCatcher, etc.).
 * The existing GNews-specific builder in gnews-targeting.ts remains
 * for backward compatibility with the current provider set.
 */

const MAX_PORTFOLIO_QUERIES = 8;

type HoldingLike = {
  symbol?: string | null;
  company?: string | null;
};

function normalizeCompanyName(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function buildQuery(holding: HoldingLike): string | null {
  const symbol = (holding.symbol ?? "").trim().toUpperCase();
  const company = normalizeCompanyName(holding.company);

  if (symbol && company && company.toUpperCase() !== symbol) {
    return `"${company}" ${symbol} stock`;
  }
  if (company) {
    return `"${company}" stock`;
  }
  if (symbol) {
    return `${symbol} stock`;
  }
  return null;
}

/**
 * Build up to 8 keyword queries from portfolio holdings.
 * Suitable for APIs that accept generic keyword search strings.
 */
export function buildPortfolioQueries(holdings: HoldingLike[]): string[] {
  const uniqueQueries = new Set<string>();

  const orderedHoldings = [...holdings].sort((left, right) => {
    const leftKey = `${(left.symbol ?? "").toUpperCase()}|${normalizeCompanyName(left.company)}`;
    const rightKey = `${(right.symbol ?? "").toUpperCase()}|${normalizeCompanyName(right.company)}`;
    return leftKey.localeCompare(rightKey);
  });

  for (const holding of orderedHoldings) {
    const query = buildQuery(holding);
    if (!query) continue;
    uniqueQueries.add(query);
    if (uniqueQueries.size >= MAX_PORTFOLIO_QUERIES) break;
  }

  return [...uniqueQueries];
}

export { MAX_PORTFOLIO_QUERIES };
