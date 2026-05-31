const MAX_GNEWS_TARGET_QUERIES = 8;

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

export function buildGnewsPortfolioQueries(holdings: HoldingLike[]): string[] {
  const uniqueQueries = new Set<string>();

  const orderedHoldings = [...holdings].sort((left, right) => {
    const leftHasCompany = normalizeCompanyName(left.company) ? 1 : 0;
    const rightHasCompany = normalizeCompanyName(right.company) ? 1 : 0;
    if (leftHasCompany !== rightHasCompany) {
      return leftHasCompany - rightHasCompany;
    }
    const leftKey = `${(left.symbol ?? "").toUpperCase()}|${normalizeCompanyName(left.company)}`;
    const rightKey = `${(right.symbol ?? "").toUpperCase()}|${normalizeCompanyName(right.company)}`;
    return leftKey.localeCompare(rightKey);
  });

  for (const holding of orderedHoldings) {
    const query = buildQuery(holding);
    if (!query) continue;
    uniqueQueries.add(query);
    if (uniqueQueries.size >= MAX_GNEWS_TARGET_QUERIES) break;
  }

  return [...uniqueQueries];
}

export { MAX_GNEWS_TARGET_QUERIES };
