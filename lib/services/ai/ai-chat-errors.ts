export type AIChatErrorCode =
  | "provider_unavailable"
  | "provider_timeout"
  | "provider_auth"
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
  if (lower.includes("timeout") || lower.includes("aborted") || lower.includes("etimedout")) {
    return new AIChatError("provider_timeout", msg, err);
  }
  if (
    /\b401\b/.test(msg) ||
    /\b403\b/.test(msg) ||
    /unauthorized|invalid api key|incorrect api key|api key/i.test(msg)
  ) {
    return new AIChatError("provider_auth", msg, err);
  }
  return new AIChatError("provider_unavailable", msg, err);
}
