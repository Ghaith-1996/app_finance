import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PlanKey } from "@/lib/billing/plans";
import type { ArticleChatModelTier } from "@/lib/types";
import { createServiceClient } from "@/lib/supabase/service";

export const AI_USAGE_TIME_ZONE = "America/Toronto";
export const AI_SHARED_SURFACE = "shared_ai";

export type AIQuotaWindow = "day" | "month";

export type AIQuotaSummary = {
  aiQuotaLimit: number;
  aiQuotaWindow: AIQuotaWindow;
  aiQuotaUsed: number;
  aiQuotaRemaining: number;
  aiQuotaResetsAt: string;
};

export type AIQuotaCheckResult = AIQuotaSummary & {
  allowed: boolean;
};

export type AIQuotaAtomicCheckResult = AIQuotaSummary & {
  allowed: boolean;
  denialCode: "plan_upgrade_required" | "quota_exceeded" | null;
  effectivePlanKey: PlanKey;
  requiredPlanKey: PlanKey | null;
};

type AIQuotaRpcRow = {
  quota_limit?: number | string | null;
  quota_used?: number | string | null;
  quota_remaining?: number | string | null;
  quota_window?: AIQuotaWindow | null;
  resets_at?: string | null;
  allowed?: boolean | null;
  denial_code?: string | null;
  effective_plan_key?: string | null;
  required_plan_key?: string | null;
};

const AI_QUOTA_POLICY: Record<PlanKey, { limit: number; window: AIQuotaWindow }> = {
  free: { limit: 100, window: "day" },
  premium: { limit: 5_000, window: "month" },
  ultimate: { limit: 20_000, window: "month" },
};

function getRpcRow<T>(data: T[] | T | null): T | null {
  if (!data) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function readNumber(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getTorontoOffsetMinutes(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: AI_USAGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return Math.round((asUtc - date.getTime()) / 60_000);
}

function torontoLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMinutes = getTorontoOffsetMinutes(new Date(naiveUtcMs));
  return new Date(naiveUtcMs - offsetMinutes * 60_000);
}

function computeQuotaResetAt(window: AIQuotaWindow, now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: AI_USAGE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);

  if (window === "day") {
    return torontoLocalToUtc(year, month, day + 1).toISOString();
  }

  if (month === 12) {
    return torontoLocalToUtc(year + 1, 1, 1).toISOString();
  }

  return torontoLocalToUtc(year, month + 1, 1).toISOString();
}

function buildFallbackSummary(planKey: PlanKey): AIQuotaSummary {
  const policy = AI_QUOTA_POLICY[planKey];
  return {
    aiQuotaLimit: policy.limit,
    aiQuotaWindow: policy.window,
    aiQuotaUsed: 0,
    aiQuotaRemaining: policy.limit,
    aiQuotaResetsAt: computeQuotaResetAt(policy.window),
  };
}

function normalizeQuotaSummary(planKey: PlanKey, row: AIQuotaRpcRow | null): AIQuotaSummary {
  const fallback = buildFallbackSummary(planKey);
  const limit = readNumber(row?.quota_limit, fallback.aiQuotaLimit);
  const used = readNumber(row?.quota_used, fallback.aiQuotaUsed);
  const remaining = readNumber(
    row?.quota_remaining,
    Math.max(0, limit - used),
  );
  const window =
    row?.quota_window === "day" || row?.quota_window === "month"
      ? row.quota_window
      : fallback.aiQuotaWindow;
  const resetsAt = row?.resets_at?.trim() || fallback.aiQuotaResetsAt;

  return {
    aiQuotaLimit: limit,
    aiQuotaWindow: window,
    aiQuotaUsed: used,
    aiQuotaRemaining: remaining,
    aiQuotaResetsAt: resetsAt,
  };
}

function normalizePlanKey(value: string | null | undefined, fallback: PlanKey): PlanKey {
  if (value === "free" || value === "premium" || value === "ultimate") {
    return value;
  }
  return fallback;
}

type ServiceClient = ReturnType<typeof createServiceClient>;
type RpcCapableClient = Pick<SupabaseClient, "rpc"> | ServiceClient;

export function getAIQuotaPolicy(planKey: PlanKey): { limit: number; window: AIQuotaWindow } {
  return AI_QUOTA_POLICY[planKey];
}

export function getDefaultAIQuotaSummary(planKey: PlanKey): AIQuotaSummary {
  return buildFallbackSummary(planKey);
}

export async function loadAIQuotaSummary(
  supabase: RpcCapableClient,
  userId: string,
  planKey: PlanKey,
): Promise<AIQuotaSummary> {
  const { data, error } = await supabase.rpc("get_ai_quota_status", {
    p_user_id: userId,
    p_plan_key: planKey,
    p_surface: AI_SHARED_SURFACE,
    p_time_zone: AI_USAGE_TIME_ZONE,
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizeQuotaSummary(planKey, getRpcRow<AIQuotaRpcRow>(data));
}

export async function consumeAIQuota(input: {
  userId: string;
  planKey: PlanKey;
  surface?: string;
}): Promise<AIQuotaCheckResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("consume_ai_quota", {
    p_user_id: input.userId,
    p_plan_key: input.planKey,
    p_surface: input.surface ?? AI_SHARED_SURFACE,
    p_time_zone: AI_USAGE_TIME_ZONE,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = getRpcRow<AIQuotaRpcRow>(data);
  return {
    allowed: row?.allowed !== false,
    ...normalizeQuotaSummary(input.planKey, row),
  };
}

export async function consumeAIQuotaForUser(input: {
  userId: string;
  requestedTier: ArticleChatModelTier;
  allowTierOverride?: boolean;
  surface?: string;
}): Promise<AIQuotaAtomicCheckResult> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("consume_ai_quota_for_user", {
    p_user_id: input.userId,
    p_requested_tier: input.requestedTier,
    p_allow_tier_override: input.allowTierOverride === true,
    p_surface: input.surface ?? AI_SHARED_SURFACE,
    p_time_zone: AI_USAGE_TIME_ZONE,
  });

  if (error) {
    throw new Error(error.message);
  }

  const row = getRpcRow<AIQuotaRpcRow>(data);
  const effectivePlanKey = normalizePlanKey(row?.effective_plan_key ?? null, "free");

  return {
    allowed: row?.allowed !== false,
    denialCode:
      row?.denial_code === "plan_upgrade_required" || row?.denial_code === "quota_exceeded"
        ? row.denial_code
        : null,
    effectivePlanKey,
    requiredPlanKey:
      row?.required_plan_key === "free" ||
      row?.required_plan_key === "premium" ||
      row?.required_plan_key === "ultimate"
        ? row.required_plan_key
        : null,
    ...normalizeQuotaSummary(effectivePlanKey, row),
  };
}
