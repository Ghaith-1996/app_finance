"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Minus, Newspaper, Plus } from "lucide-react";

import type { Holding } from "@/lib/types";
import { recordHoldingAdd, recordHoldingSale } from "@/lib/actions/portfolio";
import { buttonStyles } from "@/components/ui/button";
import { sanitizeExternalUrl } from "@/lib/security/external-url";
import { cn, formatPrice } from "@/lib/utils";

type SortKey =
  | "symbol"
  | "quantity"
  | "averageCost"
  | "costBasis"
  | "price"
  | "dailyChange"
  | "value"
  | "gainLoss"
  | "gainLossPercent";

type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string; align?: "left" | "right" }> = [
  { key: "symbol", label: "Holding" },
  { key: "quantity", label: "Shares" },
  { key: "averageCost", label: "Avg Cost" },
  { key: "costBasis", label: "Cost Basis", align: "right" },
  { key: "price", label: "Price" },
  { key: "dailyChange", label: "Day %" },
  { key: "value", label: "Value", align: "right" },
  { key: "gainLoss", label: "Gain/Loss", align: "right" },
  { key: "gainLossPercent", label: "Gain/Loss %", align: "right" },
];

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#0d1520] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand focus:ring-1 focus:ring-brand";

const MOBILE_GRID =
  "grid-cols-[minmax(0,1.8fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]";
const DESKTOP_GRID =
  "md:grid-cols-[1.6fr_0.9fr_0.9fr_1.1fr_0.9fr_0.9fr_1.1fr_1.1fr_1.1fr]";

function getHoldingPrice(holding: Holding) {
  return holding.currentPrice || holding.price || 0;
}

function getHoldingValue(holding: Holding) {
  if (holding.currentValue > 0) return holding.currentValue;
  const price = getHoldingPrice(holding);
  if (holding.quantity > 0) return holding.quantity * price;
  if (holding.allocation > 0) return holding.allocation;
  return 0;
}

function getHoldingGainLoss(holding: Holding) {
  const value = getHoldingValue(holding);
  const costBasis =
    holding.costBasis > 0 ? holding.costBasis : holding.averageCost * holding.quantity;
  return value - costBasis;
}

function getHoldingCostBasis(holding: Holding) {
  return holding.costBasis > 0 ? holding.costBasis : holding.averageCost * holding.quantity;
}

function getHoldingGainLossPercent(holding: Holding) {
  const value = getHoldingValue(holding);
  const costBasis =
    holding.costBasis > 0 ? holding.costBasis : holding.averageCost * holding.quantity;
  if (costBasis <= 0) return 0;
  return ((value - costBasis) / costBasis) * 100;
}

function getSortValue(holding: Holding, key: SortKey): number | string {
  switch (key) {
    case "symbol":
      return holding.symbol;
    case "quantity":
      return holding.quantity;
    case "averageCost":
      return holding.averageCost;
    case "costBasis":
      return getHoldingCostBasis(holding);
    case "price":
      return getHoldingPrice(holding);
    case "dailyChange":
      return holding.dailyChange ?? 0;
    case "value":
      return getHoldingValue(holding);
    case "gainLoss":
      return getHoldingGainLoss(holding);
    case "gainLossPercent":
      return getHoldingGainLossPercent(holding);
  }
}

function HoldingAdjustPanel({
  holding,
  portfolioId,
  onDone,
}: {
  holding: Holding;
  portfolioId: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const price = getHoldingPrice(holding);
  const value = getHoldingValue(holding);
  const dayChange = holding.dailyChange ?? 0;
  const isPositiveDay = dayChange >= 0;
  const [soldShares, setSoldShares] = useState("");
  const [addShares, setAddShares] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [loadingSale, setLoadingSale] = useState(false);
  const [loadingAdd, setLoadingAdd] = useState(false);
  const [errSale, setErrSale] = useState<string | null>(null);
  const [errAdd, setErrAdd] = useState<string | null>(null);

  async function submitSale(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setErrSale(null);
    const n = Number(soldShares);
    if (!Number.isFinite(n) || n <= 0) {
      setErrSale("Enter how many shares you sold.");
      return;
    }
    setLoadingSale(true);
    const res = await recordHoldingSale(portfolioId, holding.id, n);
    setLoadingSale(false);
    if (res.error) {
      setErrSale(res.error);
      return;
    }
    setSoldShares("");
    onDone();
    router.refresh();
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setErrAdd(null);
    const q = Number(addShares);
    const p = Number(addPrice);
    if (!Number.isFinite(q) || q <= 0) {
      setErrAdd("Enter how many shares you added.");
      return;
    }
    if (!Number.isFinite(p) || p < 0) {
      setErrAdd("Enter the price per share for the new shares.");
      return;
    }
    setLoadingAdd(true);
    const res = await recordHoldingAdd(portfolioId, holding.id, q, p);
    setLoadingAdd(false);
    if (res.error) {
      setErrAdd(res.error);
      return;
    }
    setAddShares("");
    setAddPrice("");
    onDone();
    router.refresh();
  }

  return (
    <div
      className="rounded-2xl border border-brand/20 bg-brand/5 px-5 py-5"
      onClick={(e) => e.stopPropagation()}
      role="region"
      aria-label={`Adjust position ${holding.symbol}`}
    >
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Update position — {holding.symbol}
      </p>
      <div className="mb-5 rounded-2xl border border-white/[0.06] bg-surface-raised/60 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Stock details
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-white/[0.06] bg-[#0d1520]/70 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Symbol
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{holding.symbol}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#0d1520]/70 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Company
            </p>
            <p className="mt-1 truncate text-sm font-semibold text-white">{holding.company}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#0d1520]/70 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Current price
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{formatPrice(price)}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#0d1520]/70 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Day %
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold",
                isPositiveDay ? "text-emerald-400" : "text-red-400",
              )}
            >
              {isPositiveDay ? "+" : ""}
              {dayChange.toFixed(2)}%
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-[#0d1520]/70 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Current value
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{formatPrice(value)}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={submitSale} className="space-y-3 rounded-xl border border-white/[0.06] bg-surface-raised/50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Minus className="h-4 w-4 text-amber-400" />
            Sold shares
          </div>
          <p className="text-xs text-slate-500">
            Reduces your position. Cost basis per remaining share stays the same. If you sell your
            full position, this line is removed.
          </p>
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
              Shares sold
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                min="0"
                max={holding.quantity}
                value={soldShares}
                onChange={(e) => setSoldShares(e.target.value)}
                placeholder={`max ${holding.quantity.toFixed(4)}`}
                className={cn(inputClass, "min-w-0 flex-1")}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSoldShares(String(holding.quantity));
                  setErrSale(null);
                }}
                className={buttonStyles({
                  variant: "ghost",
                  className: "shrink-0 px-3 text-xs font-semibold uppercase tracking-wider text-brand",
                })}
              >
                Max
              </button>
            </div>
          </div>
          {errSale ? <p className="text-xs text-amber-400">{errSale}</p> : null}
          <button
            type="submit"
            disabled={loadingSale}
            className={buttonStyles({ variant: "secondary", className: "w-full sm:w-auto" })}
          >
            {loadingSale ? "Applying…" : "Apply sale"}
          </button>
        </form>

        <form onSubmit={submitAdd} className="space-y-3 rounded-xl border border-white/[0.06] bg-surface-raised/50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Plus className="h-4 w-4 text-emerald-400" />
            Added shares
          </div>
          <p className="text-xs text-slate-500">
            Increases your position. Average cost is recalculated as a weighted average of your
            existing shares and the new lot.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
                Shares added
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={addShares}
                onChange={(e) => setAddShares(e.target.value)}
                placeholder="e.g. 10"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">
                Price / share (new lot)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={addPrice}
                onChange={(e) => setAddPrice(e.target.value)}
                placeholder="e.g. 195.50"
                className={inputClass}
              />
            </div>
          </div>
          {errAdd ? <p className="text-xs text-amber-400">{errAdd}</p> : null}
          <button
            type="submit"
            disabled={loadingAdd}
            className={buttonStyles({ variant: "secondary", className: "w-full sm:w-auto" })}
          >
            {loadingAdd ? "Applying…" : "Apply purchase"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function PortfolioHoldingsTable({
  holdings,
  portfolioId,
}: {
  holdings: Holding[];
  portfolioId: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openId, setOpenId] = useState<string | null>(null);

  function handleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDir("desc");
  }

  const sortedHoldings = useMemo(() => {
    return [...holdings].sort((a, b) => {
      const left = getSortValue(a, sortKey);
      const right = getSortValue(b, sortKey);

      if (typeof left === "string" && typeof right === "string") {
        return sortDir === "asc"
          ? left.localeCompare(right)
          : right.localeCompare(left);
      }

      const leftNumber = left as number;
      const rightNumber = right as number;
      return sortDir === "asc"
        ? leftNumber - rightNumber
        : rightNumber - leftNumber;
    });
  }, [holdings, sortDir, sortKey]);

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "grid items-center gap-x-3 px-3 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-600 sm:px-6 md:gap-x-4",
          MOBILE_GRID,
          DESKTOP_GRID,
        )}
      >
        {COLUMNS.map((column) => {
          const hiddenOnMobile = ["quantity", "averageCost", "costBasis", "dailyChange", "gainLossPercent"].includes(column.key);
          return (
            <div
              key={column.key}
              className={cn(
                column.align === "right" ? "text-right" : undefined,
                hiddenOnMobile && "hidden md:block",
              )}
            >
            <button
              type="button"
              onClick={() => handleSort(column.key)}
              className={`inline-flex items-center gap-1.5 transition hover:text-slate-300 ${
                column.align === "right" ? "ml-auto" : ""
              }`}
            >
              <span>{column.label}</span>
              {sortKey === column.key ? (
                sortDir === "desc" ? (
                  <ArrowDown className="h-3 w-3 text-brand" />
                ) : (
                  <ArrowUp className="h-3 w-3 text-brand" />
                )
              ) : (
                <ArrowUpDown className="h-3 w-3 opacity-30" />
              )}
            </button>
          </div>
          );
        })}
      </div>

      <div className="space-y-3">
        {sortedHoldings.map((holding) => {
          const price = getHoldingPrice(holding);
          const value = getHoldingValue(holding);
          const costBasis = getHoldingCostBasis(holding);
          const gainLoss = getHoldingGainLoss(holding);
          const gainLossPercent = getHoldingGainLossPercent(holding);
          const dayChange = holding.dailyChange ?? 0;
          const isPositiveDay = dayChange >= 0;
          const isPositiveTotal = gainLoss >= 0;
          const isOpen = openId === holding.id;
          const earningsReportUrl = sanitizeExternalUrl(holding.latestEarningsReportUrl);

          return (
            <div key={holding.id} className="space-y-0">
              <button
                type="button"
                onClick={() => setOpenId((id) => (id === holding.id ? null : holding.id))}
                className={cn(
                  "grid w-full items-center gap-x-3 rounded-2xl border px-3 py-3 text-left transition-transform duration-200 sm:px-6 sm:py-5 md:gap-x-4",
                  MOBILE_GRID,
                  DESKTOP_GRID,
                  isOpen
                    ? "border-brand/40 bg-surface-raised shadow-[0_0_0_1px_rgba(34,197,94,0.12)]"
                    : "border-white/[0.06] bg-surface-raised hover:-translate-y-0.5 hover:border-white/10",
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 font-bold text-brand">
                    {holding.symbol.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold leading-tight text-white">
                      {holding.symbol}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-slate-600">
                      {holding.company}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Link
                        href={`/feed?ticker=${encodeURIComponent(holding.symbol)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-md border border-brand/25 bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand transition hover:border-brand/40 hover:bg-brand/15"
                      >
                        <Newspaper className="h-3 w-3" />
                        News
                      </Link>
                      {earningsReportUrl ? (
                        <a
                          href={earningsReportUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-300 transition hover:border-white/20 hover:text-white"
                          aria-label={`${holding.symbol} latest earnings report`}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Report
                        </a>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] font-bold text-slate-600"
                          aria-disabled="true"
                          aria-label={`${holding.symbol} latest earnings report unavailable`}
                        >
                          <ExternalLink className="h-3 w-3" />
                          Report
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="hidden whitespace-nowrap text-[14px] font-medium text-slate-400 md:block">
                  {holding.quantity.toFixed(2)}
                </div>
                <div className="hidden whitespace-nowrap text-[14px] font-medium text-slate-400 md:block">
                  {formatPrice(holding.averageCost)}
                </div>
                <div className="hidden whitespace-nowrap text-right text-[14px] font-bold text-slate-300 md:block">
                  {formatPrice(costBasis)}
                </div>
                <div className="whitespace-nowrap text-[14px] font-bold text-white">
                  {formatPrice(price)}
                </div>
                <div
                  className={`hidden whitespace-nowrap text-[14px] font-bold md:block ${
                    isPositiveDay ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {isPositiveDay ? "+" : ""}
                  {dayChange.toFixed(2)}%
                </div>
                <div className="whitespace-nowrap text-right text-[15px] font-bold text-white">
                  {formatPrice(value)}
                </div>
                <div
                  className={`whitespace-nowrap text-right text-[15px] font-bold ${
                    isPositiveTotal ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {isPositiveTotal ? "+" : ""}
                  {formatPrice(gainLoss)}
                </div>
                <div
                  className={`hidden whitespace-nowrap text-right text-[15px] font-bold md:block ${
                    isPositiveTotal ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {isPositiveTotal ? "+" : ""}
                  {gainLossPercent.toFixed(2)}%
                </div>
              </button>

              {isOpen ? (
                <div className="mt-3 px-1">
                  <HoldingAdjustPanel
                    holding={holding}
                    portfolioId={portfolioId}
                    onDone={() => setOpenId(null)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
