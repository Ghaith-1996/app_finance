import Link from "next/link";

import { ArrowRight, BrainCircuit, RefreshCw } from "lucide-react";

import { AnalysisRunTrigger } from "@/components/app/analysis-run-trigger";
import { AppShell } from "@/components/app/app-shell";
import { PortfolioSnapshotPanel } from "@/components/app/portfolio-snapshot-panel";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { loadAnalysisPageData } from "@/lib/server/page-loaders";

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolioId?: string }>;
}) {
  const params = await searchParams;
  const {
    showOnboardingNav,
    portfolioId,
    portfolioOverview,
    portfolioInsights,
  } = await loadAnalysisPageData(params.portfolioId ?? null);

  return (
    <AppShell
      eyebrow="Analysis"
      title="Your AI brief updates automatically"
      description="Every 20 minutes, the system ingests new articles and matches them against your portfolio holdings and watchlist symbols."
      activePath="/analysis"
      showOnboardingNav={showOnboardingNav}
      actions={
        <>
          <Link
            href={portfolioId ? "/portfolio" : "/portfolio"}
            className={buttonStyles({ variant: "secondary" })}
          >
            Review portfolio
          </Link>
          <Link href={portfolioId ? "/feed" : "/feed"} className={buttonStyles({ size: "lg" })}>
            Open feed
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Panel glow className="space-y-6 border-white/[0.06] bg-[#0d1520] p-8">
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
                <p className="max-w-2xl text-sm leading-7 text-slate-400">
                  Go to onboarding to add a portfolio. Once created, your feed will update
                  automatically every 20 minutes.
                </p>
                <Link href="/onboarding" className={buttonStyles({ size: "lg" })}>
                  Go to onboarding
                </Link>
              </>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <PortfolioSnapshotPanel
            initialOverview={portfolioOverview}
            portfolioId={portfolioId}
          />

          <Panel className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/5 p-3 text-brand">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                  Insight priorities
                </p>
                <p className="text-lg font-semibold text-white">
                  What the feed will emphasize next
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {portfolioInsights.length > 0 ? (
                portfolioInsights.map((insight) => (
                  <div
                    key={insight.title}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
                  >
                    <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                      {insight.title}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-white">{insight.value}</p>
                    <p className="mt-2 text-sm leading-7 text-slate-400">{insight.detail}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Insights will appear after the next automatic analysis run.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
