"use client";

import { useState, useRef, type FormEvent } from "react";
import { Loader2, Search, X } from "lucide-react";

import { searchWatchlistCandidates, addWatchlistItem } from "@/lib/actions/watchlist";
import type { WatchlistSearchCandidate } from "@/lib/watchlist/watchlist-data";
import { cn } from "@/lib/utils";

interface Props {
  onClose: () => void;
  onAdded: (symbol: string) => void;
}

export function WatchlistSearchPanel({ onClose, onAdded }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WatchlistSearchCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSearch(e?: FormEvent) {
    e?.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    setRetryable(false);
    setResults(null);

    const res = await searchWatchlistCandidates(trimmed);
    setSearching(false);

    if (!res.ok) {
      setError(res.error);
      setRetryable(res.retryable ?? false);
      return;
    }
    setResults(res.results);
  }

  async function handleSelect(candidate: WatchlistSearchCandidate) {
    setSaving(candidate.symbol);
    setError(null);
    const res = await addWatchlistItem(candidate);
    setSaving(null);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    onAdded(candidate.symbol);
  }

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-surface-raised p-6 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-white">Search &amp; Add Symbol</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ticker or company…"
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-brand/40 focus:ring-1 focus:ring-brand/30"
          autoFocus
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border border-brand bg-brand px-4 py-2.5 text-sm font-bold text-[#080c11] transition hover:bg-brand-strong disabled:opacity-50",
          )}
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </form>

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2">
          <p className="text-sm text-red-300">{error}</p>
          {retryable && (
            <button
              type="button"
              onClick={() => void handleSearch()}
              disabled={searching || !query.trim()}
              className="mt-1.5 text-[12px] font-bold text-red-400 underline underline-offset-2 transition hover:text-red-300 disabled:opacity-50"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {results !== null && results.length === 0 && !searching && (
        <p className="mt-4 text-center text-sm text-slate-500">
          No matching tickers found. Try a different query.
        </p>
      )}

      {results !== null && results.length > 0 && (
        <div className="mt-4 space-y-2">
          {results.map((r) => (
            <button
              key={r.symbol}
              type="button"
              disabled={saving === r.symbol}
              onClick={() => void handleSelect(r)}
              className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition hover:border-brand/25 hover:bg-brand/5 disabled:opacity-50"
            >
              <div>
                <p className="text-[14px] font-bold text-white">{r.symbol}</p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {r.company}
                  {r.exchange ? ` · ${r.exchange}` : ""}
                </p>
              </div>
              <div className="text-right">
                {r.price != null ? (
                  <p className="text-[14px] font-bold text-white">
                    ${r.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                ) : (
                  <p className="text-[13px] text-slate-600">—</p>
                )}
                {r.dayChange != null ? (
                  <p
                    className={cn(
                      "mt-0.5 text-[12px] font-bold",
                      r.dayChange >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {r.dayChange > 0 ? "+" : ""}
                    {r.dayChange}%
                  </p>
                ) : null}
              </div>
              {saving === r.symbol && <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
