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
import { UseCases } from "@/components/marketing/use-cases";
import { SiteHeader } from "@/components/marketing/site-header";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { getTranslations } from "@/lib/i18n/server";
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

export default async function Home() {
  const { t } = await getTranslations();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main className="relative">
        <Hero />
        <ProblemSection />
        <PlatformSection />
        <UseCases />
        <HowItWorks />
        <ProofSection />
        <FaqSection />
        <FinalCallToAction />
      </main>
      <footer className="border-t border-subtle px-6 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-secondary md:flex-row md:items-center md:justify-between">
          <p>&copy; {new Date().getFullYear()} Pulsefolio. {t("landing.footerTagline")}</p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/onboarding" className="transition hover:text-primary">
              {t("landing.footerOnboarding")}
            </Link>
            <Link href="/demo" className="transition hover:text-primary">
              {t("landing.footerFeed")}
            </Link>
            <Link href="/portfolio" className="transition hover:text-primary">
              {t("landing.footerPortfolio")}
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
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {painPoints.map((painPoint) => (
            <Panel
              key={painPoint.title}
              className="space-y-4 p-6"
            >
              <div className="inline-flex rounded-xl border border-brand/15 bg-brand/10 p-3 text-brand">
                <NotebookPen className="h-5 w-5" />
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-semibold text-white">
                  {painPoint.title}
                </h3>
                <p className="text-sm leading-7 text-slate-400">
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
          title="An intelligent financial home built around your holdings"
          description="Clean entry points, lighter surfaces, and product moments that make AI feel useful instead of abstract — all shaped by the portfolio you actually own."
        />
        <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr]">
          <div className="grid gap-4">
            {productFeatures.map((feature, index) => {
              const Icon = featureIcons[index] ?? Sparkles;

              return (
                <Panel
                  key={feature.title}
                  className="space-y-5 p-6"
                >
                  <div className="inline-flex rounded-xl border border-brand/15 bg-brand/10 p-3 text-brand">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">
                      {feature.eyebrow}
                    </p>
                    <h3 className="text-2xl font-semibold text-white">
                      {feature.title}
                    </h3>
                    <p className="text-sm leading-7 text-slate-400">
                      {feature.description}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {feature.bullets.map((bullet) => (
                      <div
                        key={bullet}
                        className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-slate-400"
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
            <Panel className="space-y-6 bg-[#0d1520] p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Badge tone="brand">
                    Ask anything
                  </Badge>
                  <h3 className="mt-4 text-3xl font-semibold tracking-tight text-white">
                    AI that can answer in portfolio language
                  </h3>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-brand">
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
                    className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-4 text-sm text-slate-300"
                  >
                    {prompt}
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-brand/15 bg-brand/10 p-5">
                <div className="flex items-center gap-3 text-brand">
                  <ShieldCheck className="h-5 w-5" />
                  <p className="text-sm font-semibold uppercase tracking-[0.2em]">
                    Trust story
                  </p>
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-300">
                  Pulsefolio frames broker connections as read-only and
                  sets up a clean path for secure syncing later.
                </p>
              </div>
            </Panel>
            <div className="grid gap-4 sm:grid-cols-2">
              {portfolioInsights.map((insight) => (
                <Panel
                  key={insight.title}
                  className="space-y-3 p-5"
                >
                  <p className="text-sm uppercase tracking-[0.18em] text-slate-500">
                    {insight.title}
                  </p>
                  <p className="text-2xl font-semibold text-white">
                    {insight.value}
                  </p>
                  <p className="text-sm leading-7 text-slate-400">
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
          title="A warmer, more personal finance language"
          description="Direct but reassuring, product-led, and centered on helping people feel more in control of their money."
          align="center"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {testimonials.map((testimonial) => (
            <Panel
              key={testimonial.name}
              className="space-y-5 p-6"
            >
              <Badge tone="neutral">
                Product sentiment
              </Badge>
              <p className="text-xl leading-8 text-white">
                &ldquo;{testimonial.quote}&rdquo;
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
              className="space-y-4 p-6"
            >
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-brand">
                {card.eyebrow}
              </p>
              <h3 className="text-xl font-semibold text-white">{card.title}</h3>
              <p className="text-sm leading-7 text-slate-400">{card.description}</p>
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
          title="Questions Pulsefolio helps answer"
          description="The experience is shaped around broker sync, AI analysis, and a personalized feed — so the answers start from what you own."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {faqs.map((faq) => (
            <Panel
              key={faq.question}
              className="space-y-4 p-6"
            >
              <h3 className="text-lg font-semibold text-white">{faq.question}</h3>
              <p className="text-sm leading-7 text-slate-400">{faq.answer}</p>
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
          className="flex flex-col gap-8 bg-[#0d1520] p-8 lg:flex-row lg:items-center lg:justify-between lg:p-10"
        >
          <div className="max-w-2xl space-y-4">
            <Badge tone="brand">
              Next phase ready
            </Badge>
            <h2 className="text-4xl font-semibold tracking-tight text-white">
              Your intelligent portfolio home starts here.
            </h2>
            <p className="text-lg leading-8 text-slate-400">
              Connect a portfolio, run the AI analysis, and open a daily brief
              that already knows what matters — all in one place.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/onboarding"
              className={buttonStyles({ size: "lg" })}
            >
              Get started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link
              href="/demo"
              className={buttonStyles({
                variant: "secondary",
                size: "lg",
              })}
            >
              Open demo
            </Link>
          </div>
        </Panel>
      </div>
    </section>
  );
}
