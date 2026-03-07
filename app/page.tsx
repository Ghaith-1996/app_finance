import Link from "next/link";

import {
  ArrowRight,
  CheckCircle2,
  Newspaper,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";

import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { SiteHeader } from "@/components/marketing/site-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import {
  faqs,
  painPoints,
  portfolioInsights,
  productFeatures,
  testimonials,
} from "@/lib/mock-data";

const featureIcons = [WalletCards, Sparkles, Newspaper];

const updateCards = [
  {
    eyebrow: "Daily recap",
    title: "A morning brief shaped by the portfolio",
    description:
      "Summaries focus on what changed, what matters, and which positions deserve a second look before the user even opens the feed.",
  },
  {
    eyebrow: "AI context",
    title: "Questions become portfolio-aware answers",
    description:
      "Users can ask why their account moved, which sectors are under pressure, or what story matters most today without jumping between tools.",
  },
  {
    eyebrow: "News coverage",
    title: "Global sources filtered through personal relevance",
    description:
      "Yahoo Finance, Reuters, the New York Times, and macro sources become more useful once they are ranked against actual holdings.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-slate-950">
      <SiteHeader />
      <main className="relative">
        <div className="absolute inset-x-0 top-0 -z-10 h-[900px] bg-[radial-gradient(circle_at_top_left,rgba(23,182,122,0.08),transparent_28%),linear-gradient(180deg,#ffffff_0%,#ffffff_100%)]" />
        <Hero />
        <ProblemSection />
        <PlatformSection />
        <HowItWorks />
        <ProofSection />
        <FaqSection />
        <FinalCallToAction />
      </main>
      <footer className="border-t border-black/6 px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <p>PortfolioSignal frontend MVP for portfolio-aware finance workflows.</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/onboarding" className="transition hover:text-slate-950">
              Onboarding
            </Link>
            <Link href="/feed" className="transition hover:text-slate-950">
              Feed demo
            </Link>
            <Link href="/portfolio" className="transition hover:text-slate-950">
              Portfolio
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ProblemSection() {
  return (
    <section className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-12">
        <SectionHeading
          eyebrow="Why this product exists"
          title="Financial products feel smarter when they remember what the user owns"
          description="This first pass keeps the finance workflow approachable: one place to connect a portfolio, understand what changed, and open a feed that already knows what matters."
          theme="light"
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {painPoints.map((painPoint) => (
            <Panel
              key={painPoint.title}
              className="space-y-4 border-black/6 bg-white/75 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
            >
              <div className="inline-flex rounded-2xl border border-brand/15 bg-brand/10 p-3 text-brand">
                <NotebookPen className="h-5 w-5" />
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-slate-950">
                  {painPoint.title}
                </h3>
                <p className="text-sm leading-7 text-slate-600">
                  {painPoint.description}
                </p>
              </div>
            </Panel>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlatformSection() {
  return (
    <section id="platform" className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-12">
        <SectionHeading
          eyebrow="Product walkthrough"
          title="The frontend now reads like an intelligent financial home"
          description="The structure borrows more from consumer-finance storytelling: clean entry points, lighter surfaces, human copy, and product moments that make AI feel useful instead of abstract."
          theme="light"
        />
        <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="grid gap-4">
            {productFeatures.map((feature, index) => {
              const Icon = featureIcons[index] ?? Sparkles;

              return (
                <Panel
                  key={feature.title}
                  className="space-y-5 border-black/6 bg-white/78 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
                >
                  <div className="inline-flex rounded-2xl border border-brand/15 bg-brand/10 p-3 text-brand">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">
                      {feature.eyebrow}
                    </p>
                    <h3 className="text-2xl font-semibold text-slate-950">
                      {feature.title}
                    </h3>
                    <p className="text-sm leading-7 text-slate-600">
                      {feature.description}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {feature.bullets.map((bullet) => (
                      <div
                        key={bullet}
                        className="rounded-2xl border border-black/6 bg-[#f7f2ea] px-4 py-3 text-sm text-slate-600"
                      >
                        {bullet}
                      </div>
                    ))}
                  </div>
                </Panel>
              );
            })}
          </div>
          <div className="grid gap-4">
            <Panel className="space-y-6 border-black/6 bg-[#142033] p-7 shadow-[0_28px_70px_rgba(15,23,42,0.14)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Badge tone="brand" className="border-brand/25 bg-brand/12">
                    Ask anything
                  </Badge>
                  <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white">
                    AI that can answer in portfolio language
                  </h3>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/6 p-3 text-brand">
                  <Sparkles className="h-5 w-5" />
                </div>
              </div>
              <div className="grid gap-3">
                {[
                  "Why is my portfolio down more than the Nasdaq today?",
                  "Which holdings are most sensitive to rising rates right now?",
                  "What are the three stories I should read before the close?",
                ].map((prompt) => (
                  <div
                    key={prompt}
                    className="rounded-2xl border border-white/8 bg-white/6 px-4 py-4 text-sm text-slate-200"
                  >
                    {prompt}
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border border-emerald-400/15 bg-emerald-400/10 p-5">
                <div className="flex items-center gap-3 text-emerald-200">
                  <ShieldCheck className="h-5 w-5" />
                  <p className="text-sm font-semibold uppercase tracking-[0.2em]">
                    Trust story
                  </p>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-100">
                  The current frontend already frames broker connections as
                  read-only and sets up a clean path for secure syncing later.
                </p>
              </div>
            </Panel>
            <div className="grid gap-4 sm:grid-cols-2">
              {portfolioInsights.map((insight) => (
                <Panel
                  key={insight.title}
                  className="space-y-3 border-black/6 bg-white/78 p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
                >
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                    {insight.title}
                  </p>
                  <p className="text-2xl font-semibold text-slate-950">
                    {insight.value}
                  </p>
                  <p className="text-sm leading-7 text-slate-600">
                    {insight.detail}
                  </p>
                </Panel>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProofSection() {
  return (
    <section className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-12">
        <SectionHeading
          eyebrow="What makes it feel current"
          title="The frontend now speaks in a warmer, more personal finance language"
          description="Origin's best cue is tone: direct but reassuring, product-led, and centered on helping people feel more in control of their money."
          align="center"
          theme="light"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {testimonials.map((testimonial) => (
            <Panel
              key={testimonial.name}
              className="space-y-5 border-black/6 bg-white/78 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
            >
              <Badge tone="neutral" className="border-black/8 bg-[#f7f2ea] text-slate-600">
                Product sentiment
              </Badge>
              <p className="text-xl leading-8 text-slate-950">
                “{testimonial.quote}”
              </p>
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-brand" />
                <span>{testimonial.name}</span>
                <span>{testimonial.role}</span>
              </div>
            </Panel>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {updateCards.map((card) => (
            <Panel
              key={card.title}
              className="space-y-4 border-black/6 bg-[#fffdf9] p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand">
                {card.eyebrow}
              </p>
              <h3 className="text-xl font-semibold text-slate-950">{card.title}</h3>
              <p className="text-sm leading-7 text-slate-600">{card.description}</p>
            </Panel>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="px-6 py-20 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-12">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions the frontend already helps answer"
          description="The current build stays frontend-first, but the user journey is already shaped around the broker sync, AI analysis, and personalized feed experience."
          theme="light"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {faqs.map((faq) => (
            <Panel
              key={faq.question}
              className="space-y-4 border-black/6 bg-white/78 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
            >
              <h3 className="text-lg font-semibold text-slate-950">{faq.question}</h3>
              <p className="text-sm leading-7 text-slate-600">{faq.answer}</p>
            </Panel>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCallToAction() {
  return (
    <section className="px-6 pb-24 pt-12 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Panel
          glow
          className="flex flex-col gap-8 border-black/6 bg-[#142033] p-8 shadow-[0_32px_90px_rgba(15,23,42,0.18)] lg:flex-row lg:items-center lg:justify-between lg:p-10"
        >
          <div className="max-w-2xl space-y-4">
            <Badge tone="brand" className="border-brand/25 bg-brand/12">
              Next phase ready
            </Badge>
            <h2 className="text-4xl font-semibold tracking-tight text-white">
              Build the intelligent portfolio home first, then connect the real data.
            </h2>
            <p className="text-lg leading-8 text-slate-300">
              The frontend now has the warmer marketing layer, the onboarding
              flow, and the product routes needed for backend integration without a
              redesign.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/onboarding"
              className={buttonStyles({
                size: "lg",
                className:
                  "border-brand bg-brand text-slate-950 hover:border-brand-strong hover:bg-brand-strong",
              })}
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
                  "border-white/12 bg-white/8 text-white hover:bg-white/12 hover:border-white/18",
              })}
            >
              View feed demo
            </Link>
          </div>
        </Panel>
      </div>
    </section>
  );
}
