"use client";

import Link from "next/link";
import { TrendingUp } from "lucide-react";

import type { TrendingTicker } from "@/lib/community/types";

interface Props {
  tickers: TrendingTicker[];
}

export function TrendingTickersCard({ tickers }: Props) {
  if (tickers.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <TrendingUp className="h-3.5 w-3.5" />
        Trending Tickers
      </div>
      <div className="space-y-1.5">
        {tickers.map((t, i) => (
          <Link
            key={t.ticker}
            href={`/watchlist?symbol=${encodeURIComponent(t.ticker)}`}
            className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition hover:bg-white/5"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-slate-600">
                {i + 1}
              </span>
              <span className="font-bold text-white">${t.ticker}</span>
            </div>
            <span className="text-[11px] text-slate-500">
              {t.mentionCount} mention{t.mentionCount === 1 ? "" : "s"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
