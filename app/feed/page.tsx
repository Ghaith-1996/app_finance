import Link from "next/link";

import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

import { AppShell } from "@/components/app/app-shell";
import { FeedView } from "@/components/app/feed-view";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import {
  getPortfolioInsights,
  getPortfolioOverview,
  getUserPortfolios,
} from "@/lib/actions/portfolio";
import type { PortfolioInsight } from "@/lib/types";
import { formatCurrency, formatPercent, formatPrice } from "@/lib/utils";

function parseCoverageCount(coverage: string): number {
  const m = coverage.match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Visual fill for “analysis pulse” bar from human-readable time labels. */
function analysisPulseFill(lastAnalyzedAt: string): number {
  if (lastAnalyzedAt === "Never") return 12;
  if (lastAnalyzedAt.includes("Just now")) return 98;
  if (lastAnalyzedAt.includes("minute")) return 90;
  const h = lastAnalyzedAt.match(/(\d+)\s*hours?/);
  if (h) return Math.max(38, 88 - Number(h[1]) * 9);
  const d = lastAnalyzedAt.match(/(\d+)\s*days?/);
  if (d) return Math.max(18, 55 - Number(d[1]) * 10);
  return 55;
}

export default async function FeedPage({
  searchParams,
}: {
  searchParams?: Promise<{ symbol?: string | string[] }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const raw = sp.symbol;
  const initialSymbol =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;

  const { data: portfolios } = await getUserPortfolios();
  const portfolioId = portfolios?.[0]?.id ?? null;

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
    coverage: "0 high-signal stories",
    primaryGoal: "Add a portfolio and run analysis.",
  };
  const portfolioInsights: PortfolioInsight[] = insightsResult?.data ?? [];

  const storyCount = parseCoverageCount(portfolioOverview.coverage);
  const dayPct = portfolioOverview.dayChange;
  const dayDollar = Math.round(
    portfolioOverview.totalValue * (dayPct / 100) * 100,
  ) / 100;
  const pulsePct = analysisPulseFill(portfolioOverview.lastAnalyzedAt);

  return (
    <AppShell
      eyebrow="Daily brief"
      title="A personalized news feed built around what you own."
      description="Leveraging compound analysis to distill 14,000+ daily data points into your critical performance drivers."
      activePath="/feed"
      mainClassName="bg-[#f0f1f4]"
      actions={
        <>
          <Link
            href={portfolioId ? `/analysis?portfolioId=${portfolioId}` : "/analysis"}
            className={buttonStyles({ variant: "ghost", className: "text-slate-600" })}
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
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel className="space-y-3 rounded-2xl border-black/[0.06] bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Intelligence coverage
            </p>
            <p className="text-3xl font-semibold tracking-tight text-slate-950">
              {storyCount}
            </p>
            <p className="text-sm text-slate-500">high-signal stories today</p>
            <div className="pt-1">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Feed ready
              </span>
            </div>
          </Panel>

          <div className="flex flex-col justify-between rounded-2xl border border-black/[0.06] bg-[#0d1117] p-6 text-white shadow-[0_24px_60px_rgba(13,17,23,0.35)]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Active portfolio value
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {formatPrice(portfolioOverview.totalValue)}
              </p>
            </div>
            <div
              className={`mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold ${
                dayPct < 0
                  ? "text-rose-400"
                  : dayPct > 0
                    ? "text-emerald-400"
                    : "text-slate-400"
              }`}
            >
              {dayPct < 0 ? (
                <TrendingDown className="h-4 w-4 shrink-0" />
              ) : dayPct > 0 ? (
                <TrendingUp className="h-4 w-4 shrink-0" />
              ) : null}
              <span>
                {formatPercent(dayPct)} ({formatCurrency(Math.abs(dayDollar))})
              </span>
            </div>
          </div>

          <Panel className="space-y-3 rounded-2xl border-black/[0.06] bg-white p-6 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Analysis pulse
            </p>
            <p className="text-3xl font-semibold tracking-tight text-slate-950">
              {portfolioOverview.lastAnalyzedAt}
            </p>
            <p className="text-sm text-slate-500">Compound analysis refreshed</p>
            <div className="pt-2">
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-[#17b67a] transition-[width] duration-500"
                  style={{ width: `${pulsePct}%` }}
                />
              </div>
            </div>
          </Panel>
        </div>

        <FeedView
          portfolioId={portfolioId}
          insights={portfolioInsights}
          initialSymbol={initialSymbol}
        />
      </div>
    </AppShell>
  );
}
