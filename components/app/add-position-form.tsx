"use client";

import { useId, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { addPortfolioPosition } from "@/lib/actions/portfolio";
import { buttonStyles } from "@/components/ui/button";

type Field = "symbol" | "quantity" | "averageCost";
type FieldErrors = Partial<Record<Field, string>>;

export function AddPositionForm({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [averageCost, setAverageCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);

  // Audit F22: labels are bound to inputs, each field error is linked to its input and marks it
  // invalid, and focus moves to the first invalid field.
  const baseId = useId();
  const ids = {
    form: `${baseId}-form`,
    symbol: `${baseId}-symbol`,
    quantity: `${baseId}-quantity`,
    averageCost: `${baseId}-average-cost`,
  };
  const inputRefs = {
    symbol: useRef<HTMLInputElement>(null),
    quantity: useRef<HTMLInputElement>(null),
    averageCost: useRef<HTMLInputElement>(null),
  };

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand focus:ring-1 focus:ring-brand aria-[invalid=true]:border-amber-400";

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    const q = Number(quantity);
    const c = Number(averageCost);
    if (!symbol.trim()) next.symbol = "Enter a ticker symbol.";
    if (!quantity.trim() || !Number.isFinite(q) || q <= 0) next.quantity = "Quantity must be greater than zero.";
    if (!averageCost.trim() || !Number.isFinite(c) || c < 0) next.averageCost = "Average cost must be zero or positive.";
    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const nextErrors = validate();
    setFieldErrors(nextErrors);
    const firstInvalid = (["symbol", "quantity", "averageCost"] as const).find((field) => nextErrors[field]);
    if (firstInvalid) {
      inputRefs[firstInvalid].current?.focus();
      return;
    }

    setLoading(true);
    const result = await addPortfolioPosition(portfolioId, {
      symbol: symbol.trim(),
      quantity: Number(quantity),
      averageCost: Number(averageCost),
    });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSymbol("");
    setQuantity("");
    setAverageCost("");
    setFieldErrors({});
    setOpen(false);
    router.refresh();
  }

  function fieldProps(field: Field) {
    const errorId = `${ids[field]}-error`;
    return {
      id: ids[field],
      ref: inputRefs[field],
      "aria-invalid": fieldErrors[field] ? true : undefined,
      "aria-describedby": fieldErrors[field] ? errorId : undefined,
    };
  }

  function fieldError(field: Field) {
    return fieldErrors[field] ? (
      <p id={`${ids[field]}-error`} className="mt-1 text-xs text-amber-400">
        {fieldErrors[field]}
      </p>
    ) : null;
  }

  return (
    <div className="mb-6 rounded-[1.5rem] border border-white/[0.06] bg-surface-raised/80 shadow-sm">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
          setFieldErrors({});
        }}
        aria-expanded={open}
        aria-controls={ids.form}
        className="flex w-full items-center justify-between gap-3 rounded-[1.5rem] px-5 py-4 text-left transition hover:bg-white/[0.03]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4 text-brand" aria-hidden="true" />
          Add position
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
        )}
      </button>

      {open ? (
        <form
          id={ids.form}
          onSubmit={handleSubmit}
          noValidate
          aria-label="Add position"
          className="space-y-4 border-t border-white/[0.06] px-5 pb-5 pt-2"
        >
          <p className="text-sm text-slate-500">
            Enter a ticker, your share quantity, and average cost per share. We&apos;ll look up the
            name and refresh live prices.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor={ids.symbol} className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
                Symbol
              </label>
              <input
                {...fieldProps("symbol")}
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g. AAPL"
                autoCapitalize="characters"
                autoComplete="off"
                className={inputClass}
              />
              {fieldError("symbol")}
            </div>
            <div>
              <label htmlFor={ids.quantity} className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
                Quantity
              </label>
              <input
                {...fieldProps("quantity")}
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 25"
                className={inputClass}
              />
              {fieldError("quantity")}
            </div>
            <div>
              <label htmlFor={ids.averageCost} className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
                Avg cost / share
              </label>
              <input
                {...fieldProps("averageCost")}
                type="number"
                step="any"
                min="0"
                value={averageCost}
                onChange={(e) => setAverageCost(e.target.value)}
                placeholder="e.g. 180.00"
                className={inputClass}
              />
              {fieldError("averageCost")}
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-amber-400">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={loading}
              className={buttonStyles({
                size: "lg",
                className: "disabled:opacity-70",
              })}
            >
              {loading ? "Adding…" : "Add to portfolio"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError(null);
                setFieldErrors({});
              }}
              className={buttonStyles({ variant: "ghost" })}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
