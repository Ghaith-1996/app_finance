import Link from "next/link";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { Newspaper } from "@phosphor-icons/react/dist/ssr/Newspaper";
import { Sparkle } from "@phosphor-icons/react/dist/ssr/Sparkle";
import { Wallet } from "@phosphor-icons/react/dist/ssr/Wallet";

import { AppLogo } from "@/components/brand/app-logo";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Reveal } from "@/components/marketing/reveal";
import { SiteHeader } from "@/components/marketing/site-header";
import { TaglineReveal } from "@/components/marketing/tagline-reveal";
import { UseCases } from "@/components/marketing/use-cases";
import { buttonStyles } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { getTranslations } from "@/lib/i18n/server";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal/constants";
import { faqs, painPoints, productFeatures, siteStats, testimonials } from "@/lib/mock-data";

const featureIcons = [Wallet, Sparkle, Newspaper];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export default async function Home() {
  const { t } = await getTranslations();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <Hero />
        <ProblemSection />
        <TaglineSection />
        <BenefitsSection />
        <UseCases />
        <HowItWorks />
        <ProofSection />
        <FaqSection />
        <FinalCallToAction />
      </main>
      <footer className="border-t border-subtle px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 text-sm text-secondary md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AppLogo size="sm" />
              <span className="font-semibold text-primary">Pulsefolio</span>
            </div>
            <p className="text-muted">
              &copy; {new Date().getFullYear()} Pulsefolio. {t("landing.footerTagline")}
            </p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-3">
            <Link href="/onboarding" className="transition hover:text-primary">
              {t("landing.footerOnboarding")}
            </Link>
            <Link href="/demo" className="transition hover:text-primary">
              {t("landing.footerFeed")}
            </Link>
            <Link href="/portfolio" className="transition hover:text-primary">
              {t("landing.footerPortfolio")}
            </Link>
            {/* Audit D11: cost, sign-in, legal and support are reachable without signing in. */}
            <Link href="/pricing" className="transition hover:text-primary">
              {t("landing.footerPricing")}
            </Link>
            <Link href="/login" className="transition hover:text-primary">
              {t("landing.footerSignIn")}
            </Link>
            <Link href="/terms" className="transition hover:text-primary">
              {t("landing.footerTerms")}
            </Link>
            <Link href="/privacy" className="transition hover:text-primary">
              {t("landing.footerPrivacy")}
            </Link>
            <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="transition hover:text-primary">
              {t("landing.footerContact")}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function ProblemSection() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-6xl space-y-12">
        <SectionHeading
          eyebrow="The problem"
          title="Market news is loud. Your portfolio is specific."
          description="Most tools show the same headlines to everyone and leave you to work out which ones touch your money."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {painPoints.map((painPoint, index) => (
            <Panel key={painPoint.title} className="space-y-3">
              <p className="font-mono text-sm text-muted">0{index + 1}</p>
              <h3 className="text-lg font-semibold text-primary">{painPoint.title}</h3>
              <p className="text-sm text-secondary">{painPoint.description}</p>
            </Panel>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function TaglineSection() {
  return (
    <section aria-label="What Pulsefolio does" className="px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <TaglineReveal
          lines={["Fewer headlines,", "and every one of them", "about what you own."]}
        />
      </div>
    </section>
  );
}

function BenefitsSection() {
  return (
    <section id="benefits" className="px-4 py-24 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-6xl space-y-12">
        <SectionHeading
          eyebrow="What you get"
          title="One home for your holdings, your questions and your news"
          description="Pulsefolio keeps the daily review short: see what changed, ask why, and read only the stories that touch your positions."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {productFeatures.map((feature, index) => {
            const Icon = featureIcons[index] ?? Sparkle;
            return (
              <Panel key={feature.title} className="flex flex-col gap-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-brand">{feature.eyebrow}</p>
                  <h3 className="text-xl font-semibold text-primary">{feature.title}</h3>
                  <p className="text-sm text-secondary">{feature.description}</p>
                </div>
                <ul className="mt-auto space-y-2 border-t border-subtle pt-4 text-sm text-secondary">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}

function ProofSection() {
  return (
    <section className="px-4 py-24 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-6xl space-y-12">
        <SectionHeading
          eyebrow="Who it's for"
          title="Built for self directed investors"
          description="Illustrative scenarios of the questions Pulsefolio is designed to answer. They are examples, not customer reviews."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {testimonials.map((testimonial) => (
            <Panel key={testimonial.role} className="flex flex-col gap-6">
              <p className="text-xl text-primary">&ldquo;{testimonial.quote}&rdquo;</p>
              <div className="mt-auto flex items-center justify-between gap-4 text-sm">
                <span className="text-secondary">{testimonial.role}</span>
                <span className="rounded-full border border-subtle px-3 py-1 text-xs text-muted">
                  Illustrative scenario
                </span>
              </div>
            </Panel>
          ))}
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          {siteStats.map((stat) => (
            <div key={stat.label} className="flex flex-col rounded-2xl border border-subtle p-6">
              <dt className="text-sm font-semibold text-primary">{stat.label}</dt>
              <dd className="mt-1 text-sm text-muted">{stat.hint}</dd>
              <dd className="order-first mb-4 font-mono text-4xl font-semibold text-primary">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </section>
  );
}

function FaqSection() {
  return (
    <section id="faq" className="px-4 py-24 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }}
      />
      <Reveal className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionHeading
          eyebrow="FAQ"
          title="Questions before you start"
          description="What Pulsefolio does with your holdings, what it costs, and what it will never do."
        />
        <div className="divide-y divide-[var(--border-subtle)] rounded-2xl border border-subtle bg-surface-raised">
          {faqs.map((faq) => (
            <details key={faq.question} className="group px-6 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-2 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
                {faq.question}
                <span
                  aria-hidden="true"
                  className="text-xl text-muted transition-transform duration-500 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pb-2 pt-2 text-sm text-secondary">{faq.answer}</p>
            </details>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function FinalCallToAction() {
  return (
    <section className="px-4 pb-24 pt-12 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center rounded-3xl bg-brand px-6 py-16 text-center text-brand-foreground sm:px-12">
          <h2 className="max-w-[680px] text-4xl font-semibold tracking-tight sm:text-5xl">
            Your next morning brief
            {" "}<br className="hidden sm:inline" />
            can start with what you own
          </h2>
          <p className="mt-6 max-w-[680px] text-lg opacity-80">
            Add a portfolio in about a minute, then open a feed that already knows which stories
            matter to it.
          </p>
          <Link
            href="/onboarding"
            className={buttonStyles({
              variant: "secondary",
              size: "lg",
              className: "mt-8 border-transparent",
            })}
          >
            Start free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm opacity-80">
            <li>Free plan with 100 AI requests a day</li>
            <li>No card needed</li>
            <li>Read only, never moves money</li>
          </ul>
        </div>
      </Reveal>
    </section>
  );
}
