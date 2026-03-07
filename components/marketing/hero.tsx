import Link from "next/link";

import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CircleHelp,
  Globe2,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { holdings, newsFeed, siteStats, sourceTags } from "@/lib/mock-data";
import { formatPercent } from "@/lib/utils";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pb-20 pt-16 lg:px-8 lg:pb-28 lg:pt-24">
      <div className="absolute inset-x-0 top-0 -z-10 h-full bg-[radial-gradient(circle_at_top_left,rgba(23,182,122,0.08),transparent_26%),linear-gradient(180deg,#ffffff_0%,#ffffff_100%)]" />
      <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div className="space-y-8">
          <Badge tone="brand" className="border-brand/20 bg-brand/10 text-brand">
            Personalized investing intelligence
          </Badge>
          <div className="space-y-6">
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl lg:text-7xl">
              <span className="italic">Own</span> your portfolio context.
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600 sm:text-xl">
              Link a brokerage account or create a portfolio manually, then open
              a daily brief built around the holdings you actually own.
            </p>
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href="/onboarding"
              className={buttonStyles({ size: "lg" })}
            >
              Get started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="/feed"
              className={buttonStyles({
                variant: "secondary",
                size: "lg",
                className:
                  "border-black/10 bg-white/75 text-slate-950 hover:bg-white hover:border-black/15",
              })}
            >
              Preview the feed
            </Link>
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/70 px-4 py-2">
              <TrendingUp className="h-4 w-4 text-brand" />
              Track everything
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/70 px-4 py-2">
              <CircleHelp className="h-4 w-4 text-brand" />
              Ask what changed
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/70 px-4 py-2">
              <Sparkles className="h-4 w-4 text-brand" />
              Get a daily recap
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {siteStats.map((stat) => (
              <Panel
                key={stat.label}
                className="space-y-2 border-black/6 bg-white/80 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
              >
                <p className="text-2xl font-semibold text-slate-950">{stat.value}</p>
                <p className="text-sm font-medium text-slate-800">{stat.label}</p>
                <p className="text-sm leading-6 text-slate-500">{stat.hint}</p>
              </Panel>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-sm text-slate-500">
            {sourceTags.map((source) => (
              <span
                key={source.name}
                className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white/70 px-3 py-2"
              >
                <Globe2 className="h-4 w-4 text-brand" />
                {source.name}
                <span className="text-slate-600">{source.category}</span>
              </span>
            ))}
          </div>
        </div>
        <Panel
          glow
          className="relative overflow-hidden border-black/6 bg-white/75 p-0 shadow-[0_32px_90px_rgba(15,23,42,0.12)]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(23,182,122,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.08),transparent_32%)]" />
          <div className="relative grid gap-4 p-6">
            <div className="grid gap-4 sm:grid-cols-[0.95fr_1.05fr]">
              <Panel className="space-y-5 border-black/6 bg-[#fffdf9] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-500">Portfolio home</p>
                    <p className="text-lg font-semibold text-slate-950">
                      Growth + resilience mix
                    </p>
                  </div>
                  <Badge tone="success">
                    <Activity className="h-3.5 w-3.5" />
                    In sync
                  </Badge>
                </div>
                <div className="space-y-3">
                  {holdings.slice(0, 4).map((holding) => (
                    <div
                      key={holding.id}
                      className="flex items-center justify-between rounded-2xl border border-black/6 bg-[#f6f2ea] px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {holding.symbol}
                        </p>
                        <p className="text-sm text-slate-500">{holding.company}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-950">
                          {holding.allocation}%
                        </p>
                        <p
                          className={
                            holding.dailyChange >= 0
                              ? "text-sm text-emerald-700"
                              : "text-sm text-rose-600"
                          }
                        >
                          {formatPercent(holding.dailyChange)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
              <div className="grid gap-4">
                <Panel className="space-y-4 border-black/6 bg-[#fffdf9] p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-slate-500">AI advisor</p>
                      <p className="text-lg font-semibold text-slate-950">
                        Ask what changed today
                      </p>
                    </div>
                    <div className="rounded-2xl bg-brand/10 p-3 text-brand">
                      <BrainCircuit className="h-5 w-5" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-black/6 bg-[#f6f2ea] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Prompt
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-950">
                      Why is my portfolio moving more than the market today?
                    </p>
                  </div>
                  <div className="rounded-2xl border border-black/6 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Answer
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Your biggest weights in NVIDIA and Microsoft are reacting to
                      stronger AI infrastructure headlines and rising rate
                      expectations at the same time.
                    </p>
                  </div>
                </Panel>
                <Panel className="space-y-4 border-black/6 bg-[#172033] p-5 shadow-[0_20px_40px_rgba(15,23,42,0.1)]">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-slate-400">Daily brief</p>
                      <p className="text-lg font-semibold text-white">
                        The feed starts with what matters
                      </p>
                    </div>
                    <Badge tone="brand">{newsFeed[0]?.relevanceScore}% match</Badge>
                  </div>
                  <div className="space-y-3">
                    {newsFeed.slice(0, 2).map((story) => (
                      <div
                        key={story.id}
                        className="rounded-2xl border border-white/8 bg-white/6 p-4"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">
                            {story.publishedAt}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold leading-6 text-white">
                          {story.headline}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {story.aiSummary}
                        </p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
            <Panel className="flex flex-col gap-4 border-black/6 bg-white/85 p-5 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl border border-brand/20 bg-brand/10 p-3 text-brand">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    A calmer, more personal entry point into finance
                  </p>
                  <p className="text-sm leading-6 text-slate-600">
                    The marketing layer now feels closer to an all-in-one
                    financial home, while the product preview still shows the
                    portfolio-aware intelligence underneath.
                  </p>
                </div>
              </div>
              <Link
                href="/analysis"
                className={buttonStyles({
                  variant: "secondary",
                  className:
                    "border-black/10 bg-[#f6f2ea] text-slate-950 hover:bg-white hover:border-black/15",
                })}
              >
                See analysis state
              </Link>
            </Panel>
          </div>
        </Panel>
      </div>
    </section>
  );
}
