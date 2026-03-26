"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Loader2,
  MoreVertical,
  Newspaper,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { deleteWatchlistItem, refreshWatchlistPrices } from "@/lib/actions/watchlist";
import type { WatchlistItemData } from "@/lib/watchlist/watchlist-data";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  initialItems: WatchlistItemData[];
  selectedSymbol: string | null;
  onSelectSymbol: (symbol: string) => void;
}

type RefreshMode = "idle" | "auto" | "manual";

export function WatchlistItems({ initialItems, selectedSymbol, onSelectSymbol }: Props) {
  const [items, setItems] = useState<WatchlistItemData[]>(initialItems);
  const router = useRouter();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshMode, setRefreshMode] = useState<RefreshMode>("idle");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const autoRefreshStartedRef = useRef(false);

  const closeMenu = useCallback(() => setOpenMenuId(null), []);

  useEffect(() => {
    if (!openMenuId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeMenu();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openMenuId, closeMenu]);

  async function runRefresh(options?: { silent?: boolean }) {
    const silent = options?.silent ?? false;
    if (items.length === 0) return;

    setRefreshingAll(true);
    setRefreshMode(silent ? "auto" : "manual");
    if (!silent) {
      setBanner(null);
    }

    try {
      const updated = await refreshWatchlistPrices();
      if (updated.length > 0) setItems(updated);
    } catch {
      if (!silent) {
        setBanner("Refresh failed. Try again.");
      }
    } finally {
      setRefreshingAll(false);
      setRefreshMode("idle");
    }
  }

  useEffect(() => {
    if (autoRefreshStartedRef.current || initialItems.length === 0) return;
    autoRefreshStartedRef.current = true;
    void runRefresh({ silent: true });
  }, [initialItems.length]);

  async function handleDelete(id: string) {
    closeMenu();
    setDeletingId(id);
    const res = await deleteWatchlistItem(id);
    setDeletingId(null);
    if (res.ok) {
      setItems((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    }
  }

  return (
    <>
      {banner && (
        <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          {banner}
        </p>
      )}

      <div className="grid grid-cols-[2fr_1fr_auto] items-end gap-4 px-6 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-600">
        <div>ASSET</div>
        <div>PERFORMANCE</div>
        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => void runRefresh()}
            disabled={refreshingAll || items.length === 0}
            className={buttonStyles({
              variant: "secondary",
              size: "md",
              className: "gap-2 text-[11px] font-bold uppercase tracking-wider disabled:opacity-50",
            })}
            aria-label="Refresh all prices"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 shrink-0", refreshingAll && "animate-spin")} />
            {refreshingAll ? "Refreshing..." : "Refresh prices"}
          </button>
          {refreshMode === "auto" ? (
            <div className="w-full text-right text-[10px] font-medium normal-case tracking-normal text-slate-500">
              Auto-refreshing...
            </div>
          ) : null}
          <div className="w-full text-right">STATUS</div>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <WatchlistRow
            key={item.id}
            item={item}
            selected={item.symbol === selectedSymbol}
            deleting={deletingId === item.id}
            menuOpen={openMenuId === item.id}
            onSelect={() => onSelectSymbol(item.symbol)}
            onToggleMenu={() => setOpenMenuId((id) => (id === item.id ? null : item.id))}
            onCloseMenu={closeMenu}
            onDelete={() => void handleDelete(item.id)}
          />
        ))}
      </div>

      {items.length === 0 && (
        <p className="mt-6 text-center text-sm text-slate-500">
          Your watchlist is empty. Use &quot;Add to Watchlist&quot; to start tracking symbols.
        </p>
      )}
    </>
  );
}

function WatchlistRow({
  item,
  selected,
  deleting,
  menuOpen,
  onSelect,
  onToggleMenu,
  onCloseMenu,
  onDelete,
}: {
  item: WatchlistItemData;
  selected: boolean;
  deleting: boolean;
  menuOpen: boolean;
  onSelect: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onDelete: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: MouseEvent) {
      const el = rowRef.current;
      if (el && !el.contains(e.target as Node)) onCloseMenu();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen, onCloseMenu]);

  return (
    <div
      ref={rowRef}
      className={cn(
        "grid cursor-pointer grid-cols-[2fr_1fr_auto] items-center gap-4 rounded-2xl border px-6 py-5 transition-all duration-200 hover:-translate-y-0.5",
        selected
          ? "border-brand/30 bg-brand/5"
          : "border-white/[0.06] bg-surface-raised hover:border-white/10",
        deleting && "pointer-events-none opacity-50",
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-lg font-bold text-slate-400">
          {item.company.charAt(0) || item.symbol.charAt(0)}
        </div>
        <div>
          <p className="text-[15px] font-bold text-white">{item.company || item.symbol}</p>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-slate-600">
            {item.symbol}
            {item.exchange ? ` - ${item.exchange}` : ""}
          </p>
        </div>
      </div>

      <div>
        <p className="text-[15px] font-bold text-white">
          {item.price != null && item.price > 0 ? (
            `$${item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          ) : (
            <span className="text-slate-500">-</span>
          )}
        </p>
        {item.dayChange != null ? (
          <p
            className={cn(
              "mt-0.5 flex items-center gap-1 text-[13px] font-bold",
              item.dayChange >= 0 ? "text-emerald-400" : "text-red-400",
            )}
          >
            {item.dayChange >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {item.dayChange > 0 ? "+" : ""}
            {item.dayChange}%
          </p>
        ) : (
          <p className="mt-0.5 text-[13px] font-medium text-slate-600">-</p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 sm:gap-3">
        <Link
          href={`/feed?symbol=${encodeURIComponent(item.symbol)}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-brand/25 bg-brand/10 px-3 py-2 text-[11px] font-bold text-brand transition hover:border-brand/40 hover:bg-brand/15"
        >
          <Newspaper className="h-3.5 w-3.5" />
          News
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
            className={cn(
              "rounded-lg p-1 text-slate-600 transition-colors hover:bg-white/5 hover:text-slate-400",
              menuOpen && "bg-white/5 text-slate-400",
            )}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="More options"
          >
            <MoreVertical className="h-5 w-5" />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d1520] py-1 shadow-xl shadow-black/40"
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 shrink-0" />
                )}
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
