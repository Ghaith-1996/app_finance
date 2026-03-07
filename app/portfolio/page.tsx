import Link from "next/link";

import { ArrowRight, DatabaseZap, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { PortfolioTable } from "@/components/app/portfolio-table";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { holdings, portfolioInsights, portfolioOverview } from "@/lib/mock-data";
import { formatCurrency, formatPercent } from "@/lib/utils";

export default function PortfolioPage() {
  return (
    <AppShell
      eyebrow="Portfolio"
      title="Track the portfolio in one place"
      description="This view keeps holdings, source status, and the latest analysis context together so the user always knows what they own and what changed."
      activePath="/portfolio"
      actions={
        <>
          <Link href="/feed" className={buttonStyles({ variant: "secondary" })}>
            Back to feed
          </Link>
          <Link href="/analysis" className={buttonStyles({ size: "lg" })}>
            Refresh analysis
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
          <Panel
            glow
            className="space-y-4 border-black/6 bg-[#142033] p-6 shadow-[0_30px_80px_rgba(15,23,42,0.14)]"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-400">
                  Total portfolio value
                </p>
                <p className="mt-2 text-4xl font-semibold text-white">
                  {formatCurrency(portfolioOverview.totalValue)}
                </p>
              </div>
              <Badge tone="success">Synced {portfolioOverview.lastSyncedAt}</Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Day" value={formatPercent(portfolioOverview.dayChange)} />
              <Stat
                label="30 day"
                value={formatPercent(portfolioOverview.monthlyChange)}
              />
            </div>
            <p className="text-sm leading-7 text-slate-200">
              {portfolioOverview.primaryGoal}
            </p>
          </Panel>
          <Panel className="space-y-4 border-black/6 bg-white/84">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-black/6 bg-[#f7f2ea] p-3 text-brand">
                <DatabaseZap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                  Source status
                </p>
                <p className="text-lg font-semibold text-slate-950">
                  Mixed provider portfolio
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <SourceRow label="Wealthsimple" detail="Primary linked account" status="Active" />
              <SourceRow
                label="Interactive Brokers"
                detail="Roadmap account shown as imported data"
                status="Preview"
              />
              <SourceRow label="Manual positions" detail="Fallback hedge sleeve" status="Editable" />
            </div>
          </Panel>
          <Panel className="space-y-4 border-black/6 bg-white/84">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-black/6 bg-[#f7f2ea] p-3 text-brand">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                  Next backend hooks
                </p>
                <p className="text-lg font-semibold text-slate-950">
                  Ready for secure sync
                </p>
              </div>
            </div>
            <p className="text-sm leading-7 text-slate-600">
              This view is already structured for read-only broker status, stale
              portfolio banners, and last analyzed timestamps once the backend is
              connected.
            </p>
            <Badge tone="brand">refreshing | stale | failed</Badge>
          </Panel>
        </div>

        <PortfolioTable holdings={holdings} />

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <Panel className="space-y-4 border-black/6 bg-white/84">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              Allocation notes
            </p>
            <div className="space-y-4">
              {holdings.map((holding) => (
                <div key={holding.id} className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {holding.symbol}
                      </p>
                      <p className="text-sm text-slate-500">{holding.company}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-950">
                      {holding.allocation}%
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#ece6dc]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand to-brand-strong"
                      style={{ width: `${holding.allocation}%` }}
                    />
                  </div>
                  <p className="text-sm leading-7 text-slate-600">{holding.thesis}</p>
                </div>
              ))}
            </div>
          </Panel>
          <Panel className="space-y-4 border-black/6 bg-white/84">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand">
              Insight summary
            </p>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
      <p className="text-sm uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function SourceRow({
  label,
  detail,
  status,
}: {
  label: string;
  detail: string;
  status: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-black/6 bg-[#fffdf9] p-4">
      <div>
        <p className="text-sm font-semibold text-slate-950">{label}</p>
        <p className="mt-1 text-sm text-slate-500">{detail}</p>
      </div>
      <Badge tone="neutral">{status}</Badge>
    </div>
  );
}
