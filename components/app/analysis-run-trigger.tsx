"use client";

import { useCallback, useEffect, useState } from "react";
import { BrainCircuit } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRun = useCallback(async () => {
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
  }, [portfolioId]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  useEffect(() => {
    if (!run || run.status === "complete" || run.status === "failed") return;
    const t = setInterval(fetchRun, 2000);
    return () => clearInterval(t);
  }, [run?.status, run?.id, fetchRun]);

  useEffect(() => {
    const supabase = createClient();
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
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [portfolioId, fetchRun]);

  async function startAnalysis() {
    setError(null);
    setLoading(true);
    const res = await fetch("/api/analysis/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ portfolioId }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to start analysis");
      return;
    }
    if (data.runId) {
      const statusRes = await fetch(`/api/analysis/run?runId=${encodeURIComponent(data.runId)}`);
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
              : run?.status === "failed"
                ? "Analysis failed"
                : run?.status
                  ? "Building portfolio-aware explanations"
                  : "Ready to run analysis"}
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-slate-300">
            {run?.status === "complete"
              ? "Your feed is ready. Open the feed to see personalized stories."
              : run?.status
                ? "Mapping holdings to news and generating insights."
                : "Run analysis to map your holdings to news and generate the daily brief."}
          </p>
          {!run?.status || run.status === "complete" || run.status === "failed" ? (
            <Button
              size="lg"
              onClick={startAnalysis}
              disabled={loading}
              className="mt-2 border-brand bg-brand text-slate-950 hover:border-brand-strong hover:bg-brand-strong"
            >
              {loading ? "Starting…" : "Run analysis"}
            </Button>
          ) : null}
          {error ? (
            <p className="text-sm text-rose-300">{error}</p>
          ) : null}
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
                  : "border-white/10 bg-white/6"
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
    </>
  );
}
