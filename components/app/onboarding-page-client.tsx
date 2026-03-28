"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  FileSpreadsheet,
  Loader2,
  PencilLine,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { PortfolioCsvImportFlow } from "@/components/app/portfolio-csv-import-flow";
import { HoldingsReviewTable } from "@/components/app/holdings-review-table";
import { SymbolSearch } from "@/components/app/symbol-search";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { saveHoldings } from "@/lib/actions/portfolio";
import type {
  HoldingDraft,
  HoldingResolutionCandidate,
} from "@/lib/types";
import { cn, formatPrice } from "@/lib/utils";

type Method = "csv" | "manual";
type Step = "method" | "intake" | "review";

export function OnboardingPageClient({ showAdminLink = false }: { showAdminLink?: boolean }) {
  const router = useRouter();
  const [method, setMethod] = useState<Method>("csv");
  const [step, setStep] = useState<Step>("method");
  const [drafts, setDrafts] = useState<HoldingDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [manualRows, setManualRows] = useState<
    Array<{ tempId: string; quantity: string; avgCost: string; thesis: string }>
  >([]);

  const confirmedCount = useMemo(
    () => drafts.filter((d) => d.status === "confirmed").length,
    [drafts],
  );
  const unresolvedCount = useMemo(
    () => drafts.filter((d) => d.status === "unresolved").length,
    [drafts],
  );
  const canSave = confirmedCount > 0 && unresolvedCount === 0;

  function handleSymbolSelect(candidate: HoldingResolutionCandidate) {
    const tempId = `manual-${Date.now()}-${candidate.symbol}`;
    setDrafts((prev) => [
      ...prev,
      {
        tempId,
        symbol: candidate.symbol,
        company: candidate.name,
        quantity: 0,
        averageCost: 0,
        sector: "",
        market: candidate.exchange,
        exchange: candidate.exchange,
        currency: "USD",
        thesis: "",
        importSource: "manual",
        status: "unresolved",
        issues: [
          { field: "quantity", message: "Enter quantity" },
          { field: "averageCost", message: "Enter average cost" },
        ],
        candidates: [],
      },
    ]);
    setManualRows((prev) => [
      ...prev,
      { tempId, quantity: "", avgCost: "", thesis: "" },
    ]);
  }

  function updateManualRow(
    tempId: string,
    field: "quantity" | "avgCost" | "thesis",
    value: string,
  ) {
    setManualRows((prev) =>
      prev.map((r) => (r.tempId === tempId ? { ...r, [field]: value } : r)),
    );

    setDrafts((prev) =>
      prev.map((d) => {
        if (d.tempId !== tempId) return d;

        const row = manualRows.find((r) => r.tempId === tempId);
        const qty =
          field === "quantity"
            ? parseFloat(value) || 0
            : parseFloat(row?.quantity ?? "0") || 0;
        const cost =
          field === "avgCost"
            ? parseFloat(value) || 0
            : parseFloat(row?.avgCost ?? "0") || 0;
        const thesis = field === "thesis" ? value : row?.thesis ?? "";

        const issues = [];
        if (qty <= 0) issues.push({ field: "quantity", message: "Enter quantity" });
        if (cost <= 0) issues.push({ field: "averageCost", message: "Enter average cost" });

        return {
          ...d,
          quantity: qty,
          averageCost: cost,
          thesis,
          status: issues.length > 0 ? ("unresolved" as const) : ("confirmed" as const),
          issues,
        };
      }),
    );
  }

  function removeManualRow(tempId: string) {
    setDrafts((prev) => prev.filter((d) => d.tempId !== tempId));
    setManualRows((prev) => prev.filter((r) => r.tempId !== tempId));
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
    setSubmitting(true);
    setError(null);

    try {
      const confirmed = drafts.filter((d) => d.status === "confirmed");
      const result = await saveHoldings({
        portfolioId: null,
        portfolioName: "My Portfolio",
        sourceType: "manual",
        mode: "replace",
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

      router.push(
        result.portfolioId
          ? `/analysis?portfolioId=${result.portfolioId}`
          : "/portfolio",
      );
    } catch {
      setError("Failed to save portfolio.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell
      eyebrow="Onboarding"
      title="Bring your portfolio into one intelligent home"
      description="Import a CSV from your broker or create holdings manually. Review and confirm before saving."
      activePath="/onboarding"
      showAdminLink={showAdminLink}
      actions={
        step === "review" ? (
          <>
            <button
              type="button"
              onClick={() => setStep("intake")}
              className={buttonStyles({ variant: "secondary" })}
            >
              Back
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
                  Save portfolio
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </button>
          </>
        ) : step === "intake" ? (
          <button
            type="button"
            onClick={() => setStep("method")}
            className={buttonStyles({ variant: "secondary" })}
          >
            Back
          </button>
        ) : (
          <Link
            href="/portfolio"
            className={buttonStyles({ variant: "secondary" })}
          >
            Skip to portfolio
          </Link>
        )
      }
    >
      {error ? (
        <div className="mb-6 rounded-2xl border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {error}
        </div>
      ) : null}

      {step === "method" ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <Panel className="space-y-5 border-white/[0.06] bg-surface-raised">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
                  Choose a method
                </p>
                <p className="mt-2 text-sm leading-7 text-slate-400">
                  Import holdings from a CSV file or add them manually one by one.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setMethod("csv");
                    setStep("intake");
                    setDrafts([]);
                    setManualRows([]);
                    setError(null);
                  }}
                  className={cn(
                    "rounded-3xl border p-5 text-left transition",
                    "border-white/[0.06] bg-surface-raised hover:border-brand/28 hover:bg-brand/6",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-2xl border border-white/[0.06] bg-white/5 p-3 text-brand">
                      <FileSpreadsheet className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-white">Import CSV</p>
                      <p className="text-sm text-slate-400">
                        Upload a file from your broker or spreadsheet.
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMethod("manual");
                    setStep("intake");
                    setDrafts([]);
                    setManualRows([]);
                    setError(null);
                  }}
                  className={cn(
                    "rounded-3xl border p-5 text-left transition",
                    "border-white/[0.06] bg-surface-raised hover:border-brand/28 hover:bg-brand/6",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="rounded-2xl border border-white/[0.06] bg-white/5 p-3 text-brand">
                      <PencilLine className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-lg font-semibold text-white">Create manually</p>
                      <p className="text-sm text-slate-400">
                        Search and add stocks one by one with quantity and cost.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            </Panel>
          </div>

          <Panel className="space-y-4 border-white/[0.06] bg-surface-raised">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              What to expect
            </p>
            <div className="space-y-3">
              <InfoCard
                title="Review before save"
                detail="Every holding is shown in a review table before it reaches your portfolio. Nothing saves until you confirm."
              />
              <InfoCard
                title="Symbol resolution"
                detail="Partial or ambiguous tickers are matched against Yahoo Finance. You choose the correct match."
              />
              <InfoCard
                title="Flexible import"
                detail="Start with a CSV or add positions manually. You can switch methods before saving."
              />
            </div>
            <div className="rounded-3xl border border-brand/16 bg-brand/10 p-5">
              <div className="flex items-center gap-3 text-brand">
                <ShieldCheck className="h-5 w-5" />
                <p className="text-sm font-semibold uppercase tracking-[0.2em]">
                  Read-only by design
                </p>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Broker connections are informational only. CSV import reads your
                file locally and sends data to your own Supabase project.
              </p>
            </div>
          </Panel>
        </div>
      ) : null}

      {step === "intake" && method === "csv" ? (
        <PortfolioCsvImportFlow
          portfolioId={null}
          saveBehavior="redirect-analysis"
          title="Import your broker CSV"
          description="Upload a holdings file, review the parsed positions, then save your first portfolio."
          showEntryButton={false}
          defaultOpen
        />
      ) : null}

      {step === "intake" && method === "manual" ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <Panel className="space-y-5 border-white/[0.06] bg-surface-raised">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
                    Add holdings
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-400">
                    Search for a ticker or company name, then enter quantity and average cost.
                  </p>
                </div>
                <Badge tone="brand">
                  {drafts.length} holding{drafts.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <SymbolSearch onSelect={handleSymbolSelect} />
            </Panel>

            {drafts.length > 0 ? (
              <div className="space-y-3">
                {drafts.map((draft) => {
                  const row = manualRows.find((r) => r.tempId === draft.tempId);
                  return (
                    <Panel
                      key={draft.tempId}
                      className="space-y-4 border-white/[0.06] bg-surface-raised"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-3">
                            <p className="text-lg font-semibold text-white">
                              {draft.symbol}
                            </p>
                            <Badge tone={draft.status === "confirmed" ? "success" : "warning"}>
                              {draft.status}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-slate-400">
                            {draft.company} {draft.market ? `· ${draft.market}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeManualRow(draft.tempId)}
                          className="rounded-full p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
                            Shares
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row?.quantity ?? ""}
                            onChange={(e) =>
                              updateManualRow(draft.tempId, "quantity", e.target.value)
                            }
                            placeholder="e.g. 50"
                            className="w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2.5 text-sm text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
                            Avg cost
                          </label>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={row?.avgCost ?? ""}
                            onChange={(e) =>
                              updateManualRow(draft.tempId, "avgCost", e.target.value)
                            }
                            placeholder="e.g. 142.50"
                            className="w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2.5 text-sm text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-400">
                            Thesis (optional)
                          </label>
                          <input
                            type="text"
                            value={row?.thesis ?? ""}
                            onChange={(e) =>
                              updateManualRow(draft.tempId, "thesis", e.target.value)
                            }
                            placeholder="Why you own this"
                            className="w-full rounded-xl border border-white/10 bg-surface-raised px-3 py-2.5 text-sm text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                          />
                        </div>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setStep("review")}
              disabled={drafts.length === 0}
              className={buttonStyles({
                size: "lg",
                className: drafts.length === 0 ? "opacity-50" : "",
              })}
            >
              Review holdings
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </div>

          <Panel className="space-y-4 border-white/[0.06] bg-surface-raised">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              Summary
            </p>
            <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-400">
                Holdings added
              </p>
              <p className="mt-3 text-4xl font-semibold text-white">{drafts.length}</p>
            </div>
            <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] p-5">
              <p className="text-sm uppercase tracking-[0.18em] text-slate-400">
                Ready to save
              </p>
              <p className="mt-3 text-4xl font-semibold text-white">{confirmedCount}</p>
              {unresolvedCount > 0 ? (
                <p className="mt-2 text-sm text-amber-400">
                  {unresolvedCount} need quantity or cost
                </p>
              ) : null}
            </div>
          </Panel>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
                Review holdings
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {confirmedCount} confirmed, {unresolvedCount} unresolved,{" "}
                {drafts.filter((d) => d.status === "skipped").length} skipped
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
                  {formatPrice(
                    drafts
                      .filter((d) => d.status === "confirmed")
                      .reduce((sum, d) => sum + d.quantity * d.averageCost, 0),
                  )}
                </p>
              </div>
              <div className="text-sm text-slate-400">
                {confirmedCount} holding{confirmedCount !== 1 ? "s" : ""} will be saved
              </div>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}

function InfoCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-7 text-slate-400">{detail}</p>
    </div>
  );
}
