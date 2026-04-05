import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/service";

export interface RateLimiterOptions {
  limiterKey: string;
  windowMs: number;
  maxRequests: number;
  consume?: (input: {
    key: string;
    limiterKey: string;
    windowMs: number;
    maxRequests: number;
  }) => Promise<RateLimitResult>;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs?: number;
  remaining: number;
  resetsAt: string;
}

type RateLimitRpcRow = {
  allowed?: boolean | null;
  remaining?: number | string | null;
  retry_after_ms?: number | string | null;
  resets_at?: string | null;
};

type ServiceClient = ReturnType<typeof createServiceClient>;
type RpcCapableClient = Pick<SupabaseClient, "rpc"> | ServiceClient;

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

function buildFallbackResult(windowMs: number, maxRequests: number): RateLimitResult {
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - 1),
    retryAfterMs: undefined,
    resetsAt: new Date(Date.now() + windowMs).toISOString(),
  };
}

function normalizeRateLimitResult(
  row: RateLimitRpcRow | null,
  windowMs: number,
  maxRequests: number,
): RateLimitResult {
  const fallback = buildFallbackResult(windowMs, maxRequests);
  return {
    allowed: row?.allowed !== false,
    remaining: readNumber(row?.remaining, fallback.remaining),
    retryAfterMs: row?.retry_after_ms == null ? undefined : readNumber(row.retry_after_ms, 0),
    resetsAt: row?.resets_at?.trim() || fallback.resetsAt,
  };
}

export async function consumeRateLimit(
  supabase: RpcCapableClient,
  input: {
    key: string;
    limiterKey: string;
    windowMs: number;
    maxRequests: number;
  },
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_user_id: input.key,
    p_limiter_key: input.limiterKey,
    p_window_seconds: Math.max(1, Math.ceil(input.windowMs / 1000)),
    p_max_requests: input.maxRequests,
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizeRateLimitResult(
    getRpcRow<RateLimitRpcRow>(data),
    input.windowMs,
    input.maxRequests,
  );
}

export function createRateLimiter(opts: RateLimiterOptions) {
  const consumer =
    opts.consume ??
    (async (input: {
      key: string;
      limiterKey: string;
      windowMs: number;
      maxRequests: number;
    }) => consumeRateLimit(createServiceClient(), input));

  return {
    check(key: string): Promise<RateLimitResult> {
      return consumer({
        key,
        limiterKey: opts.limiterKey,
        windowMs: opts.windowMs,
        maxRequests: opts.maxRequests,
      });
    },
  };
}

/** AI endpoints: 10 requests per 60 seconds per user */
export const aiBurstLimiter = createRateLimiter({
  limiterKey: "ai_shared",
  windowMs: 60_000,
  maxRequests: 10,
});

/** Analysis run: 5 requests per 60 seconds per user */
export const analysisRunLimiter = createRateLimiter({
  limiterKey: "analysis_run",
  windowMs: 60_000,
  maxRequests: 5,
});

/** Community posts: 10 per 60 seconds per user */
export const communityPostLimiter = createRateLimiter({
  limiterKey: "community_post",
  windowMs: 60_000,
  maxRequests: 10,
});

/** Community comments: 20 per 60 seconds per user */
export const communityCommentLimiter = createRateLimiter({
  limiterKey: "community_comment",
  windowMs: 60_000,
  maxRequests: 20,
});
