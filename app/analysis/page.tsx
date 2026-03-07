import Link from "next/link";

import { Activity, ArrowRight, BrainCircuit, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  analysisSteps,
  portfolioInsights,
  portfolioOverview,
} from "@/lib/mock-data";
import { formatCurrency, formatPercent, cn } from "@/lib/utils";

export default function AnalysisPage() {
  return (
    <AppShell
      eyebrow="Analysis"
      title="Your AI brief is being prepared"
      description="This step gives the product time to map holdings, connect market coverage, and write explanations before the user lands in the daily brief."
      activePath="/analysis"
      actions={
        <>
          <Link
            href="/portfolio"
            className={buttonStyles({ variant: "secondary" })}
          >
            Review portfolio
          </Link>
          <Link href="/feed" className={buttonStyles({ size: "lg" })}>
            Open feed
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Panel
            glow
            className="space-y-6 border-black/6 bg-[#142033] p-8 shadow-[0_30px_80px_rgba(15,23,42,0.14)]"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <Badge tone="brand">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  generating_insights
                </Badge>
                <h2 className="text-3xl font-semibold text-white">
                  Building portfolio-aware explanations
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-slate-300">
                  Instead of just ranking articles, the analysis step ties each
                  story back to holdings, sectors, and macro exposures before the
                  user lands in the feed.
                </p>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/6 p-5">
                <p className="text-sm uppercase tracking-[0.18em] text-slate-400">
                  Estimated progress
                </p>
                <p className="mt-2 text-4xl font-semibold text-white">78%</p>
                <p className="mt-2 text-sm text-slate-400">
                  Last updated {portfolioOverview.lastAnalyzedAt}
                </p>
              </div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-white/8">
              <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-brand to-brand-strong" />
            </div>
            <div className="grid gap-3">
              {analysisSteps.map((step) => (
                <div
                  key={step.id}
                  className={cn(
                    "rounded-3xl border p-5",
                    step.status === "current"
                      ? "border-brand/24 bg-brand/10"
                      : "border-white/10 bg-white/6",
                  )}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <p className="text-lg font-semibold text-white">{step.title}</p>
                      <p className="text-sm leading-7 text-slate-200">
                        {step.detail}
                      </p>
                    </div>
                    <Badge
                      tone={
                        step.status === "complete"
                          ? "success"
                          : step.status === "current"
                            ? "brand"
                            : "neutral"
                      }
                    >
                      {step.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel className="space-y-5 border-black/6 bg-white/84">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-black/6 bg-[#f7f2ea] p-3 text-brand">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                  Portfolio snapshot
                </p>
                <p className="text-lg font-semibold text-slate-950">
                  {formatCurrency(portfolioOverview.totalValue)}
                </p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Metric label="Day change" value={formatPercent(portfolioOverview.dayChange)} />
              <Metric
                label="30 day move"
                value={formatPercent(portfolioOverview.monthlyChange)}
              />
              <Metric label="Last sync" value={portfolioOverview.lastSyncedAt} />
              <Metric label="Coverage" value={portfolioOverview.coverage} />
            </div>
          </Panel>

          <Panel className="space-y-4 border-black/6 bg-white/84">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-black/6 bg-[#f7f2ea] p-3 text-brand">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                  Insight priorities
                </p>
                <p className="text-lg font-semibold text-slate-950">
                  What the feed will emphasize next
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {portfolioInsights.map((insight) => (
                <div
                  key={insight.title}
                  className="rounded-2xl border border-black/6 bg-[#fffdf9] p-4"
                >
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                    {insight.title}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {insight.value}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {insight.detail}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/6 bg-[#fffdf9] p-4">
      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
