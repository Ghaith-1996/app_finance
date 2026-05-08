/**
 * Server-side redirect validation.
 *
 * Prevents open-redirect attacks by only allowing redirects to known
 * internal paths.  Used by middleware and auth callback.
 */

const ALLOWED_PREFIXES = [
  "/portfolio",
  "/analysis",
  "/feed",
  "/home",
  "/watchlist",
  "/settings",
  "/admin",
  "/complete-profile",
  "/onboarding",
  "/pricing",
  "/digest",
];

/**
 * Returns `true` when `path` is a safe internal redirect target.
 *
 * Rules:
 * - Must start with `/`
 * - Must NOT contain `://` (blocks `https://evil.com`)
 * - Must NOT start with `//` (blocks protocol-relative URLs)
 * - Must match one of the known app route prefixes
 */
export function isValidInternalRedirect(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  if (path.includes("://")) return false;

  return ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?"),
  );
}

/**
 * Returns a safe redirect target.  Falls back to `fallback` when the
 * raw value fails validation.
 */
export function sanitizeRedirect(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (!raw) return fallback;
  return isValidInternalRedirect(raw) ? raw : fallback;
}
