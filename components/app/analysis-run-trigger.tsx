"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

interface RunState {
  id: string;
  status: string;
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
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

  const isRunActive =
    !!run &&
    run.status !== "complete" &&
    run.status !== "degraded" &&
    run.status !== "failed";

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

  const normalizedStageStatus =
    run?.status === "degraded" ? "complete" : run?.status;
  const currentIndex = normalizedStageStatus
    ? STAGE_ORDER.indexOf(normalizedStageStatus as (typeof STAGE_ORDER)[number])
    : -1;

  const completedTimeStr = run?.completedAt
    ? `Completed ${new Date(run.completedAt).toLocaleString()}`
    : defaultOverview.lastAnalyzedAt !== "Never"
      ? `Last run ${defaultOverview.lastAnalyzedAt}`
      : "Not run yet";

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
              ? "Analysis complete"
              : run?.status === "degraded"
                ? "Analysis completed with limited confidence"
              : run?.status === "failed"
                ? "Analysis failed"
                : isRunActive
                  ? "Building portfolio-aware explanations"
                  : "Waiting for next update"}
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-slate-300">
            {run?.status === "complete"
              ? "Open the feed to see personalized stories matched to your portfolio and watchlist."
              : run?.status === "degraded"
                ? "The latest run finished, but enough AI steps failed that results may be incomplete. Re-run later for a cleaner output."
              : isRunActive
                ? "Fetching news, enriching articles, and generating insights."
                : "Your feed updates automatically every 20 minutes. No manual refresh needed."}
          </p>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
            <Clock className="h-4 w-4" />
            <span>Updates automatically every 20 minutes</span>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/6 p-5">
          <p className="text-sm uppercase tracking-[0.18em] text-slate-400">
            Progress
          </p>
          <p className="mt-2 text-4xl font-semibold text-white">
            {run?.progress ?? 0}%
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {completedTimeStr}
          </p>
        </div>
      </div>

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

      {!isRunActive && !run?.status && (
        <div className="rounded-2xl border border-white/10 bg-white/4 p-5">
          <p className="text-sm text-slate-400">
            Your feed is built from a shared news pool that refreshes automatically
            every 20 minutes. Articles are matched against your portfolio holdings
            and watchlist symbols.
          </p>
        </div>
      )}
    </>
  );
}
