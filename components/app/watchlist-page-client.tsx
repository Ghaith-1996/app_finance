"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { WatchlistItems } from "@/components/app/watchlist-items";
import { WatchlistSearchPanel } from "@/components/app/watchlist-search-panel";
import { WatchlistDetailDashboard } from "@/components/app/watchlist-detail-dashboard";
import type { WatchlistItemData } from "@/lib/watchlist/watchlist-data";

interface Props {
  items: WatchlistItemData[];
}

export function WatchlistPageClient({ items }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramSymbol = searchParams.get("symbol");

  const [searchOpen, setSearchOpen] = useState(false);

  const selectedSymbol = paramSymbol;

  function selectSymbol(symbol: string) {
    router.push(`/watchlist?symbol=${encodeURIComponent(symbol)}`, { scroll: false });
  }

  function handleAdded(symbol: string) {
    setSearchOpen(false);
    router.push(`/watchlist?symbol=${encodeURIComponent(symbol)}`, { scroll: false });
    router.refresh();
  }

  return (
    <>
      {/* Header controls */}
      <div className="-mt-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-lg bg-brand/10 px-2.5 py-1 text-[10px] font-bold tracking-widest text-brand">
            ACTIVE MONITOR
          </span>
          <span className="text-sm font-medium text-slate-600">
            Prices refresh when you open this page
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen((o) => !o)}
          className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-[#080c11] transition hover:bg-brand-strong"
        >
          <Plus className="h-4 w-4" />
          Add to Watchlist
        </button>
      </div>

      {/* Search panel */}
      {searchOpen && (
        <div className="mb-6">
          <WatchlistSearchPanel
            onClose={() => setSearchOpen(false)}
            onAdded={handleAdded}
          />
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        {/* Left: list */}
        <div className="flex-1 space-y-4">
          <WatchlistItems
            initialItems={items}
            selectedSymbol={selectedSymbol}
            onSelectSymbol={selectSymbol}
          />

          {items.length === 0 && !searchOpen && (
            <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/10 bg-surface-raised/50 py-12 transition-colors hover:border-white/16">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5">
                <Search className="h-5 w-5 text-slate-500" />
              </div>
              <p className="text-[13px] font-medium text-slate-500">
                Add symbols to start tracking prices and news
              </p>
            </div>
          )}
        </div>

        {/* Right: detail dashboard */}
        <div className="w-full shrink-0 lg:w-[460px]">
          {selectedSymbol ? (
            <WatchlistDetailDashboard symbol={selectedSymbol} />
          ) : (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-surface-raised py-16">
              <p className="text-sm text-slate-500">Select a symbol to view details</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
