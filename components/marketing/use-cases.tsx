"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Link from "next/link";

import { ArrowRight, MessageSquare, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { useCases } from "@/lib/mock-data";
import type { UseCase } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ──────────────────────────────────────────────────────────────────────
   UseCases – landing-page marketing section
   ────────────────────────────────────────────────────────────────────── */

export function UseCases() {
  const [activeId, setActiveId] = useState<string>(useCases[0]!.id);
  const [inView, setInView] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const hasAutoAdvanced = useRef(false);

  /* ── IntersectionObserver: activate section when 20% visible ── */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* ── Optional auto-advance: cycle once on first view ── */
  useEffect(() => {
    if (!inView || hasAutoAdvanced.current) return;
    hasAutoAdvanced.current = true;
    let step = 0;
    const timer = setInterval(() => {
      step += 1;
      if (step >= useCases.length) {
        clearInterval(timer);
        return;
      }
      setActiveId(useCases[step]!.id);
    }, 4000);
    return () => clearInterval(timer);
  }, [inView]);

  const activeCase = useCases.find((uc) => uc.id === activeId) ?? useCases[0]!;

  return (
    <section
      id="use-cases"
      ref={sectionRef}
      className="px-6 py-20 lg:px-8"
    >
      <div className="mx-auto max-w-7xl space-y-12">
        {/* Heading – fades up on enter */}
        <div className={inView ? "uc-animate-fade-up" : "opacity-0"}>
          <SectionHeading
            eyebrow="Use cases"
            title="See how it works in your daily investing routine"
            description="Real moments where a portfolio-aware feed, AI analysis, and personal context turn market noise into clear next steps."
          />
        </div>

        {/* ── Desktop: 2-column layout ── */}
        <div className="hidden gap-8 lg:grid lg:grid-cols-[0.42fr_0.58fr]">
          {/* Left – use-case cards */}
          <div className="grid content-start gap-4">
            {useCases.map((uc, i) => (
              <UseCaseCard
                key={uc.id}
                useCase={uc}
                isActive={uc.id === activeId}
                onActivate={() => setActiveId(uc.id)}
                inView={inView}
                index={i}
              />
            ))}
          </div>

          {/* Right – animated preview stage */}
          <PreviewStage
            activeCase={activeCase}
            inView={inView}
          />
        </div>

        {/* ── Mobile: stacked cards with inline preview ── */}
        <div className="grid gap-8 lg:hidden">
          {useCases.map((uc, i) => (
            <div key={uc.id} className="space-y-4">
              <UseCaseCard
                useCase={uc}
                isActive={true}
                onActivate={() => {}}
                inView={inView}
                index={i}
              />
              <PreviewStage activeCase={uc} inView={inView} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   UseCaseCard – left-side narrative card
   ────────────────────────────────────────────────────────────────────── */

function UseCaseCard({
  useCase,
  isActive,
  onActivate,
  inView,
  index,
}: {
  useCase: UseCase;
  isActive: boolean;
  onActivate: () => void;
  inView: boolean;
  index: number;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      onMouseEnter={onActivate}
      aria-pressed={isActive}
      className={cn(
        "group w-full text-left transition-all duration-300",
        inView ? "uc-animate-slide-in" : "opacity-0",
      )}
      style={{ animationDelay: `${index * 120}ms` }}
    >
      <Panel
        className={cn(
          "space-y-4 p-5 transition-all duration-300",
          isActive
            ? "border-brand/25 bg-brand/[0.04] shadow-[0_0_24px_rgba(16,185,129,0.06)]"
            : "hover:border-white/10",
        )}
      >
        <div className="flex items-center gap-3">
          <Badge tone={isActive ? "brand" : "neutral"}>
            {useCase.moment}
          </Badge>
        </div>
        <h3 className="text-lg font-semibold text-white">
          {useCase.headline}
        </h3>
        <p className="text-sm leading-7 text-slate-400">
          {useCase.summary}
        </p>

        {/* Proof points */}
        <div className="flex flex-wrap gap-2">
          {useCase.proofPoints.map((pt) => (
            <span
              key={pt}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400"
            >
              {pt}
            </span>
          ))}
        </div>

        {/* CTA */}
        {isActive && (
          <Link
            href={useCase.ctaHref}
            className={buttonStyles({
              variant: "secondary",
              className: "mt-1 text-xs",
            })}
            onClick={(e) => e.stopPropagation()}
          >
            {useCase.ctaLabel}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        )}
      </Panel>
    </button>
  );
}

/* ──────────────────────────────────────────────────────────────────────
   PreviewStage – the animated mock product frame
   ────────────────────────────────────────────────────────────────────── */

function PreviewStage({
  activeCase,
  inView,
}: {
  activeCase: UseCase;
  inView: boolean;
}) {
  const p = activeCase.preview;

  return (
    <Panel
      glow
      className={cn(
        "relative overflow-hidden p-0 transition-opacity duration-500",
        inView ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.06),transparent_40%)]" />

      {/* key forces a fresh mount → CSS animations replay on case change */}
      <div
        key={activeCase.id}
        className="relative grid gap-5 p-6 uc-animate-crossfade"
      >
        {/* ── Portfolio value header ── */}
        {p.portfolioValue && (
          <div className="flex items-end justify-between uc-animate-count">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Portfolio value
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
                {p.portfolioValue}
              </p>
            </div>
            {p.portfolioChange && (
              <Badge tone="success">{p.portfolioChange} today</Badge>
            )}
          </div>
        )}

        {/* ── Holdings list ── */}
        {p.holdings.length > 0 && (
          <div className="space-y-2">
            {p.holdings.map((h, i) => (
              <div
                key={h.symbol}
                className={cn(
                  "flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 uc-animate-slide-in",
                  h.highlight && "uc-animate-glow",
                )}
                style={{ animationDelay: `${200 + i * 100}ms` }}
              >
                <div>
                  <p className="text-sm font-semibold text-white">{h.symbol}</p>
                  <p className="text-xs text-slate-500">{h.company}</p>
                </div>
                <p
                  className={cn(
                    "text-sm font-semibold",
                    h.change >= 0 ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {h.change > 0 ? "+" : ""}
                  {h.change.toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Story cards (Morning Brief / Story Chat) ── */}
        {p.stories.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Top stories
            </p>
            {p.stories.map((s, i) => (
              <div
                key={s.headline}
                className="flex items-start justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 uc-animate-slide-in"
                style={{ animationDelay: `${400 + i * 120}ms` }}
              >
                <div>
                  <p className="text-sm font-semibold leading-snug text-white">
                    {s.headline}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{s.source}</p>
                </div>
                <Badge tone="brand" className="shrink-0 text-[10px]">
                  {s.relevance}%
                </Badge>
              </div>
            ))}
          </div>
        )}

        {/* ── Prompt chip + AI answer (Why Am I Moving) ── */}
        {p.prompt && (
          <div className="space-y-3">
            <div
              className="flex items-center gap-2 rounded-xl border border-brand/20 bg-brand/[0.06] px-4 py-3 uc-animate-slide-in"
              style={{ animationDelay: "300ms" }}
            >
              <Sparkles className="h-4 w-4 shrink-0 text-brand" />
              <p className="text-sm font-medium text-white">{p.prompt}</p>
            </div>
            {p.answer && (
              <div
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4 uc-animate-type"
                style={{ animationDelay: "600ms" }}
              >
                <p className="text-sm leading-7 text-slate-300">{p.answer}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Chat bubbles (Story Chat) ── */}
        {p.chatBubbles && p.chatBubbles.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <MessageSquare className="h-3.5 w-3.5" />
              Story chat
            </div>
            {p.chatBubbles.map((b, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[85%] rounded-xl px-4 py-3 text-sm leading-6 uc-animate-slide-in",
                  b.role === "user"
                    ? "ml-auto border border-brand/20 bg-brand/[0.06] text-white"
                    : "border border-white/[0.06] bg-white/[0.03] text-slate-300",
                )}
                style={{ animationDelay: `${700 + i * 350}ms` }}
              >
                {b.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
