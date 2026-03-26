import Link from "next/link";
import { Suspense, use } from "react";

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
import { loadFreshOverviewAfterPriceSync } from "@/lib/server/portfolio-refresh-loaders";
import type { PortfolioInsight } from "@/lib/types";
import { formatCurrency, formatPercent, formatPrice } from "@/lib/utils";

const FEED_OVERVIEW_FALLBACK = {
  totalValue: 0,
  dayChange: 0,
  monthlyChange: 0,
  lastSyncedAt: "—",
  lastAnalyzedAt: "Never",
  coverage: "0 high-signal stories",
  primaryGoal: "Add a portfolio and run analysis.",
};

function parseCoverageCount(coverage: string): number {
  const m = coverage.match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}

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

  const portfolioOverview = overviewResult?.data ?? FEED_OVERVIEW_FALLBACK;
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
      actions={
        <>
          <Link href="/portfolio" className={buttonStyles({ size: "lg" })}>
            View portfolio
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </>
      }
    >
      <div className="space-y-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Panel className="space-y-3 rounded-2xl p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Intelligence coverage
            </p>
            <p className="text-3xl font-semibold tracking-tight text-white">
              {storyCount}
            </p>
            <p className="text-sm text-slate-500">high-signal stories today</p>
            <div className="pt-1">
              <span className="inline-flex items-center gap-2 rounded-lg border border-brand/25 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                <span className="h-2 w-2 rounded-full bg-brand" />
                Feed ready
              </span>
            </div>
          </Panel>

          <Suspense fallback={<ActivePortfolioValueCardFallback />}>
            <RefreshedActivePortfolioValueCard portfolioId={portfolioId} />
          </Suspense>

          <Panel className="space-y-3 rounded-2xl p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Analysis pulse
            </p>
            <p className="text-3xl font-semibold tracking-tight text-white">
              {portfolioOverview.lastAnalyzedAt}
            </p>
            <p className="text-sm text-slate-500">Auto-updated every 20 min</p>
            <div className="pt-2">
              <div className="h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-500"
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

function RefreshedActivePortfolioValueCard({
  portfolioId,
}: {
  portfolioId: string | null;
}) {
  if (!portfolioId) {
    return <ActivePortfolioValueCard overview={FEED_OVERVIEW_FALLBACK} loading={false} />;
  }

  const freshOverview =
    use(loadFreshOverviewAfterPriceSync(portfolioId)).data ?? FEED_OVERVIEW_FALLBACK;

  return <ActivePortfolioValueCard overview={freshOverview} loading={false} />;
}

function ActivePortfolioValueCardFallback() {
  return <ActivePortfolioValueCard overview={FEED_OVERVIEW_FALLBACK} loading />;
}

function ActivePortfolioValueCard({
  overview,
  loading,
}: {
  overview: { totalValue: number; dayChange: number };
  loading: boolean;
}) {
  const dayPct = overview.dayChange;
  const dayDollar = Math.round(overview.totalValue * (dayPct / 100) * 100) / 100;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          Active portfolio value
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-white">
          {formatPrice(overview.totalValue)}
        </p>
      </div>
      <div
        className={`mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold ${
          dayPct < 0 ? "text-red-400" : dayPct > 0 ? "text-emerald-400" : "text-slate-500"
        }`}
      >
        {dayPct < 0 ? (
          <TrendingDown className="h-4 w-4 shrink-0" />
        ) : dayPct > 0 ? (
          <TrendingUp className="h-4 w-4 shrink-0" />
        ) : null}
        <span>
          {loading
            ? "Refreshing portfolio value..."
            : `${formatPercent(dayPct)} (${formatCurrency(Math.abs(dayDollar))})`}
        </span>
      </div>
    </div>
  );
}
