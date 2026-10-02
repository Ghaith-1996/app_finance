type CacheEntry<T> = { value: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
/** Audit H10: bound memory under key churn (e.g. many distinct symbols). Least recently used goes first. */
export const CACHE_MAX_ENTRIES = 500;

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  // Map keeps insertion order; re-inserting marks the key most recently used.
  store.delete(key);
  store.set(key, entry);
  return entry.value as T;
}

export function cacheSet<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.delete(key);
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  while (store.size > CACHE_MAX_ENTRIES) {
    const oldest = store.keys().next().value as string;
    store.delete(oldest);
  }
}

export function cacheSize(): number {
  return store.size;
}

/**
 * Fetch-through helper: returns the cached value if fresh, otherwise calls `fn` and caches the
 * result. Concurrent misses for the same key share one call (audit H10); failures are not cached.
 */
export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const existing = cacheGet<T>(key);
  if (existing !== undefined) return existing;

  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const request = (async () => {
    try {
      const value = await fn();
      cacheSet(key, value, ttlMs);
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, request);
  return request;
}
