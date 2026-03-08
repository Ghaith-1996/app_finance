import YahooFinance from "yahoo-finance2";

export interface StockQuote {
  symbol: string;
  price: number;
  previousClose: number;
  dailyChange: number;
  dailyChangePercent: number;
  marketCap: number | null;
  name: string;
  exchange: string;
  currency: string;
}

const yf = new YahooFinance();

export async function getQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const result = await yf.quote(symbol);
    if (!result || !result.regularMarketPrice) return null;

    const price = result.regularMarketPrice;
    const prevClose = result.regularMarketPreviousClose ?? price;
    const change = price - prevClose;
    const changePercent =
      prevClose > 0 ? (change / prevClose) * 100 : 0;

    return {
      symbol: result.symbol ?? symbol,
      price,
      previousClose: prevClose,
      dailyChange: Math.round(changePercent * 100) / 100,
      dailyChangePercent: Math.round(changePercent * 100) / 100,
      marketCap: result.marketCap ?? null,
      name: result.shortName ?? result.longName ?? symbol,
      exchange: result.fullExchangeName ?? result.exchange ?? "",
      currency: result.currency ?? "USD",
    };
  } catch {
    return null;
  }
}

export async function getQuotes(
  symbols: string[]
): Promise<Map<string, StockQuote>> {
  const results = new Map<string, StockQuote>();
  const batchSize = 10;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const settled = await Promise.allSettled(batch.map(getQuote));

    for (let j = 0; j < batch.length; j++) {
      const result = settled[j];
      if (result.status === "fulfilled" && result.value) {
        results.set(batch[j].toUpperCase(), result.value);
      }
    }
  }

  return results;
}

export async function searchSymbol(
  query: string
): Promise<Array<{ symbol: string; name: string; exchange: string; type: string }>> {
  try {
    const result = await yf.search(query);
    return (result.quotes ?? [])
      .filter(
        (q): q is typeof q & { symbol: string } =>
          "symbol" in q && typeof q.symbol === "string"
      )
      .slice(0, 8)
      .map((q) => ({
        symbol: q.symbol,
        name: ("shortname" in q ? (q as Record<string, unknown>).shortname as string : "") || q.symbol,
        exchange: ("exchange" in q ? (q as Record<string, unknown>).exchange as string : "") || "",
        type: ("quoteType" in q ? (q as Record<string, unknown>).quoteType as string : "") || "equity",
      }));
  } catch {
    return [];
  }
}
