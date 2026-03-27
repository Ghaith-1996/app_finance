import "server-only";

import type { User } from "@supabase/supabase-js";

import {
  allowedModelTiersForPlan,
  defaultModelTierForPlan,
  isTierAllowedForPlan,
  parsePlanKey,
  requiredPlanForTier,
  type PlanKey,
} from "@/lib/billing/plans";
import {
  loadBillingCustomerByUserId,
  loadSubscriptionsForUser,
  type BillingSupabaseClient,
  type SubscriptionRow,
} from "@/lib/billing/store";
import { createClient } from "@/lib/supabase/server";
import type { ArticleChatModelTier } from "@/lib/types";

export type BillingSummary = {
  planKey: PlanKey;
  status: string | null;
  allowedModelTiers: ArticleChatModelTier[];
  defaultModelTier: ArticleChatModelTier;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  hasPaidAccess: boolean;
  hasUsedTrial: boolean;
};

export class BillingAccessError extends Error {
  readonly code = "plan_upgrade_required";
  readonly currentPlan: PlanKey;
  readonly requiredPlan: PlanKey;
  readonly requestedTier: ArticleChatModelTier;

  constructor(input: {
    currentPlan: PlanKey;
    requiredPlan: PlanKey;
    requestedTier: ArticleChatModelTier;
  }) {
    super(
      `The ${input.requestedTier} model tier requires the ${input.requiredPlan} plan.`,
    );
    this.currentPlan = input.currentPlan;
    this.requiredPlan = input.requiredPlan;
    this.requestedTier = input.requestedTier;
  }
}

function isEntitledStatus(status: string, currentPeriodEnd: string | null): boolean {
  if (status === "trialing" || status === "active") return true;
  if (status === "past_due" && currentPeriodEnd) {
    return new Date(currentPeriodEnd).getTime() > Date.now();
  }
  return false;
}

function selectCurrentSubscription(rows: SubscriptionRow[]): SubscriptionRow | null {
  for (const row of rows) {
    if (isEntitledStatus(row.status, row.current_period_end)) {
      return row;
    }
  }

  return rows[0] ?? null;
}

export function buildBillingSummary(input: {
  customerId?: string | null;
  rows: SubscriptionRow[];
}): BillingSummary {
  const activeRow = selectCurrentSubscription(input.rows);
  const activePlan = activeRow?.plan_key ? parsePlanKey(activeRow.plan_key) : null;
  const hasPaidAccess =
    !!activeRow &&
    !!activePlan &&
    activePlan !== "free" &&
    isEntitledStatus(activeRow.status, activeRow.current_period_end);
  const planKey: PlanKey = hasPaidAccess && activePlan ? activePlan : "free";

  return {
    planKey,
    status: activeRow?.status ?? null,
    allowedModelTiers: allowedModelTiersForPlan(planKey),
    defaultModelTier: defaultModelTierForPlan(planKey),
    stripeCustomerId: input.customerId ?? activeRow?.stripe_customer_id ?? null,
    stripeSubscriptionId: activeRow?.stripe_subscription_id ?? null,
    cancelAtPeriodEnd: activeRow?.cancel_at_period_end ?? false,
    currentPeriodEnd: activeRow?.current_period_end ?? null,
    hasPaidAccess,
    hasUsedTrial: input.rows.some((row) => !!row.trial_end),
  };
}

export async function getBillingSummaryForUser(
  userId: string,
  supabase: BillingSupabaseClient,
): Promise<BillingSummary> {
  const [customer, rows] = await Promise.all([
    loadBillingCustomerByUserId(supabase, userId),
    loadSubscriptionsForUser(supabase, userId),
  ]);

  return buildBillingSummary({
    customerId: customer?.stripe_customer_id ?? null,
    rows,
  });
}

export async function getCurrentUserBillingSummary(): Promise<BillingSummary> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return buildBillingSummary({ rows: [] });
  }

  return getBillingSummaryForUser(user.id, supabase);
}

export async function assertUserCanUseModelTier(
  userId: string,
  tier: ArticleChatModelTier,
  supabase: BillingSupabaseClient,
): Promise<BillingSummary> {
  const summary = await getBillingSummaryForUser(userId, supabase);

  if (!isTierAllowedForPlan(summary.planKey, tier)) {
    throw new BillingAccessError({
      currentPlan: summary.planKey,
      requiredPlan: requiredPlanForTier(tier),
      requestedTier: tier,
    });
  }

  return summary;
}

export function deriveStripeCustomerName(user: User): string | undefined {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = typeof meta.full_name === "string" ? meta.full_name.trim() : "";
  if (fullName) return fullName;
  const fallback = typeof meta.name === "string" ? meta.name.trim() : "";
  return fallback || undefined;
}
