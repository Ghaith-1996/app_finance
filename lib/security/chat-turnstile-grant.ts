/**
 * Server-side short-lived "chat verification grant" helper.
 *
 * Once a user has passed a Turnstile challenge for a portfolio chat surface,
 * we mint a signed, HttpOnly cookie that lets them keep sending messages for
 * that same portfolio for a short window without re-verifying.
 *
 * The signature is produced with HMAC-SHA256 using `TURNSTILE_SECRET_KEY` as
 * the signing key, so no additional env variable is required.
 *
 * Server-only - never import from client components.
 */

import { createHmac, timingSafeEqual } from "crypto";

import { createLogger } from "@/lib/logger";

const log = createLogger("chat-turnstile-grant");

// ---------------------------------------------------------------------------
// Scope definition
// ---------------------------------------------------------------------------

/**
 * Surfaces that can request a portfolio-wide chat grant. Auth, ownership,
 * billing, and durable quota checks still run on every request; Turnstile is
 * only a bot-friction gate.
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
  /** Present for story chat requests, but not part of the grant boundary. */
  newsItemId?: string;
}

// ---------------------------------------------------------------------------
// Cookie configuration
// ---------------------------------------------------------------------------

const COOKIE_PREFIX = "cv_"; // "chat verified"
const COOKIE_VERSION = "v2";
const SIGNATURE_SEPARATOR = ".";
export const CHAT_GRANT_TTL_SECONDS = 15 * 60;

export const CHAT_GRANT_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: CHAT_GRANT_TTL_SECONDS,
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

function normalizedScopeKey(scope: ChatGrantScope): string {
  // A grant is intentionally portfolio-wide for 15 minutes. The route still
  // validates the exact story, portfolio ownership, model access, and quota on
  // every request.
  const parts = [
    COOKIE_VERSION,
    scope.userId,
    "portfolio-chat",
    scope.portfolioId,
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

function signScope(
  scope: ChatGrantScope,
  key: string,
  issuedAtMs: number,
): string {
  const mac = createHmac("sha256", key);
  mac.update(`${normalizedScopeKey(scope)}|${issuedAtMs}`);
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
  // Stable, URL-safe identifier derived from the portfolio grant boundary so
  // cookie names do not leak the raw IDs or grow unbounded.
  const mac = createHmac("sha256", "chat-grant-name-salt");
  mac.update(normalizedScopeKey(scope));
  return base64UrlEncode(mac.digest().subarray(0, 12));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Name of the `Set-Cookie` / `Cookie` entry that carries the grant for this
 * portfolio. Stable for a given user + portfolio so repeated issuance
 * overwrites the same cookie.
 */
export function chatGrantCookieName(scope: ChatGrantScope): string {
  return `${COOKIE_PREFIX}${scopeHash(scope)}`;
}

/**
 * Build the opaque cookie value that encodes the grant timestamp and scope
 * signature.
 */
export function buildChatGrantCookieValue(scope: ChatGrantScope): string {
  const key = requireSigningKey();
  const issuedAtMs = Date.now();
  const signature = signScope(scope, key, issuedAtMs);
  return [
    COOKIE_VERSION,
    String(issuedAtMs),
    signature,
  ].join(SIGNATURE_SEPARATOR);
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
 * Validate a raw cookie value (`<version>.<issuedAtMs>.<signature>`) against
 * the expected signature for the given portfolio. Returns `false` if missing,
 * malformed, wrong version, expired, or the signature does not match.
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

  const [version, issuedAtRaw, signature] = raw.split(SIGNATURE_SEPARATOR);
  if (version !== COOKIE_VERSION || !issuedAtRaw || !signature) return false;

  const issuedAtMs = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAtMs)) return false;

  const ageMs = Date.now() - issuedAtMs;
  if (ageMs < 0 || ageMs > CHAT_GRANT_TTL_SECONDS * 1000) return false;

  const expected = signScope(scope, key, issuedAtMs);
  return safeEqual(signature, expected);
}

/**
 * Check whether an incoming request carries a valid grant for the given
 * portfolio chat scope.
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
 * Build a `Set-Cookie` header string that issues a short-lived grant for
 * the given portfolio chat scope.
 */
export function buildChatGrantSetCookieHeader(scope: ChatGrantScope): string {
  const name = chatGrantCookieName(scope);
  const value = buildChatGrantCookieValue(scope);

  const pieces = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${CHAT_GRANT_TTL_SECONDS}`,
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
