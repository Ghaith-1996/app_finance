import Link from "next/link";

import { Activity, ArrowRight, BrainCircuit, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { AnalysisRunTrigger } from "@/components/app/analysis-run-trigger";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  getPortfolioInsights,
  getPortfolioOverview,
  getUserPortfolios,
} from "@/lib/actions/portfolio";
import { formatCurrency, formatPercent } from "@/lib/utils";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolioId?: string }>;
}) {
  const params = await searchParams;
  const { data: portfolios } = await getUserPortfolios();
  const portfolioId = params.portfolioId ?? portfolios?.[0]?.id ?? null;

  const [overviewResult, insightsResult] = await Promise.all([
    portfolioId ? getPortfolioOverview(portfolioId) : { data: null, error: null },
    portfolioId ? getPortfolioInsights(portfolioId) : { data: [], error: null },
  ]);

  const portfolioOverview = overviewResult?.data ?? {
    totalValue: 0,
    dayChange: 0,
    monthlyChange: 0,
    lastSyncedAt: "—",
    lastAnalyzedAt: "Never",
    coverage: "0 stories",
    primaryGoal: "Add a portfolio and run analysis.",
  };
  const portfolioInsights = insightsResult?.data ?? [];

  return (
    <AppShell
      eyebrow="Analysis"
      title="Your AI brief is being prepared"
      description="This step gives the product time to map holdings, connect market coverage, and write explanations before the user lands in the daily brief."
      activePath="/analysis"
      actions={
        <>
          <Link
            href={portfolioId ? `/portfolio` : "/portfolio"}
            className={buttonStyles({ variant: "secondary" })}
          >
            Review portfolio
          </Link>
          <Link
            href={portfolioId ? `/feed` : "/feed"}
            className={buttonStyles({ size: "lg" })}
          >
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
            {portfolioId ? (
              <AnalysisRunTrigger
                portfolioId={portfolioId}
                defaultOverview={portfolioOverview}
              />
            ) : (
              <>
                <Badge tone="brand">
                  <BrainCircuit className="h-3.5 w-3.5" />
                  No portfolio
                </Badge>
                <h2 className="text-3xl font-semibold text-white">
                  Create a portfolio first
                </h2>
                <p className="max-w-2xl text-sm leading-7 text-slate-300">
                  Go to onboarding to add a portfolio, then return here to run
                  the AI analysis.
                </p>
                <Link href="/onboarding" className={buttonStyles({ size: "lg" })}>
                  Go to onboarding
                </Link>
              </>
            )}
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
              {portfolioInsights.length > 0 ? (
                portfolioInsights.map((insight) => (
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
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Run analysis to generate insights.
                </p>
              )}
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
