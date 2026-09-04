export type AIChatErrorCode =
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_auth"
  | "provider_rate_limited"
  | "provider_context_limit"
  | "provider_bad_response";

export class AIChatError extends Error {
  readonly code: AIChatErrorCode;

  constructor(code: AIChatErrorCode, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "AIChatError";
    this.code = code;
  }
}

export function assertNonEmptyArticleChatReply(text: string | null | undefined): string {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) {
    throw new AIChatError("provider_bad_response", "Model returned an empty answer.");
  }
  return t;
}

/** Normalize unknown failures from provider HTTP clients into a stable chat error for routes/logging. */
export function toArticleChatError(err: unknown): AIChatError {
  if (err instanceof AIChatError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  const hasStatus = (status: number) =>
    new RegExp(`\\b(?:http\\s+|status(?:\\s+code)?\\s*[:=]?\\s*)${status}\\b`, "i").test(msg);

  if (hasStatus(429)) {
    return new AIChatError("provider_rate_limited", msg, err);
  }
  if (hasStatus(413)) {
    return new AIChatError("provider_context_limit", msg, err);
  }
  if (hasStatus(401) || hasStatus(403)) {
    return new AIChatError("provider_auth", msg, err);
  }
  if (lower.includes("timeout") || lower.includes("aborted") || lower.includes("etimedout")) {
    return new AIChatError("provider_timeout", msg, err);
  }
  if (/rate.?limit|too many requests/i.test(msg)) {
    return new AIChatError("provider_rate_limited", msg, err);
  }
  if (
    /context (length|window)|maximum context|token limit|input.{0,20}too long|prompt.{0,20}too long/i.test(
      msg,
    )
  ) {
    return new AIChatError("provider_context_limit", msg, err);
  }
  if (/unauthorized|invalid api key|incorrect api key|missing.{0,20}api key|api key.{0,20}missing/i.test(msg)) {
    return new AIChatError("provider_auth", msg, err);
  }
  return new AIChatError("provider_unavailable", msg, err);
}
