import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { BillingActionButton } from "@/components/app/billing-action-button";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { PLAN_LABELS } from "@/lib/billing/plans";
import { getStripe } from "@/lib/billing/stripe";
import { getBillingSummaryForUser } from "@/lib/billing/subscriptions";
import { loadOnboardingNavState } from "@/lib/server/page-loaders";
import { createClient } from "@/lib/supabase/server";

type PaidPlanCard = {
  key: "premium" | "ultimate";
  headline: string;
  features: string[];
};

const PAID_PLANS: PaidPlanCard[] = [
  {
    key: "premium",
    headline: "Free + premium model access",
    features: [
      "Access to free and premium model tiers",
      "Premium responses routed to Mistral",
      "Billing changes managed in Stripe's customer portal",
    ],
  },
  {
    key: "ultimate",
    headline: "All models, including ultimate",
    features: [
      "Access to free, premium, and ultimate model tiers",
      "Ultimate responses routed to Azure",
      "Best fit when you want the top reasoning tier everywhere in the app",
    ],
  },
];

async function loadPriceLabel(plan: "premium" | "ultimate"): Promise<string> {
  const priceId =
    plan === "premium"
      ? process.env.STRIPE_PREMIUM_PRICE_ID?.trim()
      : process.env.STRIPE_ULTIMATE_PRICE_ID?.trim();
  const secret = process.env.STRIPE_SECRET_KEY?.trim();

  if (!priceId || !secret) {
    return "Monthly billing";
  }

  try {
    const stripe = getStripe();
    const price = await stripe.prices.retrieve(priceId);
    const amount = price.unit_amount;
    const interval = price.recurring?.interval;

    if (amount == null) {
      return "Monthly billing";
    }

    const currency = (price.currency ?? "usd").toUpperCase();
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount / 100);

    if (!interval) {
      return formatted;
    }

    return `${formatted} / ${interval}`;
  } catch {
    return "Monthly billing";
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
  const billingSummary = user ? await getBillingSummaryForUser(user.id) : null;
  const [premiumPriceLabel, ultimatePriceLabel] = await Promise.all([
    loadPriceLabel("premium"),
    loadPriceLabel("ultimate"),
  ]);
  const sp = searchParams ? await searchParams : {};
  const billingMessage =
    typeof sp.billing === "string" ? sp.billing : Array.isArray(sp.billing) ? sp.billing[0] : null;

  return (
    <AppShell
      eyebrow=""
      title="Pricing"
      description="Stripe Checkout starts new subscriptions. Stripe Customer Portal handles upgrades, downgrades, cancellation, and payment method updates."
      activePath="/pricing"
      backHref={user ? "/settings" : "/"}
      backLabel={user ? "Back to settings" : "Back to landing"}
      showOnboardingNav={showOnboardingNav}
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

        <div className="grid gap-6 lg:grid-cols-3">
          <Panel className="space-y-5 rounded-[2rem] p-6">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Free
              </p>
              <h2 className="text-3xl font-semibold tracking-tight text-white">$0</h2>
              <p className="text-sm leading-7 text-slate-400">
                Access to the free model tier only.
              </p>
            </div>

            <div className="space-y-2 text-sm text-slate-300">
              <p>OpenRouter free model access</p>
              <p>Feed, article chat, and portfolio copilot included</p>
              <p>Upgrade when you need premium or ultimate responses</p>
            </div>

            {billingSummary?.planKey === "free" || !billingSummary ? (
              <Badge tone="neutral">Current baseline</Badge>
            ) : (
              <BillingActionButton mode="portal" variant="secondary">
                Manage billing
              </BillingActionButton>
            )}
          </Panel>

          {PAID_PLANS.map((plan) => {
            const isCurrentPlan = billingSummary?.planKey === plan.key && billingSummary.hasPaidAccess;
            const requiresPortal = !!billingSummary?.hasPaidAccess && !isCurrentPlan;
            const priceLabel = plan.key === "premium" ? premiumPriceLabel : ultimatePriceLabel;

            return (
              <Panel key={plan.key} className="space-y-5 rounded-[2rem] p-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {PLAN_LABELS[plan.key]}
                    </p>
                    {isCurrentPlan ? <Badge tone="brand">Current plan</Badge> : null}
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight text-white">{priceLabel}</h2>
                  <p className="text-sm leading-7 text-slate-400">{plan.headline}</p>
                </div>

                <div className="space-y-2 text-sm text-slate-300">
                  {plan.features.map((feature) => (
                    <p key={feature}>{feature}</p>
                  ))}
                  {!billingSummary?.hasUsedTrial ? (
                    <p className="text-brand">Includes a 7-day trial on the first paid subscription.</p>
                  ) : null}
                </div>

                {isCurrentPlan ? (
                  <Badge tone="brand">Already active</Badge>
                ) : requiresPortal ? (
                  <BillingActionButton mode="portal" variant={plan.key === "ultimate" ? "primary" : "secondary"}>
                    Manage billing
                  </BillingActionButton>
                ) : (
                  <BillingActionButton
                    mode="checkout"
                    plan={plan.key}
                    variant={plan.key === "ultimate" ? "primary" : "secondary"}
                  >
                    Start {PLAN_LABELS[plan.key]}
                  </BillingActionButton>
                )}
              </Panel>
            );
          })}
        </div>
      </div>
    </AppShell>
  );
}
