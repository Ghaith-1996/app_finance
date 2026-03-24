import { createLogger } from "@/lib/logger";

const FINNHUB_BASE = "https://finnhub.io/api/v1";
const TIMEOUT_MS = 8_000;

const log = createLogger("finnhub");

export type FinnhubErrorCode =
  | "missing_key"
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "http_error"
  | "bad_payload";

export class FinnhubError extends Error {
  code: FinnhubErrorCode;
  status?: number;

  constructor(code: FinnhubErrorCode, message: string, status?: number) {
    super(message);
    this.name = "FinnhubError";
    this.code = code;
    this.status = status;
  }
}

function apiKey(): string {
  return process.env.FINNHUB_API_KEY ?? "";
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const key = apiKey();
  if (!key) throw new FinnhubError("missing_key", "FINNHUB_API_KEY is not configured.");

  const url = new URL(`${FINNHUB_BASE}${path}`);
  url.searchParams.set("token", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      log.error(`HTTP ${res.status} for ${path}`, { status: res.status });
      if (res.status === 401 || res.status === 403) {
        throw new FinnhubError("unauthorized", `Finnhub rejected the request (${res.status}).`, res.status);
      }
      if (res.status === 429) {
        throw new FinnhubError("rate_limited", "Finnhub rate limit reached.", res.status);
      }
      throw new FinnhubError("http_error", `Finnhub HTTP ${res.status}`, res.status);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new FinnhubError("bad_payload", "Finnhub returned an unparseable response.");
    }
    return body as T;
  } catch (err) {
    if (err instanceof FinnhubError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      log.error(`Timeout after ${TIMEOUT_MS}ms for ${path}`);
      throw new FinnhubError("timeout", `Finnhub request timed out after ${TIMEOUT_MS}ms.`);
    }
    log.error(`Network error for ${path}`, { error: err instanceof Error ? err.message : String(err) });
    throw new FinnhubError("http_error", err instanceof Error ? err.message : "Unknown network error.");
  } finally {
    clearTimeout(timeout);
  }
}

export interface FinnhubSearchResult {
  symbol: string;
  description: string;
  type: string;
  displaySymbol: string;
  primary?: string[];
}

export interface FinnhubQuote {
  c: number;  // current
  d: number;  // change
  dp: number; // percent change
  h: number;  // high
  l: number;  // low
  o: number;  // open
  pc: number; // prev close
  t: number;  // timestamp
}

export interface NormalizedCandidate {
  symbol: string;
  company: string;
  exchange: string;
  type: string;
  price: number | null;
  dayChange: number | null;
  currency: string;
}

/**
 * Search symbols and enrich top results with a live quote.
 * Throws FinnhubError for config/auth/rate-limit/network failures.
 * Individual per-symbol quote failures are swallowed (price stays null).
 */
export async function searchSymbols(query: string): Promise<NormalizedCandidate[]> {
  const raw = await get<{ count: number; result: FinnhubSearchResult[] }>("/search", { q: query });
  const filtered = (raw.result ?? [])
    .filter((r) => ["Common Stock", "ETP", "ETF", "ADR"].includes(r.type))
    .slice(0, 5);

  if (filtered.length === 0) return [];

  const enriched = await Promise.all(
    filtered.map(async (r) => {
      try {
        const q = await getQuote(r.displaySymbol || r.symbol);
        return {
          symbol: (r.displaySymbol || r.symbol).toUpperCase(),
          company: r.description || r.symbol,
          exchange: "",
          type: r.type,
          price: q.c > 0 ? q.c : null,
          dayChange: q.dp !== 0 || q.c > 0 ? Math.round(q.dp * 100) / 100 : null,
          currency: "USD",
        } satisfies NormalizedCandidate;
      } catch {
        return {
          symbol: (r.displaySymbol || r.symbol).toUpperCase(),
          company: r.description || r.symbol,
          exchange: "",
          type: r.type,
          price: null,
          dayChange: null,
          currency: "USD",
        } satisfies NormalizedCandidate;
      }
    }),
  );

  return enriched;
}

export async function getQuote(symbol: string): Promise<FinnhubQuote> {
  return get<FinnhubQuote>("/quote", { symbol });
}
