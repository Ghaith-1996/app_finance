"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileSpreadsheet, Loader2, X } from "lucide-react";

import { CSVDropzone } from "@/components/app/csv-dropzone";
import { ColumnMapper } from "@/components/app/column-mapper";
import { HoldingsReviewTable } from "@/components/app/holdings-review-table";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  previewCSVImport,
  previewCSVWithMapping,
  saveHoldings,
} from "@/lib/actions/portfolio";
import type {
  HoldingDraft,
  HoldingResolutionCandidate,
  SaveMode,
} from "@/lib/types";
import { cn, formatPrice } from "@/lib/utils";

type SaveBehavior = "redirect-analysis" | "refresh";

interface PortfolioCsvImportFlowProps {
  portfolioId: string | null;
  saveBehavior: SaveBehavior;
  title: string;
  description: string;
  showEntryButton?: boolean;
  entryLabel?: string;
  defaultOpen?: boolean;
}

export function PortfolioCsvImportFlow({
  portfolioId,
  saveBehavior,
  title,
  description,
  showEntryButton = false,
  entryLabel = "Import CSV",
  defaultOpen = true,
}: PortfolioCsvImportFlowProps) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [drafts, setDrafts] = useState<HoldingDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [needsMapping, setNeedsMapping] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [suggestedMapping, setSuggestedMapping] = useState<Record<string, number>>({});
  const [saveMode, setSaveMode] = useState<SaveMode>("replace");

  const confirmedCount = useMemo(
    () => drafts.filter((d) => d.status === "confirmed").length,
    [drafts],
  );
  const unresolvedCount = useMemo(
    () => drafts.filter((d) => d.status === "unresolved").length,
    [drafts],
  );
  const skippedCount = useMemo(
    () => drafts.filter((d) => d.status === "skipped").length,
    [drafts],
  );
  const canSave = confirmedCount > 0 && unresolvedCount === 0;
  const isReviewing = drafts.length > 0;
  const hasExistingPortfolio = !!portfolioId;

  function resetFlow(close = false) {
    setDrafts([]);
    setLoading(false);
    setSubmitting(false);
    setError(null);
    setCsvText(null);
    setNeedsMapping(false);
    setCsvHeaders([]);
    setSuggestedMapping({});
    setSaveMode("replace");
    if (close) {
      setOpen(false);
    }
  }

  async function handleCSVUpload(content: string) {
    setCsvText(content);
    setLoading(true);
    setError(null);

    try {
      const result = await previewCSVImport(content);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.needsMapping) {
        setNeedsMapping(true);
        setCsvHeaders(result.headers);
        setSuggestedMapping(result.suggestedMapping);
        return;
      }
      setDrafts(result.drafts);
    } catch {
      setError("Failed to parse CSV. Please check the file format.");
    } finally {
      setLoading(false);
    }
  }

  async function handleMappingConfirm(
    mapping: Record<string, number>,
    isTransactionFile: boolean,
  ) {
    if (!csvText) return;

    setLoading(true);
    setError(null);
    try {
      const result = await previewCSVWithMapping(csvText, mapping, isTransactionFile);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDrafts(result.drafts);
      setNeedsMapping(false);
    } catch {
      setError("Failed to process CSV with mapping.");
    } finally {
      setLoading(false);
    }
  }

  function toggleStatus(tempId: string) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.tempId !== tempId) return d;
        if (d.status === "skipped") {
          return {
            ...d,
            status: d.issues.length > 0 ? ("unresolved" as const) : ("confirmed" as const),
          };
        }
        return { ...d, status: "skipped" as const };
      }),
    );
  }

  function selectCandidate(tempId: string, candidate: HoldingResolutionCandidate) {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.tempId !== tempId) return d;
        const newIssues = d.issues.filter((i) => i.field !== "symbol");
        return {
          ...d,
          symbol: candidate.symbol,
          company: candidate.name,
          market: candidate.exchange,
          exchange: candidate.exchange,
          candidates: [],
          issues: newIssues,
          status: newIssues.length > 0 ? ("unresolved" as const) : ("confirmed" as const),
        };
      }),
    );
  }

  async function handleSave() {
    if (!canSave) return;

    setSubmitting(true);
    setError(null);

    try {
      const confirmed = drafts.filter((d) => d.status === "confirmed");
      const result = await saveHoldings({
        portfolioId,
        portfolioName: "My Portfolio",
        sourceType: "csv",
        mode: hasExistingPortfolio ? saveMode : "replace",
        holdings: confirmed.map((d) => ({
          symbol: d.symbol,
          company: d.company,
          quantity: d.quantity,
          averageCost: d.averageCost,
          sector: d.sector,
          market: d.market,
          thesis: d.thesis,
          importSource: d.importSource,
        })),
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (saveBehavior === "redirect-analysis") {
        router.push(
          result.portfolioId
            ? `/analysis?portfolioId=${result.portfolioId}`
            : "/portfolio",
        );
        return;
      }

      resetFlow(true);
      router.refresh();
    } catch {
      setError("Failed to save portfolio.");
    } finally {
      setSubmitting(false);
    }
  }

  const estimatedCostBasis = drafts
    .filter((d) => d.status === "confirmed")
    .reduce((sum, d) => sum + d.quantity * d.averageCost, 0);

  if (!open && showEntryButton) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonStyles({ variant: "secondary" })}
      >
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        {entryLabel}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <Panel className="space-y-5 border-white/[0.06] bg-surface-raised">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              {title}
            </p>
            <p className="mt-2 text-sm leading-7 text-slate-400">{description}</p>
          </div>
          {showEntryButton ? (
            <button
              type="button"
              onClick={() => resetFlow(true)}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-500 transition hover:bg-white/5 hover:text-slate-300"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
            {error}
          </div>
        ) : null}

        {!needsMapping && !isReviewing ? (
          <CSVDropzone onFileContent={(content) => void handleCSVUpload(content)} disabled={loading} />
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-8">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
            <span className="text-sm text-slate-400">Parsing and validating...</span>
          </div>
        ) : null}

        {needsMapping ? (
          <ColumnMapper
            headers={csvHeaders}
            suggestedMapping={suggestedMapping}
            onConfirm={handleMappingConfirm}
            onCancel={() => {
              setNeedsMapping(false);
              setCsvText(null);
              setCsvHeaders([]);
              setSuggestedMapping({});
            }}
          />
        ) : null}
      </Panel>

      {isReviewing ? (
        <div className="space-y-6">
          {hasExistingPortfolio ? (
            <Panel className="space-y-4 border-white/[0.06] bg-surface-raised">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
                  Import mode
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  Choose whether this CSV should replace the portfolio or merge into it.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSaveMode("replace")}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition",
                    saveMode === "replace"
                      ? "border-brand/28 bg-brand/10"
                      : "border-white/[0.06] bg-white/[0.03] hover:bg-white/5",
                  )}
                >
                  <p className="text-sm font-semibold text-white">Replace all</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Delete existing holdings and use only the confirmed rows below.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setSaveMode("merge")}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition",
                    saveMode === "merge"
                      ? "border-brand/28 bg-brand/10"
                      : "border-white/[0.06] bg-white/[0.03] hover:bg-white/5",
                  )}
                >
                  <p className="text-sm font-semibold text-white">Merge</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Update matching tickers and keep unmatched existing positions.
                  </p>
                </button>
              </div>
            </Panel>
          ) : null}

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
                Review holdings
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {confirmedCount} confirmed, {unresolvedCount} unresolved, {skippedCount} skipped
              </p>
            </div>
            <Badge tone={canSave ? "success" : "warning"}>
              {canSave ? "Ready to save" : "Resolve issues first"}
            </Badge>
          </div>

          <HoldingsReviewTable
            drafts={drafts}
            onToggleStatus={toggleStatus}
            onSelectCandidate={selectCandidate}
          />

          {confirmedCount > 0 ? (
            <Panel className="flex flex-col gap-3 border-white/[0.06] bg-white/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-400">Estimated cost basis</p>
                <p className="text-2xl font-semibold text-white">
                  {formatPrice(estimatedCostBasis)}
                </p>
              </div>
              <div className="flex flex-col items-start gap-3 sm:items-end">
                <div className="text-sm text-slate-400">
                  {confirmedCount} holding{confirmedCount !== 1 ? "s" : ""} will be saved
                  {hasExistingPortfolio ? ` (${saveMode} mode)` : ""}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => resetFlow(showEntryButton)}
                    className={buttonStyles({ variant: "secondary" })}
                  >
                    Start over
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={!canSave || submitting}
                    className={buttonStyles({
                      size: "lg",
                      className: !canSave ? "opacity-50" : "",
                    })}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Save holdings
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
