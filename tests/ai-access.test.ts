import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBillingSummaryForUser, checkBurstLimit, consumeAIQuota } = vi.hoisted(() => ({
  getBillingSummaryForUser: vi.fn(),
  checkBurstLimit: vi.fn(),
  consumeAIQuota: vi.fn(),
}));

vi.mock("@/lib/billing/subscriptions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/subscriptions")>(
    "@/lib/billing/subscriptions",
  );
  return {
    ...actual,
    getBillingSummaryForUser,
  };
});

vi.mock("@/lib/security/rate-limit", () => ({
  aiBurstLimiter: {
    check: (...args: unknown[]) => checkBurstLimit(...args),
  },
}));

vi.mock("@/lib/billing/ai-usage", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/ai-usage")>(
    "@/lib/billing/ai-usage",
  );
  return {
    ...actual,
    consumeAIQuota,
  };
});

import { BillingAccessError } from "@/lib/billing/subscriptions";
import {
  AIUsageAccessError,
  assertUserCanUseAI,
} from "@/lib/security/ai-access";

describe("assertUserCanUseAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBillingSummaryForUser.mockResolvedValue({
      planKey: "free",
      status: "free",
      allowedModelTiers: ["free"],
      defaultModelTier: "free",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      hasPaidAccess: false,
      hasUsedTrial: false,
      hasAdminModelAccess: false,
      aiQuotaLimit: 100,
      aiQuotaWindow: "day",
      aiQuotaUsed: 0,
      aiQuotaRemaining: 100,
      aiQuotaResetsAt: "2026-04-05T04:00:00.000Z",
    });
    checkBurstLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      resetsAt: "2026-04-04T12:01:00.000Z",
    });
    consumeAIQuota.mockResolvedValue({
      allowed: true,
      aiQuotaLimit: 100,
      aiQuotaWindow: "day",
      aiQuotaUsed: 1,
      aiQuotaRemaining: 99,
      aiQuotaResetsAt: "2026-04-05T04:00:00.000Z",
    });
  });

  it("allows free-tier usage while quota remains", async () => {
    const summary = await assertUserCanUseAI(
      { id: "user-1", email: "user@example.com" },
      "free",
      "article_chat",
    );

    expect(summary.aiQuotaUsed).toBe(1);
    expect(summary.aiQuotaRemaining).toBe(99);
    expect(consumeAIQuota).toHaveBeenCalledWith({
      userId: "user-1",
      planKey: "free",
    });
  });

  it("blocks disallowed model tiers before consuming quota", async () => {
    await expect(
      assertUserCanUseAI(
        { id: "user-1", email: "user@example.com" },
        "premium",
        "article_chat",
      ),
    ).rejects.toBeInstanceOf(BillingAccessError);

    expect(checkBurstLimit).not.toHaveBeenCalled();
    expect(consumeAIQuota).not.toHaveBeenCalled();
  });

  it("returns a durable burst-limit error", async () => {
    checkBurstLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterMs: 15_000,
      resetsAt: "2026-04-04T12:01:00.000Z",
    });

    await expect(
      assertUserCanUseAI(
        { id: "user-1", email: "user@example.com" },
        "free",
        "article_chat",
      ),
    ).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterMs: 15_000,
    });

    expect(consumeAIQuota).not.toHaveBeenCalled();
  });

  it("blocks free users after the daily quota is exhausted", async () => {
    consumeAIQuota.mockResolvedValue({
      allowed: false,
      aiQuotaLimit: 100,
      aiQuotaWindow: "day",
      aiQuotaUsed: 100,
      aiQuotaRemaining: 0,
      aiQuotaResetsAt: "2026-04-05T04:00:00.000Z",
    });

    await expect(
      assertUserCanUseAI(
        { id: "user-1", email: "user@example.com" },
        "free",
        "article_chat",
      ),
    ).rejects.toMatchObject({
      code: "quota_exceeded",
      quotaLimit: 100,
      quotaWindow: "day",
      quotaUsed: 100,
    });
  });

  it("blocks premium users after the monthly quota is exhausted", async () => {
    getBillingSummaryForUser.mockResolvedValue({
      planKey: "premium",
      status: "active",
      allowedModelTiers: ["free", "premium"],
      defaultModelTier: "premium",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2026-05-01T04:00:00.000Z",
      hasPaidAccess: true,
      hasUsedTrial: false,
      hasAdminModelAccess: false,
      aiQuotaLimit: 5_000,
      aiQuotaWindow: "month",
      aiQuotaUsed: 4_999,
      aiQuotaRemaining: 1,
      aiQuotaResetsAt: "2026-05-01T04:00:00.000Z",
    });
    consumeAIQuota.mockResolvedValue({
      allowed: false,
      aiQuotaLimit: 5_000,
      aiQuotaWindow: "month",
      aiQuotaUsed: 5_000,
      aiQuotaRemaining: 0,
      aiQuotaResetsAt: "2026-05-01T04:00:00.000Z",
    });

    await expect(
      assertUserCanUseAI(
        { id: "user-1", email: "user@example.com" },
        "premium",
        "portfolio_copilot",
      ),
    ).rejects.toMatchObject({
      code: "quota_exceeded",
      quotaLimit: 5_000,
      quotaWindow: "month",
      quotaUsed: 5_000,
    });
  });

  it("blocks ultimate users after the monthly quota is exhausted", async () => {
    getBillingSummaryForUser.mockResolvedValue({
      planKey: "ultimate",
      status: "active",
      allowedModelTiers: ["free", "premium", "ultimate"],
      defaultModelTier: "ultimate",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2026-05-01T04:00:00.000Z",
      hasPaidAccess: true,
      hasUsedTrial: false,
      hasAdminModelAccess: false,
      aiQuotaLimit: 20_000,
      aiQuotaWindow: "month",
      aiQuotaUsed: 19_999,
      aiQuotaRemaining: 1,
      aiQuotaResetsAt: "2026-05-01T04:00:00.000Z",
    });
    consumeAIQuota.mockResolvedValue({
      allowed: false,
      aiQuotaLimit: 20_000,
      aiQuotaWindow: "month",
      aiQuotaUsed: 20_000,
      aiQuotaRemaining: 0,
      aiQuotaResetsAt: "2026-05-01T04:00:00.000Z",
    });

    await expect(
      assertUserCanUseAI(
        { id: "user-1", email: "user@example.com" },
        "ultimate",
        "article_chat",
      ),
    ).rejects.toMatchObject({
      code: "quota_exceeded",
      quotaLimit: 20_000,
      quotaWindow: "month",
      quotaUsed: 20_000,
    });
  });

  it("keeps admin model access but still enforces the effective free-tier quota", async () => {
    getBillingSummaryForUser.mockResolvedValue({
      planKey: "free",
      status: "free",
      allowedModelTiers: ["free", "premium", "ultimate"],
      defaultModelTier: "ultimate",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      hasPaidAccess: false,
      hasUsedTrial: false,
      hasAdminModelAccess: true,
      aiQuotaLimit: 100,
      aiQuotaWindow: "day",
      aiQuotaUsed: 100,
      aiQuotaRemaining: 0,
      aiQuotaResetsAt: "2026-04-05T04:00:00.000Z",
    });
    consumeAIQuota.mockResolvedValue({
      allowed: false,
      aiQuotaLimit: 100,
      aiQuotaWindow: "day",
      aiQuotaUsed: 100,
      aiQuotaRemaining: 0,
      aiQuotaResetsAt: "2026-04-05T04:00:00.000Z",
    });

    await expect(
      assertUserCanUseAI(
        { id: "user-1", email: "admin@example.com" },
        "ultimate",
        "portfolio_copilot",
      ),
    ).rejects.toMatchObject({
      code: "quota_exceeded",
      quotaLimit: 100,
      quotaWindow: "day",
    });
  });
});
