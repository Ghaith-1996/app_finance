import "server-only";

import type { User } from "@supabase/supabase-js";

import { consumeAIQuota, type AIQuotaSummary } from "@/lib/billing/ai-usage";
import {
  BillingAccessError,
  getBillingSummaryForUser,
  type BillingSummary,
} from "@/lib/billing/subscriptions";
import { requiredPlanForTier } from "@/lib/billing/plans";
import { aiBurstLimiter } from "@/lib/security/rate-limit";
import type { ArticleChatModelTier } from "@/lib/types";

export type AIUsageSurface = "article_chat" | "portfolio_copilot";
export type AIUsageAccessCode = "rate_limited" | "quota_exceeded";

export class AIUsageAccessError extends Error {
  readonly code: AIUsageAccessCode;
  readonly retryAfterMs?: number;
  readonly quotaWindow?: AIQuotaSummary["aiQuotaWindow"];
  readonly quotaLimit?: number;
  readonly quotaUsed?: number;
  readonly resetsAt?: string;

  constructor(input: {
    code: AIUsageAccessCode;
    message: string;
    retryAfterMs?: number;
    quotaWindow?: AIQuotaSummary["aiQuotaWindow"];
    quotaLimit?: number;
    quotaUsed?: number;
    resetsAt?: string;
  }) {
    super(input.message);
    this.code = input.code;
    this.retryAfterMs = input.retryAfterMs;
    this.quotaWindow = input.quotaWindow;
    this.quotaLimit = input.quotaLimit;
    this.quotaUsed = input.quotaUsed;
    this.resetsAt = input.resetsAt;
  }
}

function mergeQuotaSummary(
  summary: BillingSummary,
  quota: AIQuotaSummary,
): BillingSummary {
  return {
    ...summary,
    ...quota,
  };
}

export async function assertUserCanUseAI(
  user: Pick<User, "id" | "email">,
  tier: ArticleChatModelTier,
  _surface: AIUsageSurface,
): Promise<BillingSummary> {
  const summary = await getBillingSummaryForUser(user.id, user.email);

  if (!summary.allowedModelTiers.includes(tier)) {
    throw new BillingAccessError({
      currentPlan: summary.planKey,
      requiredPlan: requiredPlanForTier(tier),
      requestedTier: tier,
    });
  }

  const rateCheck = await aiBurstLimiter.check(user.id);
  if (!rateCheck.allowed) {
    throw new AIUsageAccessError({
      code: "rate_limited",
      message: "Too many requests. Please wait a moment.",
      retryAfterMs: rateCheck.retryAfterMs,
      resetsAt: rateCheck.resetsAt,
    });
  }

  const quotaCheck = await consumeAIQuota({
    userId: user.id,
    planKey: summary.planKey,
  });

  if (!quotaCheck.allowed) {
    throw new AIUsageAccessError({
      code: "quota_exceeded",
      message: "You have reached your AI usage limit for the current billing window.",
      quotaWindow: quotaCheck.aiQuotaWindow,
      quotaLimit: quotaCheck.aiQuotaLimit,
      quotaUsed: quotaCheck.aiQuotaUsed,
      resetsAt: quotaCheck.aiQuotaResetsAt,
    });
  }

  return mergeQuotaSummary(summary, quotaCheck);
}
