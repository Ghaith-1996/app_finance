/**
 * In-memory sliding-window rate limiter.
 *
 * Suitable for single-instance deployments (e.g. Vercel serverless per
 * isolate).  For horizontal scaling, replace the backing store with
 * Upstash Redis or similar.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 20 });
 *   const check = limiter.check(userId);
 *   if (!check.allowed) return new Response("Too many requests", { status: 429 });
 */

interface RateLimiterOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum requests per window per key. */
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the current window resets (present when blocked). */
  retryAfterMs?: number;
  /** Remaining requests in the current window. */
  remaining: number;
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

const CLEANUP_INTERVAL_MS = 60_000;

export function createRateLimiter(opts: RateLimiterOptions) {
  const { windowMs, maxRequests } = opts;
  const store = new Map<string, WindowEntry>();
  let lastCleanup = Date.now();

  function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
    lastCleanup = now;
    for (const [key, entry] of store) {
      if (now - entry.windowStart >= windowMs) {
        store.delete(key);
      }
    }
  }

  function check(key: string): RateLimitResult {
    cleanup();
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      store.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    if (entry.count >= maxRequests) {
      const retryAfterMs = windowMs - (now - entry.windowStart);
      return { allowed: false, retryAfterMs, remaining: 0 };
    }

    entry.count++;
    return { allowed: true, remaining: maxRequests - entry.count };
  }

  return { check };
}

// ---------------------------------------------------------------------------
// Pre-configured limiters scoped to specific surfaces
// ---------------------------------------------------------------------------

/** AI chat endpoints: 20 requests per 60 seconds per user */
export const aiChatLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
});

/** Analysis run: 5 requests per 60 seconds per user */
export const analysisRunLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 5,
});

/** Community posts: 10 per 60 seconds per user */
export const communityPostLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
});

/** Community comments: 20 per 60 seconds per user */
export const communityCommentLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 20,
});
