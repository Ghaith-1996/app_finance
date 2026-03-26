/**
 * Server-side Cloudflare Turnstile verification.
 *
 * Exposes `verifyTurnstileToken()` which calls the Siteverify endpoint
 * and returns a strongly typed result.  All protected routes/actions
 * should call this *before* executing any side-effects.
 *
 * Server-only — never import from client components.
 */

import { createLogger } from "@/lib/logger";

const log = createLogger("turnstile");

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TurnstileFailureCode =
  | "missing-input-secret"
  | "invalid-input-secret"
  | "missing-input-response"
  | "invalid-input-response"
  | "invalid-widget-id"
  | "invalid-parsed-secret"
  | "bad-request"
  | "timeout-or-duplicate"
  | "internal-error";

export interface TurnstileVerifySuccess {
  success: true;
  challengeTs: string;
  hostname: string;
  action: string;
}

export interface TurnstileVerifyFailure {
  success: false;
  /** The primary classified failure reason. */
  code: TurnstileFailureCode | "network-error" | "missing-token" | "missing-secret";
  /** A safe, user-facing message (no secrets). */
  message: string;
  /** Raw error codes from Cloudflare, if available. */
  errorCodes?: string[];
}

export type TurnstileVerifyResult =
  | TurnstileVerifySuccess
  | TurnstileVerifyFailure;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface TurnstileVerifyOptions {
  /** The token from the Turnstile widget (`cf-turnstile-response`). */
  token: string | null | undefined;
  /** Optional client IP forwarded from the request. */
  remoteIp?: string | null;
  /** Optional idempotency key to prevent replay within Cloudflare. */
  idempotencyKey?: string;
  /** Expected action string configured on the widget.  When set, rejects mismatches. */
  expectedAction?: string;
  /** Expected hostname.  When set, rejects mismatches. */
  expectedHostname?: string;
}

// ---------------------------------------------------------------------------
// Siteverify response shape (from Cloudflare docs)
// ---------------------------------------------------------------------------

interface SiteverifyResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyErrorCodes(
  codes: string[],
): TurnstileFailureCode {
  if (codes.includes("timeout-or-duplicate")) return "timeout-or-duplicate";
  if (codes.includes("missing-input-response")) return "missing-input-response";
  if (codes.includes("invalid-input-response")) return "invalid-input-response";
  if (codes.includes("missing-input-secret")) return "missing-input-secret";
  if (codes.includes("invalid-input-secret")) return "invalid-input-secret";
  if (codes.includes("bad-request")) return "bad-request";
  if (codes.includes("internal-error")) return "internal-error";
  return "internal-error";
}

function userMessage(code: TurnstileVerifyFailure["code"]): string {
  switch (code) {
    case "missing-token":
      return "Bot verification is required. Please complete the challenge and try again.";
    case "missing-secret":
      return "Bot protection is misconfigured. Please contact support.";
    case "timeout-or-duplicate":
      return "Verification expired or was already used. Please try again.";
    case "invalid-input-response":
    case "missing-input-response":
      return "Bot verification failed. Please complete the challenge and try again.";
    case "network-error":
      return "Could not verify bot protection right now. Please try again shortly.";
    default:
      return "Bot verification failed. Please try again.";
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function verifyTurnstileToken(
  opts: TurnstileVerifyOptions,
): Promise<TurnstileVerifyResult> {
  // --- Early exits for missing inputs ---
  if (!opts.token?.trim()) {
    return {
      success: false,
      code: "missing-token",
      message: userMessage("missing-token"),
    };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    log.error("TURNSTILE_SECRET_KEY is not configured");
    return {
      success: false,
      code: "missing-secret",
      message: userMessage("missing-secret"),
    };
  }

  // --- Build form body ---
  const formData = new URLSearchParams();
  formData.append("secret", secret);
  formData.append("response", opts.token.trim());
  if (opts.remoteIp) formData.append("remoteip", opts.remoteIp);
  if (opts.idempotencyKey) formData.append("idempotency_key", opts.idempotencyKey);

  // --- Call Siteverify ---
  let data: SiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      log.error("Siteverify HTTP error", { status: res.status });
      return {
        success: false,
        code: "network-error",
        message: userMessage("network-error"),
      };
    }

    data = (await res.json()) as SiteverifyResponse;
  } catch (err) {
    const isTimeout =
      err instanceof DOMException && err.name === "AbortError";
    log.error("Siteverify request failed", {
      timeout: isTimeout,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      success: false,
      code: "network-error",
      message: userMessage("network-error"),
    };
  }

  // --- Evaluate result ---
  if (!data.success) {
    const errorCodes = data["error-codes"] ?? [];
    const code = classifyErrorCodes(errorCodes);
    log.warn("Turnstile verification failed", { errorCodes });
    return {
      success: false,
      code,
      message: userMessage(code),
      errorCodes,
    };
  }

  // --- Optional field checks ---
  if (
    opts.expectedAction &&
    data.action &&
    data.action !== opts.expectedAction
  ) {
    log.warn("Turnstile action mismatch", {
      expected: opts.expectedAction,
      got: data.action,
    });
    return {
      success: false,
      code: "bad-request",
      message: userMessage("bad-request"),
    };
  }

  if (
    opts.expectedHostname &&
    data.hostname &&
    data.hostname !== opts.expectedHostname
  ) {
    log.warn("Turnstile hostname mismatch", {
      expected: opts.expectedHostname,
      got: data.hostname,
    });
    return {
      success: false,
      code: "bad-request",
      message: userMessage("bad-request"),
    };
  }

  return {
    success: true,
    challengeTs: data.challenge_ts ?? "",
    hostname: data.hostname ?? "",
    action: data.action ?? "",
  };
}

// ---------------------------------------------------------------------------
// Convenience: extract client IP from a Next.js Request
// ---------------------------------------------------------------------------

export function getClientIp(request: Request): string | null {
  const headers = request.headers;
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}
