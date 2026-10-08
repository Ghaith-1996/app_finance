import { allowedModelTiersForPlan, type PlanKey } from "@/lib/billing/plans";
import type { BillingSummary } from "@/lib/billing/subscriptions";

/**
 * What a pricing card offers the current viewer (audit D12): never sell access the viewer
 * already has, whether from their subscription or an account-level access grant.
 */
export type PlanCardState =
  | { kind: "baseline" }
  | { kind: "current" }
  | { kind: "included"; reason: "plan" | "account" }
  | { kind: "checkout" }
  | { kind: "portal" };

type SummaryLike = Pick<BillingSummary, "planKey" | "hasPaidAccess" | "hasAdminModelAccess" | "allowedModelTiers">;

export function planCardState(plan: PlanKey, summary: SummaryLike | null): PlanCardState {
  if (!summary) return plan === "free" ? { kind: "baseline" } : { kind: "checkout" };

  const currentPlan: PlanKey = summary.hasPaidAccess ? summary.planKey : "free";
  if (plan === currentPlan) return { kind: "current" };

  const covered = allowedModelTiersForPlan(plan).every((tier) => summary.allowedModelTiers.includes(tier));
  if (covered) return { kind: "included", reason: summary.hasAdminModelAccess && !summary.hasPaidAccess ? "account" : "plan" };

  return summary.hasPaidAccess ? { kind: "portal" } : { kind: "checkout" };
}
