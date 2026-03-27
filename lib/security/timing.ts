/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * Used to verify CRON_SECRET and other server-side shared secrets.
 */

import { timingSafeEqual } from "crypto";

/**
 * Returns `true` when `a` and `b` are identical, using constant-time
 * comparison.  Returns `false` for mismatched lengths without leaking
 * timing information about which characters differ.
 */
export function isTimingSafeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
