"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BrainCircuit, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  INGEST_SOURCE_KEYS,
  INGEST_SOURCE_LABELS,
} from "@/lib/services/news/source-config";
import { cn } from "@/lib/utils";
import { writeLastIngestSnapshot } from "@/lib/ingest-hint";

const STAGE_ORDER = [
  "queued",
  "processing_holdings",
  "mapping_news",
  "generating_insights",
  "complete",
] as const;

const STEP_LABELS: Record<string, { title: string; detail: string }> = {
  queued: {
    title: "Portfolio received",
    detail: "Holdings normalized and matched to sectors.",
  },
  processing_holdings: {
    title: "Processing holdings",
    detail: "Calculating concentration and sector overlap.",
  },
  mapping_news: {
    title: "Mapping the news graph",
    detail: "Scanning news for stories connected to holdings.",
  },
  generating_insights: {
    title: "Generating insights",
    detail: "Writing plain-English explanations.",
  },
  complete: {
    title: "Preparing the feed",
    detail: "Packaging relevance scores and recommended watch areas.",
  },
};

const DISPLAY_SOURCE_KEYS = [
  ...INGEST_SOURCE_KEYS,
  "finnhub",
] as const;

const DISPLAY_SOURCE_LABELS: Record<(typeof DISPLAY_SOURCE_KEYS)[number], string> = {
  ...INGEST_SOURCE_LABELS,
  finnhub: "Finnhub",
};

interface RunState {
  id: string;
  status: string;
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
}

interface PipelineStage {
  status: "success" | "failed" | "skipped" | "partial" | "empty" | "queued";
  detail: string;
}

interface IngestSourcePayload {
  fetched?: number;
  inserted?: number;
  skipped?: number;
  failed?: number;
  fetch_outcome?: string;
  fetch_error?: string | null;
  fetch_warnings?: string[];
}

interface IngestBreakdownPayload {
  edgar?: IngestSourcePayload;
  newsapi?: IngestSourcePayload;
  gnews?: IngestSourcePayload;
  finnhub?: IngestSourcePayload;
  ingest_status?: string;
  ingest_detail?: string;
  total_inserted?: number;
}

interface PoolSnapshotPayload {
  poolCount24h: number;
  latestPublishedAt24h: string | null;
  bySource?: Record<string, number>;
}

interface AnalysisMetaPayload {
  poolCount24h: number;
  latestPublishedAt24h: string | null;
  candidatesScored: number;
  feedItemsCreated: number;
}

interface ExtractionStatsPayload {
  queued?: number;
  attempted?: number;
  extracted?: number;
  failed?: number;
  skippedMissingUrl?: number;
  skippedUnsupportedSource?: number;
  skippedAlreadyExtracted?: number;
  skippedUnsupportedUrl?: number;
  background?: boolean;
}

interface RefreshOutcomePayload {
  poolSnapshot: PoolSnapshotPayload | null;
  analysisMeta: AnalysisMetaPayload | null;
  totalInserted: number;
}

function formatPoolLatest(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return null;
  }
}

/** Hero copy when `run.status === "complete"`, driven by pool + analysis metadata from the last refresh. */
function heroForCompleteRun(outcome: RefreshOutcomePayload | null): {
  title: string;
  subtitle: string;
} {
  if (!outcome?.analysisMeta) {
    return {
      title: "Analysis complete",
      subtitle:
        "Open the feed to see personalized stories when they are available for your portfolio.",
    };
  }

  const { analysisMeta, poolSnapshot, totalInserted } = outcome;
  const pool =
    poolSnapshot?.poolCount24h ?? analysisMeta.poolCount24h ?? 0;
  const feedCreated = analysisMeta.feedItemsCreated;
  const latest =
    formatPoolLatest(
      poolSnapshot?.latestPublishedAt24h ?? analysisMeta.latestPublishedAt24h,
    ) ?? null;
  const poolHint = latest ? ` Latest article in the pool: ${latest}.` : "";
  const reusedPool = totalInserted === 0;

  if (pool === 0) {
    return {
      title: "Analysis complete",
      subtitle:
        "No articles are currently available in the 24-hour news pool. Try refreshing again later.",
    };
  }

  if (feedCreated > 0) {
    return {
      title: "Your feed is ready",
      subtitle: reusedPool
        ? `No new articles were fetched this run; we analyzed your existing 24-hour pool and added ${feedCreated} stor${feedCreated === 1 ? "y" : "ies"} to your feed.${poolHint}`
        : `Open the feed to see personalized stories matched to your portfolio.${poolHint}`,
    };
  }

  return {
    title: "Analysis complete",
    subtitle: reusedPool
      ? `No new articles were fetched this run; we analyzed your existing pool but no stories met the relevance bar for your portfolio.${poolHint}`
      : `We scanned recent articles and none matched your portfolio strongly enough to add to your feed.${poolHint}`,
  };
}

interface AnalysisRunTriggerProps {
  portfolioId: string;
  defaultOverview: {
    lastAnalyzedAt: string;
  };
}

export function AnalysisRunTrigger({
  portfolioId,
  defaultOverview,
}: AnalysisRunTriggerProps) {
  const [run, setRun] = useState<RunState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipelineStages, setPipelineStages] = useState<Record<string, PipelineStage> | null>(null);
  const [ingestBreakdown, setIngestBreakdown] = useState<IngestBreakdownPayload | null>(null);
  const [refreshOutcome, setRefreshOutcome] = useState<RefreshOutcomePayload | null>(null);
  const [extractionStats, setExtractionStats] = useState<ExtractionStatsPayload | null>(null);
  const [healthIssues, setHealthIssues] = useState<Array<{ name: string; error: string }> | null>(null);
  const fetchingRef = useRef(false);
  const supabase = useMemo(() => createClient(), []);

  const fetchRun = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await fetch(`/api/analysis/run?portfolioId=${encodeURIComponent(portfolioId)}`);
      const data = await res.json().catch(() => ({}));
      if (data.run) {
        setRun({
          id: data.run.id,
          status: data.run.status,
          progress: data.run.progress ?? 0,
          startedAt: data.run.startedAt,
          completedAt: data.run.completedAt,
        });
      } else {
        setRun(null);
      }
    } finally {
      fetchingRef.current = false;
    }
  }, [portfolioId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  const isRunActive = !!run && run.status !== "complete" && run.status !== "failed";

  useEffect(() => {
    if (!isRunActive) return;
    const t = setInterval(fetchRun, 2000);
    return () => clearInterval(t);
  }, [isRunActive, fetchRun]);

  useEffect(() => {
    const channel = supabase
      .channel(`analysis-run-${portfolioId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "analysis_runs",
          filter: `portfolio_id=eq.${portfolioId}`,
        },
        () => {
          fetchRun();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [portfolioId, fetchRun, supabase]);

  async function startRefresh() {
    setError(null);
    setPipelineStages(null);
    setIngestBreakdown(null);
    setRefreshOutcome(null);
    setExtractionStats(null);
    setHealthIssues(null);
    setLoading(true);

    const res = await fetch("/api/news/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    writeLastIngestSnapshot({
      at: Date.now(),
      lookbackHours: typeof data.lookbackHours === "number" ? data.lookbackHours : undefined,
      ingest: data.stages?.ingest,
      breakdown: data.ingestBreakdown,
    });

    if (Array.isArray(data.workerChecks)) {
      const failures = (
        data.workerChecks as Array<{ name: string; ok: boolean; error?: string; detail?: string }>
      ).filter((c) => !c.ok);
      if (failures.length > 0) {
        setHealthIssues(
          failures.map((c) => ({
            name: c.name,
            error: c.error ?? c.detail ?? "Check failed",
          })),
        );
      }
    }

    if (data.extractionStats) {
      setExtractionStats(data.extractionStats as ExtractionStatsPayload);
    }

    if (data.stages) {
      setPipelineStages(data.stages);
    }

    if (data.ingestBreakdown) {
      setIngestBreakdown(data.ingestBreakdown as IngestBreakdownPayload);
    }

    if (res.ok) {
      setRefreshOutcome({
        poolSnapshot: (data.poolSnapshot as PoolSnapshotPayload | undefined) ?? null,
        analysisMeta: (data.analysisMeta as AnalysisMetaPayload | undefined) ?? null,
        totalInserted: typeof data.totalInserted === "number" ? data.totalInserted : 0,
      });
    }

    const ingestFailed =
      data.stages?.ingest?.status === "failed"
        ? (data.stages.ingest as { detail?: string }).detail
        : null;

    if (ingestFailed && !(Array.isArray(data.workerChecks) && data.workerChecks.some((c: { ok: boolean }) => !c.ok))) {
      setError(ingestFailed);
    }

    if (!res.ok && !data.stages) {
      setError(data.message ?? data.error ?? "Refresh failed");
      return;
    }

    // Refresh analysis run state
    if (data.analysisRunId) {
      const statusRes = await fetch(`/api/analysis/run?runId=${encodeURIComponent(data.analysisRunId)}`);
      const statusData = await statusRes.json().catch(() => ({}));
      if (statusData.id) {
        setRun({
          id: statusData.id,
          status: statusData.status,
          progress: statusData.progress ?? 0,
          startedAt: statusData.startedAt,
          completedAt: statusData.completedAt,
        });
      }
    }
  }

  const currentIndex = run?.status
    ? STAGE_ORDER.indexOf(run.status as (typeof STAGE_ORDER)[number])
    : -1;

  const hasStageFailure = pipelineStages
    ? Object.values(pipelineStages).some((s) => s.status === "failed")
    : false;

  const ingestNeedsDiagnostics =
    pipelineStages?.ingest?.status === "empty" ||
    pipelineStages?.ingest?.status === "partial";

  const extractionNeedsDiagnostics =
    extractionStats != null &&
    (pipelineStages?.extraction?.status === "skipped" ||
      pipelineStages?.extraction?.status === "partial") &&
    ((extractionStats.skippedMissingUrl ?? 0) > 0 ||
      (extractionStats.skippedUnsupportedSource ?? 0) > 0 ||
      (extractionStats.skippedAlreadyExtracted ?? 0) > 0 ||
      (extractionStats.skippedUnsupportedUrl ?? 0) > 0);

  const completeHero =
    run?.status === "complete" ? heroForCompleteRun(refreshOutcome) : null;

  const ingestSourceNotes =
    ingestBreakdown &&
    DISPLAY_SOURCE_KEYS
      .map((key) => {
        const fetchError = ingestBreakdown[key]?.fetch_error;
        return fetchError ? `${DISPLAY_SOURCE_LABELS[key]}: ${fetchError}` : null;
      })
      .filter(Boolean) as string[];

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <Badge tone="brand">
            <BrainCircuit className="h-3.5 w-3.5" />
            {run?.status ?? "idle"}
          </Badge>
          <h2 className="text-3xl font-semibold text-white">
            {run?.status === "complete"
              ? (completeHero?.title ?? "Analysis complete")
              : run?.status === "failed"
                ? "Analysis failed"
                : run?.status
                  ? "Building portfolio-aware explanations"
                  : "Ready to refresh"}
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-slate-300">
            {run?.status === "complete"
              ? (completeHero?.subtitle ??
                "Open the feed to see personalized stories when they are available for your portfolio.")
              : run?.status
                ? "Fetching news, enriching articles, and generating insights."
                : "Refresh to fetch the latest news, classify each article, and build your personalized feed."}
          </p>
          {!run?.status || run.status === "complete" || run.status === "failed" ? (
            <Button
              size="lg"
              onClick={startRefresh}
              disabled={loading}
              className="mt-2 border-brand bg-brand text-slate-950 hover:border-brand-strong hover:bg-brand-strong"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              {loading ? "Refreshing…" : "Refresh news & analysis"}
            </Button>
          ) : null}
          {error && (
            <p className="text-sm text-rose-300">{error}</p>
          )}
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/6 p-5">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-400">
            Progress
          </p>
          <p className="mt-2 text-4xl font-semibold text-white">
            {run?.progress ?? 0}%
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {run?.completedAt
              ? `Completed ${new Date(run.completedAt).toLocaleString()}`
              : defaultOverview.lastAnalyzedAt !== "Never"
                ? `Last run ${defaultOverview.lastAnalyzedAt}`
                : "Not run yet"}
          </p>
        </div>
      </div>

      {/* Pipeline stage results */}
      {pipelineStages && (
        <div className="space-y-2">
          {Object.entries(pipelineStages).map(([key, stage]) => (
            <div
              key={key}
              className={cn(
                "flex items-start justify-between gap-4 rounded-2xl border p-4",
                stage.status === "failed"
                  ? "border-rose-500/30 bg-rose-500/10"
                  : stage.status === "skipped"
                    ? "border-white/10 bg-white/4"
                    : stage.status === "queued"
                      ? "border-sky-500/25 bg-sky-500/10"
                      : stage.status === "partial" || stage.status === "empty"
                        ? "border-amber-500/25 bg-amber-500/10"
                        : "border-brand/24 bg-brand/8",
              )}
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold capitalize text-white">{key}</p>
                <p className="text-sm text-slate-300">{stage.detail}</p>
              </div>
              <Badge
                tone={
                  stage.status === "failed"
                    ? "danger"
                    : stage.status === "skipped"
                      ? "neutral"
                      : stage.status === "queued"
                        ? "brand"
                        : stage.status === "partial" || stage.status === "empty"
                          ? "warning"
                          : "success"
                }
              >
                {stage.status}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {ingestNeedsDiagnostics && ingestBreakdown && (
        <div
          data-testid="ingest-diagnostics"
          className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 space-y-3"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
            Source breakdown
          </p>
          <div className="space-y-2">
            {DISPLAY_SOURCE_KEYS.map((key) => {
              const src = ingestBreakdown[key];
              if (!src) return null;
              return (
                <div key={key} className="space-y-0.5">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-200">
                    <span className="font-semibold text-white">{DISPLAY_SOURCE_LABELS[key]}</span>
                    <span>fetched {src.fetched ?? 0}</span>
                    <span>new {src.inserted ?? 0}</span>
                    <span>already ingested {src.skipped ?? 0}</span>
                    <span>failed {src.failed ?? 0}</span>
                  </div>
                  {src.fetch_error && (
                    <p className="text-sm text-rose-300">{src.fetch_error}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!ingestNeedsDiagnostics && ingestSourceNotes && ingestSourceNotes.length > 0 && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
            Source errors
          </p>
          <ul className="space-y-1 text-sm text-slate-200">
            {ingestSourceNotes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {extractionNeedsDiagnostics && extractionStats && (
        <div
          data-testid="extraction-diagnostics"
          className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 space-y-3"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
            Extraction skip reasons
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-200">
            {(extractionStats.skippedMissingUrl ?? 0) > 0 && (
              <span>Missing URL: {extractionStats.skippedMissingUrl}</span>
            )}
            {(extractionStats.skippedUnsupportedSource ?? 0) > 0 && (
              <span>Unsupported source: {extractionStats.skippedUnsupportedSource}</span>
            )}
            {(extractionStats.skippedAlreadyExtracted ?? 0) > 0 && (
              <span>Already extracted: {extractionStats.skippedAlreadyExtracted}</span>
            )}
            {(extractionStats.skippedUnsupportedUrl ?? 0) > 0 && (
              <span>Unsupported URL: {extractionStats.skippedUnsupportedUrl}</span>
            )}
          </div>
        </div>
      )}

      {/* Health issues from preflight */}
      {healthIssues && healthIssues.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            <p className="text-sm font-semibold text-rose-300">
              Setup issues detected
            </p>
          </div>
          <ul className="space-y-2 text-sm text-slate-300">
            {healthIssues.map((issue) => (
              <li key={issue.name} className="flex gap-2">
                <Badge tone="danger" className="shrink-0">{issue.name}</Badge>
                <span>{issue.error}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="h-3 overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-strong transition-all duration-500"
          style={{ width: `${run?.progress ?? 0}%` }}
        />
      </div>
      <div className="grid gap-3">
        {STAGE_ORDER.map((stage, index) => {
          const meta = STEP_LABELS[stage] ?? { title: stage, detail: "" };
          const stepStatus =
            currentIndex > index
              ? "complete"
              : currentIndex === index
                ? run?.status === "failed"
                  ? "upcoming"
                  : "current"
                : "upcoming";
          return (
            <div
              key={stage}
              className={cn(
                "rounded-3xl border p-5",
                stepStatus === "current"
                  ? "border-brand/24 bg-brand/10"
                  : "border-white/10 bg-white/6",
              )}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-white">{meta.title}</p>
                  <p className="text-sm leading-7 text-slate-200">{meta.detail}</p>
                </div>
                <Badge
                  tone={
                    stepStatus === "complete"
                      ? "success"
                      : stepStatus === "current"
                        ? "brand"
                        : "neutral"
                  }
                >
                  {stepStatus}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>

      {/* Context-specific empty state hints */}
      {!loading && !run?.status && !hasStageFailure && (
        <div className="rounded-2xl border border-white/10 bg-white/4 p-5">
          <p className="text-sm text-slate-400">
            Press <strong className="text-slate-200">Refresh news &amp; analysis</strong> to
            fetch the latest SEC filings and market headlines into the global pool,
            classify each article with AI, and generate your personalized feed.
          </p>
        </div>
      )}
    </>
  );
}
