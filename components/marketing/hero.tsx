import Link from "next/link";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { Brain } from "@phosphor-icons/react/dist/ssr/Brain";
import { Newspaper } from "@phosphor-icons/react/dist/ssr/Newspaper";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";

import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { holdings, newsFeed, sourceTags } from "@/lib/mock-data";
import { cn, formatPercent } from "@/lib/utils";

export function Hero() {
  const story = newsFeed[0];

  return (
    <section className="px-4 pb-24 pt-16 sm:px-6 lg:px-8 lg:pt-24">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center text-center">
          <h1 className="hero-heading max-w-[680px] text-4xl font-semibold tracking-tight sm:text-5xl">
            Know which headlines
            {" "}<br className="hidden sm:inline" />
            move the stocks you own
          </h1>
          <p className="mt-6 max-w-[680px] text-lg text-secondary sm:text-xl">
            Import a broker CSV or add positions by hand. Pulsefolio ranks every story against your
            holdings and tells you why it matters before you open a single tab.
          </p>
          <Link href="/onboarding" className={buttonStyles({ size: "lg", className: "mt-8" })}>
            Start free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <p className="mt-4 text-sm text-muted">
            <ShieldCheck className="mr-2 inline h-4 w-4 align-text-bottom text-brand" aria-hidden="true" />
            Free plan, no card needed. Read only, it never places trades.
          </p>
        </div>

        <div className="mt-16 grid gap-2 rounded-3xl border border-subtle bg-surface p-2 lg:grid-cols-[0.9fr_1.1fr]">
          <Panel className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-primary">Your holdings</p>
              <p className="text-xs text-muted">Today</p>
            </div>
            <ul className="mt-4 divide-y divide-[var(--border-subtle)]">
              {holdings.slice(0, 5).map((holding) => (
                <li key={holding.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-mono text-sm font-semibold text-primary">{holding.symbol}</p>
                    <p className="text-sm text-muted">{holding.company}</p>
                  </div>
                  <div className="text-right font-mono text-sm">
                    <p className="text-primary">{holding.allocation}%</p>
                    <p className={cn(holding.dailyChange >= 0 ? "text-positive" : "text-negative")}>
                      {formatPercent(holding.dailyChange)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
          <div className="grid gap-2">
            <Panel className="p-6">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Brain className="h-4 w-4 text-brand" aria-hidden="true" />
                Ask what changed
              </p>
              <p className="mt-4 rounded-xl bg-surface-soft px-4 py-3 text-sm text-primary">
                Why is my portfolio moving more than the market today?
              </p>
              <p className="mt-3 text-sm text-secondary">
                Your largest weights in NVIDIA and Microsoft are reacting to stronger AI infrastructure
                headlines and rising rate expectations at the same time.
              </p>
            </Panel>
            {story ? (
              <Panel className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <Newspaper className="h-4 w-4 text-brand" aria-hidden="true" />
                    Top of your brief
                  </p>
                  <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                    {story.relevanceScore}% match
                  </span>
                </div>
                <p className="mt-4 font-semibold text-primary">{story.headline}</p>
                <p className="mt-2 text-sm text-secondary">{story.aiSummary}</p>
              </Panel>
            ) : null}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-muted">
          <span>Stories from</span>
          {sourceTags.map((source) => (
            <span key={source.name} className="font-semibold text-secondary">
              {source.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
