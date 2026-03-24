/** Persisted watchlist row from Supabase. */
export type WatchlistItemRecord = {
  id: string;
  user_id: string;
  symbol: string;
  company: string;
  exchange: string;
  price: number;
  day_change: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

/** Client-side shape used by list UI. */
export type WatchlistItemData = {
  id: string;
  symbol: string;
  company: string;
  exchange: string;
  price: number | null;
  dayChange: number | null;
  currency: string;
};

/** Finnhub search result exposed to the client. */
export type WatchlistSearchCandidate = {
  symbol: string;
  company: string;
  exchange: string;
  price: number | null;
  dayChange: number | null;
  currency: string;
};

export type SearchCandidatesResult =
  | { ok: true; results: WatchlistSearchCandidate[] }
  | { ok: false; error: string; retryable?: boolean };

export type AddWatchlistResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteWatchlistResult =
  | { ok: true }
  | { ok: false; error: string };
