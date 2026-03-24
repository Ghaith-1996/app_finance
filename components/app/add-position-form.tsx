"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { addPortfolioPosition } from "@/lib/actions/portfolio";
import { buttonStyles } from "@/components/ui/button";

export function AddPositionForm({ portfolioId }: { portfolioId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [quantity, setQuantity] = useState("");
  const [averageCost, setAverageCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand focus:ring-1 focus:ring-brand";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const q = Number(quantity);
    const c = Number(averageCost);
    if (!symbol.trim()) {
      setError("Enter a ticker symbol.");
      return;
    }
    if (!Number.isFinite(q) || q <= 0) {
      setError("Quantity must be greater than zero.");
      return;
    }
    if (!Number.isFinite(c) || c < 0) {
      setError("Average cost must be zero or positive.");
      return;
    }

    setLoading(true);
    const result = await addPortfolioPosition(portfolioId, {
      symbol: symbol.trim(),
      quantity: q,
      averageCost: c,
    });
    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSymbol("");
    setQuantity("");
    setAverageCost("");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="mb-6 rounded-[1.5rem] border border-white/[0.06] bg-surface-raised/80 shadow-sm">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
        }}
        className="flex w-full items-center justify-between gap-3 rounded-[1.5rem] px-5 py-4 text-left transition hover:bg-white/[0.03]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <Plus className="h-4 w-4 text-brand" />
          Add position
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {open ? (
        <form onSubmit={handleSubmit} className="space-y-4 border-t border-white/[0.06] px-5 pb-5 pt-2">
          <p className="text-sm text-slate-500">
            Enter a ticker, your share quantity, and average cost per share. We&apos;ll look up the
            name and refresh live prices.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
                Symbol
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="e.g. AAPL"
                autoCapitalize="characters"
                autoComplete="off"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
                Quantity
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 25"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
                Avg cost / share
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={averageCost}
                onChange={(e) => setAverageCost(e.target.value)}
                placeholder="e.g. 180.00"
                className={inputClass}
              />
            </div>
          </div>
          {error ? <p className="text-sm text-amber-400">{error}</p> : null}
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
