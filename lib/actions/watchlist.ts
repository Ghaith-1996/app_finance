"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { searchSymbols, getQuote, FinnhubError } from "@/lib/services/finnhub";
import { getWatchlistDetail } from "@/lib/services/twelvedata";
import { createLogger } from "@/lib/logger";

const log = createLogger("watchlist");
import type {
  WatchlistItemRecord,
  WatchlistItemData,
  WatchlistSearchCandidate,
  SearchCandidatesResult,
  AddWatchlistResult,
  DeleteWatchlistResult,
} from "@/lib/watchlist/watchlist-data";
import type { WatchlistDetailData } from "@/lib/services/twelvedata";

/** Load the authenticated user's saved watchlist rows. */
export async function loadWatchlistItems(): Promise<WatchlistItemData[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("watchlist_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return (data as WatchlistItemRecord[]).map((row) => ({
    id: row.id,
    symbol: row.symbol,
    company: row.company,
    exchange: row.exchange,
    price: row.price ?? null,
    dayChange: row.day_change ?? null,
    currency: row.currency,
  }));
}

/** Refresh prices for all saved watchlist items via Finnhub. */
export async function refreshWatchlistPrices(): Promise<WatchlistItemData[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: rows } = await supabase
    .from("watchlist_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (!rows || rows.length === 0) return [];

  const updated: WatchlistItemData[] = await Promise.all(
    (rows as WatchlistItemRecord[]).map(async (row) => {
      try {
        const q = await getQuote(row.symbol);
        const price = q.c > 0 ? q.c : null;
        const dayChange = q.dp !== 0 || q.c > 0 ? Math.round(q.dp * 100) / 100 : null;
        if (price != null) {
          await supabase
            .from("watchlist_items")
            .update({ price, day_change: dayChange ?? 0 })
            .eq("id", row.id);
        }
        return {
          id: row.id,
          symbol: row.symbol,
          company: row.company,
          exchange: row.exchange,
          price,
          dayChange,
          currency: row.currency,
        };
      } catch {
        return {
          id: row.id,
          symbol: row.symbol,
          company: row.company,
          exchange: row.exchange,
          price: row.price ?? null,
          dayChange: row.day_change ?? null,
          currency: row.currency,
        };
      }
    }),
  );

  return updated;
}

/** Search Finnhub for symbol candidates. Explicit invocation only. */
export async function searchWatchlistCandidates(query: string): Promise<SearchCandidatesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const trimmed = query.trim();
  if (!trimmed) return { ok: false, error: "Enter a ticker or company name." };

  try {
    const results = await searchSymbols(trimmed);
    if (results.length === 0) {
      return { ok: true, results: [] };
    }
    const candidates: WatchlistSearchCandidate[] = results.map((r) => ({
      symbol: r.symbol,
      company: r.company,
      exchange: r.exchange,
      price: r.price,
      dayChange: r.dayChange,
      currency: r.currency,
    }));
    return { ok: true, results: candidates };
  } catch (err) {
    if (err instanceof FinnhubError) {
      log.error(`Search failed: ${err.code}`, { code: err.code, status: err.status });
      switch (err.code) {
        case "missing_key":
          return { ok: false, error: "Watchlist search is not configured." };
        case "unauthorized":
          return { ok: false, error: "Finnhub rejected the API key." };
        case "rate_limited":
          return { ok: false, error: "Finnhub rate limit reached. Try again in a minute.", retryable: true };
        case "timeout":
          return { ok: false, error: "Finnhub search timed out. Try again.", retryable: true };
        case "bad_payload":
          return { ok: false, error: "Finnhub returned an unexpected response. Try again.", retryable: true };
        default:
          return { ok: false, error: `Finnhub error (${err.status ?? "unknown"}). Try again shortly.`, retryable: true };
      }
    }
    log.error("Unexpected search error", { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: "Search failed. Try again shortly.", retryable: true };
  }
}

/** Add (upsert) a symbol to the user's watchlist. */
export async function addWatchlistItem(candidate: WatchlistSearchCandidate): Promise<AddWatchlistResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase.from("watchlist_items").upsert(
    {
      user_id: user.id,
      symbol: candidate.symbol.toUpperCase(),
      company: candidate.company,
      exchange: candidate.exchange,
      price: candidate.price ?? 0,
      day_change: candidate.dayChange ?? 0,
      currency: candidate.currency || "USD",
    },
    { onConflict: "user_id,symbol" },
  );

  if (error) return { ok: false, error: "Could not save. Try again." };

  revalidatePath("/watchlist");
  return { ok: true };
}

/** Delete a watchlist item by ID. */
export async function deleteWatchlistItem(id: string): Promise<DeleteWatchlistResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("watchlist_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: "Could not delete. Try again." };

  revalidatePath("/watchlist");
  return { ok: true };
}

/** Fetch Twelve Data detail payload for the selected watchlist symbol. */
export async function getWatchlistItemDetails(symbol: string): Promise<WatchlistDetailData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      symbol,
      summary: { company: "", exchange: "", currency: "USD", price: null, change: null, changePercent: null, isMarketOpen: null },
      chart: [],
      stats: { open: null, high: null, low: null, previousClose: null, volume: null, averageVolume: null, marketCap: null, fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, beta: null, pe: null, forwardPe: null, eps: null, dividendYield: null, profitMargin: null, revenueGrowth: null },
      profile: { sector: null, industry: null, country: null, website: null, description: null, ceo: null, employees: null },
      earnings: [],
      financials: [],
      capabilities: { hasStats: false, hasProfile: false, hasEarnings: false, hasFinancials: false },
      warnings: [],
      error: "Unauthorized",
    };
  }

  return getWatchlistDetail(symbol);
}
