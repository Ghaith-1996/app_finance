"use client";

import { useMemo, useState } from "react";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import type { Holding } from "@/lib/types";
import { formatPrice } from "@/lib/utils";

type SortKey =
  | "symbol"
  | "quantity"
  | "averageCost"
  | "price"
  | "dailyChange"
  | "value"
  | "gainLoss";

type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string; align?: "left" | "right" }> = [
  { key: "symbol", label: "Holding" },
  { key: "quantity", label: "Shares" },
  { key: "averageCost", label: "Avg Cost" },
  { key: "price", label: "Price" },
  { key: "dailyChange", label: "Day %" },
  { key: "value", label: "Value", align: "right" },
  { key: "gainLoss", label: "Gain/Loss", align: "right" },
];

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

function getSortValue(holding: Holding, key: SortKey): number | string {
  switch (key) {
    case "symbol":
      return holding.symbol;
    case "quantity":
      return holding.quantity;
    case "averageCost":
      return holding.averageCost;
    case "price":
      return getHoldingPrice(holding);
    case "dailyChange":
      return holding.dailyChange ?? 0;
    case "value":
      return getHoldingValue(holding);
    case "gainLoss":
      return getHoldingGainLoss(holding);
  }
}

export function PortfolioHoldingsTable({ holdings }: { holdings: Holding[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
      <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.2fr_1.2fr] items-center px-6 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
        {COLUMNS.map((column) => (
          <div
            key={column.key}
            className={column.align === "right" ? "text-right" : undefined}
          >
            <button
              type="button"
              onClick={() => handleSort(column.key)}
              className={`inline-flex items-center gap-1.5 transition hover:text-slate-950 ${
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
        ))}
      </div>

      <div className="space-y-3">
        {sortedHoldings.map((holding) => {
          const price = getHoldingPrice(holding);
          const value = getHoldingValue(holding);
          const gainLoss = getHoldingGainLoss(holding);
          const dayChange = holding.dailyChange ?? 0;
          const isPositiveDay = dayChange >= 0;
          const isPositiveTotal = gainLoss >= 0;

          return (
            <div
              key={holding.id}
              className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1.2fr_1.2fr] items-center rounded-[1.5rem] border border-black/5 bg-white px-6 py-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl font-bold ${
                    holding.symbol === "TSLA"
                      ? "bg-[#0f172a] text-white"
                      : "bg-[#E8F8ED] text-[#009B5A]"
                  }`}
                >
                  {holding.symbol.charAt(0)}
                </div>
                <div>
                  <p className="font-bold leading-tight text-slate-900">
                    {holding.symbol}
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {holding.company}
                  </p>
                </div>
              </div>
              <div className="text-[14px] font-medium text-slate-600">
                {holding.quantity.toFixed(2)}
              </div>
              <div className="text-[14px] font-medium text-slate-600">
                {formatPrice(holding.averageCost)}
              </div>
              <div className="text-[14px] font-bold text-slate-900">
                {formatPrice(price)}
              </div>
              <div
                className={`text-[14px] font-bold ${
                  isPositiveDay ? "text-[#009B5A]" : "text-[#FF6B6B]"
                }`}
              >
                {isPositiveDay ? "+" : ""}
                {dayChange.toFixed(2)}%
              </div>
              <div className="text-right text-[15px] font-bold text-slate-900">
                {formatPrice(value)}
              </div>
              <div
                className={`text-right text-[15px] font-bold ${
                  isPositiveTotal ? "text-[#009B5A]" : "text-[#FF6B6B]"
                }`}
              >
                {isPositiveTotal ? "+" : ""}
                {formatPrice(gainLoss)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
