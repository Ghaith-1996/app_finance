"use client";

import { useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

const REQUIRED_FIELDS = [
  { key: "symbol", label: "Symbol / Ticker", required: true },
  { key: "quantity", label: "Quantity / Shares", required: true },
  { key: "avgCost", label: "Average Cost / Price", required: false },
  { key: "costBasis", label: "Cost Basis / Book Value", required: false },
  { key: "company", label: "Company / Name", required: false },
  { key: "sector", label: "Sector", required: false },
  { key: "market", label: "Market / Exchange", required: false },
  { key: "side", label: "Side (Buy/Sell)", required: false },
  { key: "date", label: "Trade Date", required: false },
] as const;

interface ColumnMapperProps {
  headers: string[];
  suggestedMapping: Record<string, number>;
  onConfirm: (mapping: Record<string, number>, isTransactionFile: boolean) => void;
  onCancel: () => void;
}

export function ColumnMapper({
  headers,
  suggestedMapping,
  onConfirm,
  onCancel,
}: ColumnMapperProps) {
  const [mapping, setMapping] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const [key, value] of Object.entries(suggestedMapping)) {
      initial[key] = value;
    }
    return initial;
  });

  const hasSymbol = mapping.symbol != null;
  const hasQuantity = mapping.quantity != null;
  const hasSide = mapping.side != null;
  const isValid = hasSymbol && (hasQuantity || hasSide);

  function handleSubmit() {
    if (!isValid) return;
    const isTransactionFile = hasSide || mapping.date != null;
    onConfirm(mapping, isTransactionFile);
  }

  return (
    <Panel className="space-y-5">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
          Map CSV columns
        </p>
        <p className="mt-2 text-sm leading-7 text-slate-400">
          We couldn&apos;t auto-detect all columns. Map each field to a CSV header below.
        </p>
      </div>
      <div className="space-y-3">
        {REQUIRED_FIELDS.map((field) => (
          <div
            key={field.key}
            className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{field.label}</span>
              {field.required && (
                <span className="text-xs text-rose-400">required</span>
              )}
            </div>
            <select
              value={mapping[field.key] ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                setMapping((prev) => {
                  const next = { ...prev };
                  if (val === "") {
                    delete next[field.key];
                  } else {
                    next[field.key] = parseInt(val, 10);
                  }
                  return next;
                });
              }}
              className="rounded-xl border border-white/10 bg-surface-raised px-3 py-2 text-sm text-slate-200 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">-- skip --</option>
              {headers.map((header, idx) => (
                <option key={idx} value={idx}>
                  {header}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className={buttonStyles({ variant: "secondary" })}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid}
          className={buttonStyles({ className: isValid ? "" : "opacity-50" })}
        >
          Apply mapping
        </button>
      </div>
    </Panel>
  );
}
