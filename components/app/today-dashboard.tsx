import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  Gauge,
  History,
  LineChart,
  Newspaper,
  Radio,
  Sparkles,
  WalletCards,
} from "lucide-react";

import type { HomeDashboardData } from "@/lib/server/page-loaders";
import type { PortfolioHealthTone } from "@/lib/services/portfolio-health";
import { categoryLabel, cn, formatCurrency, formatPercent } from "@/lib/utils";

function toneClasses(tone: PortfolioHealthTone) {
  switch (tone) {
    case "good":
      return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
    case "watch":
      return "border-amber-400/20 bg-amber-400/10 text-amber-300";
    case "risk":
      return "border-red-400/20 bg-red-400/10 text-red-300";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function toneDot(tone: PortfolioHealthTone) {
  switch (tone) {
    case "good":
      return "bg-emerald-300";
    case "watch":
      return "bg-amber-300";
    case "risk":
      return "bg-red-300";
    default:
      return "bg-slate-400";
  }
}

function healthColor(score: number) {
  if (score >= 85) return "#34d399";
  if (score >= 70) return "#10b981";
  if (score >= 55) return "#f59e0b";
  return "#f87171";
}

function formatReportDate(value: string | null) {
  if (!value) return "Latest report";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Latest report";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function TodayDashboard({ data }: { data: HomeDashboardData }) {
  const score = data.health.score;
  const scoreStyle = {
    background: `conic-gradient(${healthColor(score)} ${score * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
  } satisfies CSSProperties;
  const digestEnabled =
    data.notifications.emailDigestEnabled || data.notifications.smsDigestEnabled;
  const primaryStory = data.topStories[0] ?? null;
  const primaryInsight = data.insights[0] ?? null;

  if (!data.portfolioId) {
    return (
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6 sm:p-8">
          <div className="flex items-center gap-3 text-brand">
            <WalletCards className="h-5 w-5" />
            <p className="text-xs font-bold uppercase tracking-[0.22em]">
              Today Dashboard
            </p>
          </div>
          <h2 className="mt-5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Build your first portfolio brief
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
            Add holdings to unlock the health score, matched news, earnings links,
            and daily digest controls.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-[#080c11] transition hover:bg-brand-strong"
            >
              Start onboarding
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/10"
            >
              View demo
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
            Market coverage
          </p>
          <p className="mt-4 text-4xl font-bold tracking-tight text-white">
            {data.marketStoryCount24h}
          </p>
          <p className="mt-2 text-sm text-slate-400">stories in the last 24 hours</p>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-raised">
          <div className="grid gap-0 lg:grid-cols-[1fr_260px]">
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-lg border border-brand/20 bg-brand/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-brand">
                  <Radio className="h-3.5 w-3.5" />
                  Today
                </span>
                <span className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {data.portfolioName}
                </span>
              </div>

              <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_190px]">
                <div>
                  <p className="text-sm font-medium text-slate-400">Portfolio value</p>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <p className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
                      {formatCurrency(data.overview.totalValue)}
                    </p>
                    <span
                      className={cn(
                        "mb-1 rounded-lg px-2.5 py-1 text-sm font-bold",
                        data.overview.dayChange >= 0
                          ? "bg-emerald-400/10 text-emerald-300"
                          : "bg-red-400/10 text-red-300",
                      )}
                    >
                      {formatPercent(data.overview.dayChange)}
                    </span>
                  </div>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-slate-400">
                    {primaryInsight?.detail ||
                      primaryStory?.whyItMatters ||
                      data.overview.primaryGoal}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                  <Metric label="Matched" value={String(data.matchedStoryCount24h)} detail="24h stories" />
                  <Metric label="Market" value={String(data.marketStoryCount24h)} detail="24h pool" />
                </div>
              </div>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/feed"
                  className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-[#080c11] transition hover:bg-brand-strong"
                >
                  Open feed
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/analysis"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/10"
                >
                  Run analysis
                </Link>
                <Link
                  href="/portfolio/full"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-200 transition hover:bg-white/10"
                >
                  Full portfolio
                </Link>
              </div>
            </div>

            <div className="border-t border-white/[0.06] bg-white/[0.02] p-6 sm:p-8 lg:border-l lg:border-t-0">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                Alert readiness
              </p>
              <div className="mt-5 space-y-3">
                <ReadinessRow
                  icon={Bell}
                  label="Daily digest"
                  value={digestEnabled ? "On" : "Off"}
                  tone={digestEnabled ? "good" : "watch"}
                  href="/settings"
                />
                <ReadinessRow
                  icon={AlertTriangle}
                  label="Smart alerts"
                  value={`${data.notifications.smartAlertRuleCount} armed`}
                  tone={
                    data.notifications.smartAlertRuleCount > 0 ? "good" : "watch"
                  }
                  href="/alerts"
                />
                <ReadinessRow
                  icon={CalendarDays}
                  label="Earnings"
                  value={`${data.earnings.length} linked`}
                  tone={data.earnings.length > 0 ? "good" : "neutral"}
                  href="/portfolio/full"
                />
                <ReadinessRow
                  icon={Newspaper}
                  label="News match"
                  value={`${data.matchedStoryCount24h} active`}
                  tone={data.matchedStoryCount24h > 0 ? "good" : "watch"}
                  href="/feed"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-brand">
                <Gauge className="h-5 w-5" />
                <p className="text-xs font-bold uppercase tracking-[0.22em]">
                  Health Score
                </p>
              </div>
              <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
                {data.health.label}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {data.health.summary}
              </p>
            </div>
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full" style={scoreStyle}>
              <div className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-surface-raised">
                <span className="text-2xl font-bold tracking-tight text-white">{score}</span>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {data.health.factors.slice(0, 6).map((factor) => (
              <div
                key={factor.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    {factor.label}
                  </p>
                  <span className={cn("h-2 w-2 rounded-full", toneDot(factor.tone))} />
                </div>
                <p className="mt-2 text-sm font-bold text-white">{factor.value}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                  {factor.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl border border-brand/20 bg-brand/10 p-3 text-brand">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">
                What changed today
              </h2>
              <p className="text-sm text-slate-500">Portfolio deltas since the last cycle</p>
            </div>
          </div>
          {data.whatChanged.length > 0 ? (
            <div className="space-y-3">
              {data.whatChanged.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-white">{item.title}</p>
                    <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase", toneClasses(item.tone))}>
                      {item.tone}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                    {item.detail}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyMini
              title="No material change"
              detail="The latest cycle did not find a new alert, large move, or fresh digest."
            />
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6 xl:col-span-2">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">
                Portfolio changelog
              </h2>
              <p className="text-sm text-slate-500">Recent background work and generated signals</p>
            </div>
          </div>
          {data.activity.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.activity.map((item) => {
                const content = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-bold text-white">{item.title}</p>
                      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                        {item.type}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                      {item.detail}
                    </p>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                      {formatActivityTime(item.occurredAt)}
                    </p>
                  </>
                );

                if (item.href.startsWith("http")) {
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
                    >
                      {content}
                    </a>
                  );
                }

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
          ) : (
            <EmptyMini
              title="No activity yet"
              detail="Price syncs, analysis runs, digest creation, earnings links, and alerts will appear here."
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SignalPanel
          icon={AlertTriangle}
          title="Risk radar"
          emptyTitle="No urgent risk"
          emptyDetail="Current dashboard signals are not flagging a high-priority risk."
        >
          {data.riskRadar.slice(0, 4).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-white">{item.title}</p>
                <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase", toneClasses(item.tone))}>
                  {item.tone}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
            </Link>
          ))}
        </SignalPanel>

        <SignalPanel
          icon={Sparkles}
          title="Opportunities"
          emptyTitle="No catalyst yet"
          emptyDetail="Run analysis to surface portfolio-specific catalysts."
        >
          {data.health.opportunities.slice(0, 3).map((item) => (
            <Link
              key={`${item.title}-${item.detail}`}
              href={item.href}
              className="block rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
            >
              <p className="text-sm font-bold text-white">{item.title}</p>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-400">
                {item.detail}
              </p>
            </Link>
          ))}
        </SignalPanel>

        <SignalPanel
          icon={CalendarDays}
          title="Earnings"
          emptyTitle="No reports linked"
          emptyDetail="The earnings sync has not attached report links for this portfolio yet."
        >
          {data.earnings.map((item) => (
            <a
              key={`${item.symbol}-${item.href}`}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-white">{item.symbol}</p>
                <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase text-brand">
                  {item.source ?? "report"}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{item.title}</p>
              <p className="mt-1 text-xs text-slate-500">{formatReportDate(item.reportDate)}</p>
            </a>
          ))}
        </SignalPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl border border-brand/20 bg-brand/10 p-3 text-brand">
              <DatabaseZap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                Data freshness
              </p>
              <p className="text-sm text-slate-400">Prices, news, analysis, snapshots, and alerts</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {data.freshness.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-white">{item.label}</p>
                  <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase", toneClasses(item.tone))}>
                    {item.tone}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-300">{item.value}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300">
              <History className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                Portfolio timeline
              </p>
              <p className="text-sm text-slate-400">Alerts, thesis edits, saves, analysis, and syncs</p>
            </div>
          </div>

          {data.timeline.length > 0 ? (
            <div className="space-y-3">
              {data.timeline.slice(0, 5).map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-white">{item.title}</p>
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                      {item.type}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                    {item.detail}
                  </p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
                    {formatActivityTime(item.occurredAt)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyMini
              title="No timeline yet"
              detail="Timeline events will appear after syncs, thesis edits, saved articles, alerts, or analysis runs."
            />
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-amber-300">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                  Recent alerts
                </p>
                <p className="text-sm text-slate-400">Generated from your smart rules</p>
              </div>
            </div>
            <Link href="/alerts" className="text-sm font-bold text-brand hover:text-brand-strong">
              All alerts
            </Link>
          </div>

          {data.recentAlerts.length > 0 ? (
            <div className="mt-5 space-y-3">
              {data.recentAlerts.slice(0, 3).map((alert) => (
                <Link
                  key={alert.id}
                  href={alert.actionHref}
                  className="block rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-white">{alert.title}</p>
                    <span
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase",
                        alert.severity === "high"
                          ? toneClasses("risk")
                          : alert.severity === "medium"
                            ? toneClasses("watch")
                            : toneClasses("neutral"),
                      )}
                    >
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">
                    {alert.message}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyMini
              title="No alerts yet"
              detail="Saved smart rules will create deduplicated alerts here after the cron runs."
            />
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-brand/20 bg-brand/10 p-3 text-brand">
                <Newspaper className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                  Top story
                </p>
                <p className="text-sm text-slate-400">Highest ranked portfolio match</p>
              </div>
            </div>
            <Link href="/feed" className="text-sm font-bold text-brand hover:text-brand-strong">
              Feed
            </Link>
          </div>

          {primaryStory ? (
            <Link href="/feed" className="mt-5 block">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  {categoryLabel(primaryStory.category)}
                </span>
                {primaryStory.relevanceScore > 0 ? (
                  <span className="rounded-md bg-brand/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-brand">
                    {Math.round(primaryStory.relevanceScore)}% match
                  </span>
                ) : null}
              </div>
              <h3 className="mt-4 text-lg font-bold leading-snug text-white hover:text-brand">
                {primaryStory.headline}
              </h3>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">
                {primaryStory.whyItMatters || primaryStory.aiSummary}
              </p>
            </Link>
          ) : (
            <EmptyMini title="No matched story" detail="Run analysis to populate today's top story." />
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300">
                <LineChart className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                  Daily digest
                </p>
                <p className="text-sm text-slate-400">
                  {digestEnabled ? "Delivery enabled" : "Delivery disabled"}
                </p>
              </div>
            </div>
            <Link href="/settings" className="text-sm font-bold text-brand hover:text-brand-strong">
              Settings
            </Link>
          </div>

          {data.latestDigest ? (
            <Link href={`/digest/${data.latestDigest.id}`} className="mt-5 block rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 transition hover:bg-white/[0.06]">
              <p className="text-sm font-bold text-white">
                {formatReportDate(data.latestDigest.digestDate)}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {data.latestDigest.summaryLine}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                <span>{data.latestDigest.storyCount} stories</span>
                <span>{data.latestDigest.bullishSymbols.length} bullish</span>
                <span>{data.latestDigest.bearishSymbols.length} bearish</span>
              </div>
            </Link>
          ) : (
            <EmptyMini
              title="No digest yet"
              detail="The next 9 AM ET digest will appear here after it is generated."
            />
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function ReadinessRow({
  icon: Icon,
  label,
  value,
  tone,
  href,
}: {
  icon: typeof Bell;
  label: string;
  value: string;
  tone: PortfolioHealthTone;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition hover:bg-white/[0.06]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className={cn("rounded-lg border p-2", toneClasses(tone))}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-bold text-white">{label}</span>
          <span className="block text-xs text-slate-500">{value}</span>
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" />
    </Link>
  );
}

function SignalPanel({
  icon: Icon,
  title,
  emptyTitle,
  emptyDetail,
  children,
}: {
  icon: typeof AlertTriangle;
  title: string;
  emptyTitle: string;
  emptyDetail: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.some(Boolean)
    : Boolean(children);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-surface-raised p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-300">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-bold tracking-tight text-white">{title}</h2>
      </div>
      <div className="space-y-3">
        {hasChildren ? children : <EmptyMini title={emptyTitle} detail={emptyDetail} />}
      </div>
    </div>
  );
}

function EmptyMini({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-slate-300">
        <CheckCircle2 className="h-4 w-4" />
        <p className="text-sm font-bold">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p>
    </div>
  );
}
