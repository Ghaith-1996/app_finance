import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { BillingActionButton } from "@/components/app/billing-action-button";
import { PLAN_LABELS, MODEL_TIER_LABELS } from "@/lib/billing/plans";
import type { BillingSummary } from "@/lib/billing/subscriptions";

function formatBillingDate(value: string | null): string {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function BillingSettingsPanel({
  billingSummary,
}: {
  billingSummary: BillingSummary;
}) {
  const renewalLabel = billingSummary.cancelAtPeriodEnd
    ? "Access ends"
    : billingSummary.status === "trialing"
      ? "Trial ends"
      : "Renews";
  const allowedTiers = billingSummary.allowedModelTiers.map(
    (tier) => MODEL_TIER_LABELS[tier],
  );

  return (
    <Panel className="space-y-5 rounded-[2rem] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            Billing
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-white">
            {PLAN_LABELS[billingSummary.planKey]} plan
          </h2>
          <p className="max-w-2xl text-sm leading-7 text-slate-400">
            Model access: {allowedTiers.join(", ")}.
          </p>
        </div>
        <Badge tone={billingSummary.hasPaidAccess ? "brand" : "neutral"}>
          {billingSummary.status ?? "free"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Current plan
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            {PLAN_LABELS[billingSummary.planKey]}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {renewalLabel}
          </p>
          <p className="mt-2 text-lg font-semibold text-white">
            {formatBillingDate(billingSummary.currentPeriodEnd)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Manage access
          </p>
          <p className="mt-2 text-sm leading-7 text-slate-400">
            Stripe Checkout starts new subscriptions. Existing paid subscriptions are updated in the billing portal.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {billingSummary.hasPaidAccess ? (
          <BillingActionButton mode="portal" variant="primary" loginRedirectTo="/settings">
            Manage billing
          </BillingActionButton>
        ) : (
          <>
            <BillingActionButton
              mode="checkout"
              plan="premium"
              variant="secondary"
              loginRedirectTo="/settings"
            >
              Start Premium
            </BillingActionButton>
            <BillingActionButton
              mode="checkout"
              plan="ultimate"
              loginRedirectTo="/settings"
            >
              Start Ultimate
            </BillingActionButton>
          </>
        )}

        <Link
          href="/pricing"
          className="inline-flex items-center justify-center rounded-xl border border-white/10 px-5 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:bg-white/5"
        >
          View pricing
        </Link>
      </div>

      {billingSummary.cancelAtPeriodEnd ? (
        <p className="text-sm text-amber-400">
          This subscription is set to cancel at period end. Access remains active until {formatBillingDate(billingSummary.currentPeriodEnd)}.
        </p>
      ) : null}
    </Panel>
  );
}
