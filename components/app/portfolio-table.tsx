"use client";

import { useState } from "react";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import type { Holding } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { formatPercent, formatPrice } from "@/lib/utils";

type SortKey =
  | "symbol"
  | "value"
  | "dailyChange"
  | "gainAmount"
  | "gainPercent"
  | "quantity"
  | "averageCost"
  | "price";

type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "symbol", label: "Holding" },
  { key: "quantity", label: "Shares" },
  { key: "averageCost", label: "Avg Cost" },
  { key: "price", label: "Price" },
  { key: "dailyChange", label: "Day" },
  { key: "value", label: "Value" },
  { key: "gainAmount", label: "Gain / Loss" },
];

function getValue(holding: Holding, key: SortKey): number | string {
  const displayPrice = holding.currentPrice || holding.price;
  switch (key) {
    case "symbol":
      return holding.symbol;
    case "quantity":
      return holding.quantity;
    case "averageCost":
      return holding.averageCost;
    case "price":
      return displayPrice;
    case "dailyChange":
      return holding.dailyChange;
    case "value":
      return holding.quantity > 0 ? holding.quantity * displayPrice : 0;
    case "gainAmount":
      return holding.quantity > 0 ? holding.unrealizedGainAmount : 0;
    case "gainPercent":
      return holding.quantity > 0 ? holding.unrealizedGainPercent : 0;
  }
}

export function PortfolioTable({ holdings }: { holdings: Holding[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...holdings].sort((a, b) => {
    const av = getValue(a, sortKey);
    const bv = getValue(b, sortKey);
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = av as number;
    const bn = bv as number;
    return sortDir === "asc" ? an - bn : bn - an;
  });

  return (
    <Panel className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-black/6">
          <thead className="bg-[#f7f2ea]">
            <tr>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => handleSort(col.key)}
                    className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.22em] text-slate-500 transition hover:text-slate-950"
                  >
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === "desc" ? (
                        <ArrowDown className="h-3 w-3 text-brand" />
                      ) : (
                        <ArrowUp className="h-3 w-3 text-brand" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/6">
            {sorted.map((holding) => {
              const hasPosition = holding.quantity > 0;
              const displayPrice = holding.currentPrice || holding.price;
              const displayValue = hasPosition ? holding.quantity * displayPrice : 0;
              const gainAmt = hasPosition ? holding.unrealizedGainAmount : 0;
              const gainPct = hasPosition ? holding.unrealizedGainPercent : 0;

              return (
                <tr key={holding.id} className="bg-white/88 transition hover:bg-[#fffdf9]">
                  <td className="px-5 py-5">
                    <div className="space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-950">
                          {holding.symbol}
                        </span>
                        <Badge tone="neutral">{holding.market}</Badge>
                      </div>
                      <p className="text-sm text-slate-500">{holding.company}</p>
                    </div>
                  </td>
                  <td className="px-5 py-5 text-sm text-slate-950">
                    {hasPosition ? holding.quantity : "—"}
                  </td>
                  <td className="px-5 py-5 text-sm text-slate-950">
                    {holding.averageCost > 0 ? formatPrice(holding.averageCost) : "—"}
                  </td>
                  <td className="px-5 py-5 text-sm text-slate-950">
                    {formatPrice(displayPrice)}
                  </td>
                  <td
                    className={
                      holding.dailyChange >= 0
                        ? "px-5 py-5 text-sm text-emerald-700"
                        : "px-5 py-5 text-sm text-rose-700"
                    }
                  >
                    {formatPercent(holding.dailyChange)}
                  </td>
                  <td className="px-5 py-5 text-sm font-semibold text-slate-950">
                    {hasPosition ? formatPrice(displayValue) : "—"}
                  </td>
                  <td className="px-5 py-5">
                    {hasPosition ? (
                      <div className="space-y-0.5">
                        <p
                          className={
                            gainAmt >= 0
                              ? "text-sm font-semibold text-emerald-700"
                              : "text-sm font-semibold text-rose-700"
                          }
                        >
                          {gainAmt >= 0 ? "+" : ""}
                          {formatPrice(gainAmt)}
                        </p>
                        <p
                          className={
                            gainPct >= 0
                              ? "text-xs text-emerald-600"
                              : "text-xs text-rose-600"
                          }
                        >
                          {formatPercent(gainPct)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
