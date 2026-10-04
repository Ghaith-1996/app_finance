import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { BillingActionButton } from "@/components/app/billing-action-button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { PLAN_LABELS, type PlanKey } from "@/lib/billing/plans";
import { planCardState, type PlanCardState } from "@/lib/billing/pricing-view";
import { getStripe } from "@/lib/billing/stripe";
import { getBillingSummaryForUser } from "@/lib/billing/subscriptions";
import { LEGAL_REFUND_NOTICE } from "@/lib/legal/constants";
import { isAdminUser } from "@/lib/security/admin";
import { loadOnboardingNavState } from "@/lib/server/page-loaders";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pricing" };

// Audit D09: describe what each plan changes for the user, not which vendor serves it.
type PlanCard = {
  key: PlanKey;
  headline: string;
  features: string[];
};

const PLAN_CARDS: PlanCard[] = [
  {
    key: "free",
    headline: "For trying Pulsefolio and light daily use.",
    features: [
      "Free AI model in story chat, Ask AI and the portfolio copilot",
      "100 AI requests per day, resetting at midnight Eastern",
      "Portfolio tracking, personalized feed, alerts and morning digest",
    ],
  },
  {
    key: "premium",
    headline: "For regular research with a stronger AI model.",
    features: [
      "Free and Premium AI models",
      "5,000 AI requests per month",
      "Everything in Free",
    ],
  },
  {
    key: "ultimate",
    headline: "For heavy use with our most capable reasoning model.",
    features: [
      "Free, Premium and Ultimate AI models",
      "20,000 AI requests per month",
      "Everything in Premium",
    ],
  },
];

type PriceInfo = { label: string; currency: string | null; interval: string | null };

async function loadPrice(plan: "premium" | "ultimate"): Promise<PriceInfo> {
  const fallback: PriceInfo = { label: "Monthly billing", currency: null, interval: null };
  const priceId =
    plan === "premium"
      ? process.env.STRIPE_PREMIUM_PRICE_ID?.trim()
      : process.env.STRIPE_ULTIMATE_PRICE_ID?.trim();
  const secret = process.env.STRIPE_SECRET_KEY?.trim();

  if (!priceId || !secret) {
    return fallback;
  }

  try {
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId);
    const amount = price.unit_amount;
    const interval = price.recurring?.interval ?? null;

    if (amount == null) {
      return fallback;
    }

    const currency = (price.currency ?? "usd").toUpperCase();
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount / 100);

    return { label: interval ? `${formatted} / ${interval}` : formatted, currency, interval };
  } catch {
    return fallback;
  }
}

function billingTerms(prices: PriceInfo[]): string {
  const currencies = [...new Set(prices.map((price) => price.currency).filter(Boolean))];
  const intervals = [...new Set(prices.map((price) => price.interval).filter(Boolean))];
  if (currencies.length === 1 && intervals.length === 1) {
    return `Paid plans are billed in ${currencies[0]} every ${intervals[0]} through Stripe and renew automatically until you cancel.`;
  }
  return "Paid plans are billed through Stripe and renew automatically until you cancel. The price, currency, taxes and billing interval are shown at checkout.";
}

function CardAction({ plan, state }: { plan: PlanKey; state: PlanCardState }) {
  switch (state.kind) {
    case "baseline":
      return <Badge tone="neutral">No card required</Badge>;
    case "current":
      return <Badge tone="brand">Your current plan</Badge>;
    case "included":
      return (
        <Badge tone="neutral">
          {state.reason === "account" ? "Included in your account access" : "Included in your plan"}
        </Badge>
      );
    case "portal":
      return (
        <BillingActionButton mode="portal" variant={plan === "ultimate" ? "primary" : "secondary"}>
          Change plan in billing
        </BillingActionButton>
      );
    case "checkout":
      if (plan === "free") return null;
      return (
        <BillingActionButton mode="checkout" plan={plan} variant={plan === "ultimate" ? "primary" : "secondary"}>
          Start {PLAN_LABELS[plan]}
        </BillingActionButton>
      );
  }
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ billing?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const showOnboardingNav = await loadOnboardingNavState();
  const showAdminLink = isAdminUser(user);
  const billingSummary = user ? await getBillingSummaryForUser(user.id, user.email) : null;
  const [premiumPrice, ultimatePrice] = await Promise.all([loadPrice("premium"), loadPrice("ultimate")]);
  const sp = searchParams ? await searchParams : {};
  const billingMessage =
    typeof sp.billing === "string" ? sp.billing : Array.isArray(sp.billing) ? sp.billing[0] : null;
  const trialAvailable = !billingSummary?.hasUsedTrial;
  const accountAccess = !!billingSummary?.hasAdminModelAccess && !billingSummary.hasPaidAccess;

  return (
    <AppShell
      eyebrow=""
      title="Pricing"
      description="Every plan includes portfolio tracking, the personalized feed, alerts and the morning digest. Plans differ in which AI models you can use and how many AI requests you get."
      activePath="/pricing"
      backHref={user ? "/settings" : "/"}
      backLabel={user ? "Back to settings" : "Back to landing"}
      showOnboardingNav={showOnboardingNav}
      showAdminLink={showAdminLink}
      actions={
        user ? (
          <Link
            href="/settings"
            className="inline-flex items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5"
          >
            Open settings
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {billingMessage === "cancel" ? (
          <Badge tone="warning" className="w-fit">
            Checkout was canceled. Your current access has not changed.
          </Badge>
        ) : null}

        {billingSummary?.cancelAtPeriodEnd ? (
          <Badge tone="warning" className="w-fit">
            {PLAN_LABELS[billingSummary.planKey]} is set to cancel at period end. Manage billing to resume or change plans.
          </Badge>
        ) : null}

        {accountAccess ? (
          <Panel className="rounded-2xl p-5">
            <p className="text-sm leading-6 text-slate-300">
              Your account already includes every AI model. You do not need a subscription to use them.
            </p>
          </Panel>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          {PLAN_CARDS.map((plan) => {
            const state = planCardState(plan.key, billingSummary);
            const priceLabel =
              plan.key === "free" ? "$0" : plan.key === "premium" ? premiumPrice.label : ultimatePrice.label;

            return (
              // flex column + mt-auto keeps every card's action on the same baseline.
              <Panel key={plan.key} className="flex flex-col gap-5 rounded-[2rem] p-6">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {PLAN_LABELS[plan.key]}
                  </p>
                  <h2 className="text-3xl font-semibold tracking-tight text-white">{priceLabel}</h2>
                  <p className="text-sm leading-7 text-slate-400">{plan.headline}</p>
                </div>

                <ul className="space-y-2 text-sm text-slate-300">
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                  {plan.key !== "free" && trialAvailable && state.kind === "checkout" ? (
                    <li className="text-brand">7-day free trial on your first paid subscription.</li>
                  ) : null}
                </ul>

                <div className="mt-auto flex flex-wrap items-center gap-3 pt-2">
                  <CardAction plan={plan.key} state={state} />
                  {state.kind === "included" && state.reason === "plan" && billingSummary?.hasPaidAccess ? (
                    <BillingActionButton mode="portal" variant="ghost">
                      Manage billing
                    </BillingActionButton>
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>

        <Panel className="space-y-2 rounded-2xl p-5 text-sm leading-6 text-slate-400">
          <p>
            All plans allow up to 10 AI requests per minute. Failed AI requests do not count toward
            your daily or monthly limit.
          </p>
          <p>{billingTerms([premiumPrice, ultimatePrice])}</p>
          {trialAvailable ? (
            <p>
              A trial converts to the paid plan when it ends unless you cancel before then.
            </p>
          ) : null}
          <p>
            {LEGAL_REFUND_NOTICE}{" "}
            <Link href="/terms" className="text-brand hover:text-brand-strong">
              Terms of Service
            </Link>
          </p>
        </Panel>
      </div>
    </AppShell>
  );
}
