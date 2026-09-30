import type { AIProviderId } from "@/lib/services/ai";
import type { ArticleChatModelTier } from "@/lib/types";

export type TieredProviderId = Extract<AIProviderId, "azure" | "mistral" | "openrouter">;

export type PlanKey = "free" | "premium" | "ultimate";

export type PaidPlanKey = "premium" | "ultimate";

export const PLAN_LABELS: Record<PlanKey, string> = {
  free: "Free",
  premium: "Premium",
  ultimate: "Ultimate",
};

export const MODEL_TIER_LABELS: Record<ArticleChatModelTier, string> = {
  free: "Free",
  premium: "Premium",
  ultimate: "Ultimate",
};

const MODEL_TIERS_BY_PLAN: Record<PlanKey, ArticleChatModelTier[]> = {
  free: ["free"],
  premium: ["free", "premium"],
  ultimate: ["free", "premium", "ultimate"],
};

export function parseModelTier(value: unknown): ArticleChatModelTier | null {
  if (value == null) return "free";
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "free" || normalized === "premium" || normalized === "ultimate") {
    return normalized;
  }
  return null;
}

export function parsePlanKey(value: unknown): PlanKey | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "free" || normalized === "premium" || normalized === "ultimate") {
    return normalized;
  }
  return null;
}

export function requiredPlanForTier(tier: ArticleChatModelTier): PlanKey {
  if (tier === "ultimate") return "ultimate";
  if (tier === "premium") return "premium";
  return "free";
}

export function providerIdForTier(tier: ArticleChatModelTier): TieredProviderId {
  if (tier === "ultimate") return "azure";
  if (tier === "premium") return "mistral";
  return "openrouter";
}

export function allowedModelTiersForPlan(planKey: PlanKey): ArticleChatModelTier[] {
  return MODEL_TIERS_BY_PLAN[planKey];
}

export function defaultModelTierForPlan(planKey: PlanKey): ArticleChatModelTier {
  const tiers = MODEL_TIERS_BY_PLAN[planKey];
  return tiers[tiers.length - 1];
}
