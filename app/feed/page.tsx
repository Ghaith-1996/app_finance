import Link from "next/link";

import { ArrowRight, BellRing, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { FeedView } from "@/components/app/feed-view";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { portfolioInsights, portfolioOverview } from "@/lib/mock-data";
import { formatCurrency, formatPercent } from "@/lib/utils";

export default function FeedPage() {
  return (
    <AppShell
      eyebrow="Daily brief"
      title="A personalized news feed built around what the user owns"
      description="This screen is the core daily habit: open the app, scan the brief, and understand why each story belongs in front of the portfolio."
      activePath="/feed"
      actions={
        <>
          <Link
            href="/analysis"
            className={buttonStyles({ variant: "secondary" })}
          >
            Refresh analysis
          </Link>
          <Link href="/portfolio" className={buttonStyles({ size: "lg" })}>
            View portfolio
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr_0.85fr]">
          <Panel
            glow
            className="space-y-4 border-black/6 bg-[#142033] p-6 shadow-[0_30px_80px_rgba(15,23,42,0.14)]"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-400">
                  Coverage
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {portfolioOverview.coverage}
                </p>
              </div>
              <Badge tone="success">
                <BellRing className="h-3.5 w-3.5" />
                feed_ready
              </Badge>
            </div>
            <p className="text-sm leading-7 text-slate-200">
              The feed opens with the highest-signal market stories first, then
              explains their connection to specific holdings and sectors.
            </p>
          </Panel>
          <MetricCard
            label="Portfolio value"
            value={formatCurrency(portfolioOverview.totalValue)}
            detail={`${formatPercent(portfolioOverview.dayChange)} today`}
          />
          <MetricCard
            label="Last analyzed"
            value={portfolioOverview.lastAnalyzedAt}
            detail={portfolioOverview.primaryGoal}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <FeedView />
          <Panel className="hidden space-y-4 border-black/6 bg-white/84 xl:block">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-black/6 bg-[#f7f2ea] p-3 text-brand">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                  What is driving the feed
                </p>
                <p className="text-lg font-semibold text-slate-950">
                  Current signal stack
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

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Panel className="space-y-3 border-black/6 bg-white/84">
      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="text-3xl font-semibold text-slate-950">{value}</p>
      <p className="text-sm leading-7 text-slate-600">{detail}</p>
    </Panel>
  );
}
