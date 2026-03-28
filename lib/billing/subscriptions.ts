import "server-only";

import type { User } from "@supabase/supabase-js";

import {
  allowedModelTiersForPlan,
  defaultModelTierForPlan,
  parsePlanKey,
  requiredPlanForTier,
  type PlanKey,
} from "@/lib/billing/plans";
import {
  loadBillingCustomerByUserId,
  loadSubscriptionsForUser,
  type SubscriptionRow,
} from "@/lib/billing/store";
import { isAdminUser } from "@/lib/security/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import type { ArticleChatModelTier } from "@/lib/types";

export type BillingSummary = {
  planKey: PlanKey;
  status: string | null;
  allowedModelTiers: ArticleChatModelTier[];
  defaultModelTier: ArticleChatModelTier;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  hasPaidAccess: boolean;
  hasUsedTrial: boolean;
  hasAdminModelAccess: boolean;
};

export type BillingState = BillingSummary & {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
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

export function buildBillingState(input: {
  customerId?: string | null;
  rows: SubscriptionRow[];
}): BillingState {
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
    hasAdminModelAccess: false,
  };
}

function applyAdminModelAccess(
  state: BillingState,
  user: { id: string; email?: string | null } | null,
): BillingState {
  const adminCandidate = user
    ? { id: user.id, email: user.email ?? undefined }
    : null;

  if (!isAdminUser(adminCandidate)) {
    return state;
  }

  return {
    ...state,
    allowedModelTiers: ["free", "premium", "ultimate"],
    defaultModelTier: "ultimate",
    hasAdminModelAccess: true,
  };
}

function toBillingSummary(state: BillingState): BillingSummary {
  return {
    planKey: state.planKey,
    status: state.status,
    allowedModelTiers: state.allowedModelTiers,
    defaultModelTier: state.defaultModelTier,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
    currentPeriodEnd: state.currentPeriodEnd,
    hasPaidAccess: state.hasPaidAccess,
    hasUsedTrial: state.hasUsedTrial,
    hasAdminModelAccess: state.hasAdminModelAccess,
  };
}

export async function getBillingStateForUser(
  userId: string,
  userEmail?: string | null,
): Promise<BillingState> {
  const serviceSupabase = createServiceClient();
  const [customer, rows] = await Promise.all([
    loadBillingCustomerByUserId(serviceSupabase, userId),
    loadSubscriptionsForUser(serviceSupabase, userId),
  ]);

  return applyAdminModelAccess(
    buildBillingState({
      customerId: customer?.stripe_customer_id ?? null,
      rows,
    }),
    { id: userId, email: userEmail ?? null },
  );
}

export async function getBillingSummaryForUser(
  userId: string,
  userEmail?: string | null,
): Promise<BillingSummary> {
  return toBillingSummary(await getBillingStateForUser(userId, userEmail));
}

export async function getCurrentUserBillingSummary(): Promise<BillingSummary> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return toBillingSummary(buildBillingState({ rows: [] }));
  }

  return getBillingSummaryForUser(user.id, user.email);
}

export async function assertUserCanUseModelTier(
  user: Pick<User, "id" | "email">,
  tier: ArticleChatModelTier,
): Promise<BillingSummary> {
  const summary = await getBillingSummaryForUser(user.id, user.email);

  if (!summary.allowedModelTiers.includes(tier)) {
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
