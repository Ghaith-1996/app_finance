/**
 * Server-side session-only "chat verification grant" helper.
 *
 * Once a user has passed a Turnstile challenge for a specific chat scope
 * (story chat, general chat, or portfolio copilot), we mint a signed,
 * HttpOnly, session-only cookie that lets them keep sending messages in that
 * same scope for the remainder of the browser session without re-verifying.
 *
 * The signature is produced with HMAC-SHA256 using `TURNSTILE_SECRET_KEY` as
 * the signing key, so no additional env variable is required.
 *
 * Server-only — never import from client components.
 */

import { createHmac, timingSafeEqual } from "crypto";

import { createLogger } from "@/lib/logger";

const log = createLogger("chat-turnstile-grant");

// ---------------------------------------------------------------------------
// Scope definition
// ---------------------------------------------------------------------------

/**
 * Surfaces that can be granted independently. A grant for one surface is not
 * valid for any other surface.
 *
 * - `article-chat`          : story-level chat on a specific article
 * - `article-chat-general`  : general "Ask AI" in the feed (no article)
 * - `portfolio-copilot`     : portfolio copilot on a portfolio
 */
export type ChatGrantSurface =
  | "article-chat"
  | "article-chat-general"
  | "portfolio-copilot";

export interface ChatGrantScope {
  userId: string;
  surface: ChatGrantSurface;
  portfolioId: string;
  /** Required for `article-chat`; must be omitted for other surfaces. */
  newsItemId?: string;
}

// ---------------------------------------------------------------------------
// Cookie configuration
// ---------------------------------------------------------------------------

const COOKIE_PREFIX = "cv_"; // "chat verified"
const COOKIE_VERSION = "v1";
const SIGNATURE_SEPARATOR = ".";

export const CHAT_GRANT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  // Session-only: no `maxAge` / `expires` -> cleared on browser exit.
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireSigningKey(): string {
  const key = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!key) {
    log.error("TURNSTILE_SECRET_KEY is not configured");
    throw new Error("TURNSTILE_SECRET_KEY is not configured");
  }
  return key;
}

function scopeKey(scope: ChatGrantScope): string {
  const parts = [
    COOKIE_VERSION,
    scope.userId,
    scope.surface,
    scope.portfolioId,
    scope.newsItemId ?? "-",
  ];
  return parts.join("|");
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signScope(scope: ChatGrantScope, key: string): string {
  const mac = createHmac("sha256", key);
  mac.update(scopeKey(scope));
  return base64UrlEncode(mac.digest());
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

function scopeHash(scope: ChatGrantScope): string {
  // Stable, URL-safe identifier derived from the scope so cookie names do not
  // leak the raw IDs or grow unbounded.
  const mac = createHmac("sha256", "chat-grant-name-salt");
  mac.update(scopeKey(scope));
  return base64UrlEncode(mac.digest().subarray(0, 12));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Name of the `Set-Cookie` / `Cookie` entry that carries the grant for this
 * scope. Stable for a given scope so repeated issuance overwrites the same
 * cookie.
 */
export function chatGrantCookieName(scope: ChatGrantScope): string {
  return `${COOKIE_PREFIX}${scopeHash(scope)}`;
}

/**
 * Build the opaque cookie value that encodes the scope signature.
 */
export function buildChatGrantCookieValue(scope: ChatGrantScope): string {
  const key = requireSigningKey();
  const signature = signScope(scope, key);
  return `${COOKIE_VERSION}${SIGNATURE_SEPARATOR}${signature}`;
}

/**
 * Parse a raw `Cookie` header string into `{ name: value }`. Only handles the
 * narrow shape we need (no quoted values, no attributes).
 */
export function parseCookieHeader(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  const parts = header.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!name) continue;
    try {
      out[name] = decodeURIComponent(value);
    } catch {
      out[name] = value;
    }
  }
  return out;
}

/**
 * Validate a raw cookie value (`<version>.<signature>`) against the expected
 * signature for the given scope. Returns `false` if missing, malformed, wrong
 * version, or the signature does not match (user changed, scope changed,
 * cookie tampered).
 *
 * Useful for server components / loaders that already have access to the
 * parsed cookie store and do not hold a `Request` object.
 */
export function hasValidChatGrantValue(
  raw: string | undefined | null,
  scope: ChatGrantScope,
): boolean {
  const key = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!key) return false;
  if (!raw) return false;

  const [version, signature] = raw.split(SIGNATURE_SEPARATOR);
  if (version !== COOKIE_VERSION || !signature) return false;

  const expected = signScope(scope, key);
  return safeEqual(signature, expected);
}

/**
 * Check whether an incoming request carries a valid grant for the given
 * chat scope.
 */
export function hasValidChatGrantCookie(
  request: Request,
  scope: ChatGrantScope,
): boolean {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const name = chatGrantCookieName(scope);
  return hasValidChatGrantValue(cookies[name], scope);
}

/**
 * Build a `Set-Cookie` header string that issues a session-only grant for
 * the given scope.
 */
export function buildChatGrantSetCookieHeader(scope: ChatGrantScope): string {
  const name = chatGrantCookieName(scope);
  const value = buildChatGrantCookieValue(scope);

  const pieces = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") {
    pieces.push("Secure");
  }

  return pieces.join("; ");
}

/**
 * Convenience wrapper used by route handlers: given the current Request and
 * the intended scope, decide whether Turnstile must be verified for this
 * request.
 */
export function chatGrantRequired(
  request: Request,
  scope: ChatGrantScope,
): boolean {
  return !hasValidChatGrantCookie(request, scope);
}
