"use client";

import { useEffect, useId, useMemo, useState, useTransition } from "react";
import { BookOpen, RefreshCw, Save, Trash2 } from "lucide-react";

import {
  deleteInvestmentThesis,
  getInvestmentThesisState,
  saveInvestmentThesis,
} from "@/lib/actions/investment-thesis";
import type {
  InvestmentThesis,
  InvestmentThesisConviction,
  InvestmentThesisHorizon,
  InvestmentThesisHistoryItem,
  InvestmentThesisScope,
} from "@/lib/investment-theses/types";
import { Button, buttonStyles } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const inputClass =
  "w-full rounded-xl border border-white/10 bg-[#0d1520] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-brand focus:ring-1 focus:ring-brand";

const textAreaClass = cn(inputClass, "min-h-24 resize-y leading-6");

const horizonOptions: Array<{ value: InvestmentThesisHorizon; label: string }> = [
  { value: "watch", label: "Watch" },
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

const convictionOptions: Array<{ value: InvestmentThesisConviction; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function InvestmentThesisPanel({
  symbol,
  portfolioId = null,
  scope = portfolioId ? "holding" : "watchlist",
  compact = false,
}: {
  symbol: string;
  portfolioId?: string | null;
  scope?: InvestmentThesisScope;
  compact?: boolean;
}) {
  const [loadedThesis, setLoadedThesis] = useState<InvestmentThesis | null>(null);
  const [history, setHistory] = useState<InvestmentThesisHistoryItem[]>([]);
  const [thesis, setThesis] = useState("");
  const [risksText, setRisksText] = useState("");
  const [invalidationNotes, setInvalidationNotes] = useState("");
  const [horizon, setHorizon] = useState<InvestmentThesisHorizon>("medium");
  const [conviction, setConviction] = useState<InvestmentThesisConviction>("medium");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const thesisId = useId();
  const risksId = useId();
  const invalidationId = useId();
  const horizonId = useId();
  const convictionId = useId();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    setError(null);

    getInvestmentThesisState({ symbol, portfolioId, scope }).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const next = result.thesis;
      setLoadedThesis(next);
      setHistory(result.history ?? []);
      setThesis(next?.thesis ?? "");
      setRisksText((next?.risks ?? []).join("\n"));
      setInvalidationNotes(next?.invalidationNotes ?? "");
      setHorizon(next?.horizon ?? "medium");
      setConviction(next?.conviction ?? "medium");
    });

    return () => {
      cancelled = true;
    };
  }, [portfolioId, scope, symbol]);

  const updatedAt = useMemo(
    () => formatUpdatedAt(loadedThesis?.updatedAt ?? null),
    [loadedThesis?.updatedAt],
  );

  function handleSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveInvestmentThesis({
        symbol,
        portfolioId,
        scope,
        thesis,
        risks: risksText,
        invalidationNotes,
        horizon,
        conviction,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setLoadedThesis(result.thesis);
      setHistory(result.history ?? []);
      setMessage("Thesis saved.");
    });
  }

  function handleDelete() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await deleteInvestmentThesis({ symbol, portfolioId, scope });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setLoadedThesis(null);
      setHistory(result.history ?? []);
      setThesis("");
      setRisksText("");
      setInvalidationNotes("");
      setHorizon("medium");
      setConviction("medium");
      setMessage("Thesis cleared.");
    });
  }

  return (
    <section
      className={cn(
        "rounded-2xl border border-white/[0.06] bg-surface-raised/60 p-5",
        compact && "p-4",
      )}
      aria-label={`${symbol} investment thesis`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-brand">
            <BookOpen className="h-3.5 w-3.5" />
            Thesis tracker
          </div>
          <h3 className="mt-2 text-base font-bold text-white">{symbol}</h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge tone={loadedThesis ? "brand" : "neutral"}>
            {loadedThesis ? "Saved" : "Draft"}
          </Badge>
          {updatedAt ? (
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              {updatedAt}
            </span>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading thesis...
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div>
            <label
              htmlFor={thesisId}
              className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500"
            >
              Thesis
            </label>
            <textarea
              id={thesisId}
              value={thesis}
              onChange={(event) => setThesis(event.target.value)}
              placeholder="Core reason this symbol belongs on your radar."
              className={textAreaClass}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label
                htmlFor={risksId}
                className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500"
              >
                Risks
              </label>
              <textarea
                id={risksId}
                value={risksText}
                onChange={(event) => setRisksText(event.target.value)}
                placeholder="One risk per line."
                className={textAreaClass}
              />
            </div>
            <div>
              <label
                htmlFor={invalidationId}
                className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500"
              >
                Review trigger
              </label>
              <textarea
                id={invalidationId}
                value={invalidationNotes}
                onChange={(event) => setInvalidationNotes(event.target.value)}
                placeholder="What would make you revisit the thesis."
                className={textAreaClass}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Horizon
              </span>
              <select
                id={horizonId}
                aria-label="Horizon"
                value={horizon}
                onChange={(event) => setHorizon(event.target.value as InvestmentThesisHorizon)}
                className={inputClass}
              >
                {horizonOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Conviction
              </span>
              <select
                id={convictionId}
                aria-label="Conviction"
                value={conviction}
                onChange={(event) =>
                  setConviction(event.target.value as InvestmentThesisConviction)
                }
                className={inputClass}
              >
                {convictionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? <p className="text-sm font-medium text-amber-400">{error}</p> : null}
          {message ? <p className="text-sm font-medium text-brand">{message}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleSave} disabled={isPending}>
              <Save className="mr-2 h-4 w-4" />
              {isPending ? "Saving..." : "Save thesis"}
            </Button>
            {loadedThesis ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className={buttonStyles({
                  variant: "ghost",
                  className: "text-slate-400 hover:text-rose-300",
                })}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear
              </button>
            ) : null}
          </div>

          {history.length > 0 ? (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Thesis history
              </p>
              <div className="mt-3 space-y-3">
                {history.slice(0, 3).map((item) => (
                  <div
                    key={item.id}
                    className="border-l border-white/[0.08] pl-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={item.changeType === "deleted" ? "warning" : "neutral"}>
                        {item.changeType}
                      </Badge>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        {formatUpdatedAt(item.capturedAt) ?? "Recent"}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                      {item.thesis || item.risks[0] || item.invalidationNotes || "Snapshot saved."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
