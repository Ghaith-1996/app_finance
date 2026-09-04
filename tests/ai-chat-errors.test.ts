import { describe, expect, it } from "vitest";

import { AIChatError, assertNonEmptyArticleChatReply, toArticleChatError } from "@/lib/services/ai/ai-chat-errors";

describe("assertNonEmptyArticleChatReply", () => {
  it("returns trimmed text", () => {
    expect(assertNonEmptyArticleChatReply("  hello  ")).toBe("hello");
  });

  it("throws provider_bad_response for empty", () => {
    expect(() => assertNonEmptyArticleChatReply(null)).toThrow(AIChatError);
    expect(() => assertNonEmptyArticleChatReply("   ")).toThrow(AIChatError);
  });
});

describe("toArticleChatError", () => {
  it("passes through AIChatError", () => {
    const e = new AIChatError("provider_auth", "nope");
    expect(toArticleChatError(e)).toBe(e);
  });

  it("maps timeout-like messages", () => {
    const e = toArticleChatError(new Error("fetch aborted due to timeout"));
    expect(e.code).toBe("provider_timeout");
  });

  it("maps 401-style messages", () => {
    const e = toArticleChatError(new Error("OpenAI HTTP 401: invalid api key"));
    expect(e.code).toBe("provider_auth");
  });

  it("maps upstream rate-limit responses", () => {
    const e = toArticleChatError(
      new Error("OpenRouter HTTP 429: Provider returned too many requests"),
    );
    expect(e.code).toBe("provider_rate_limited");
  });

  it("prefers an explicit 429 status over overlapping API-key language", () => {
    const e = toArticleChatError(
      new Error("OpenRouter HTTP 429: rate limit exceeded for this API key"),
    );
    expect(e.code).toBe("provider_rate_limited");
  });

  it("prefers an explicit 401 status over overlapping context-limit language", () => {
    const e = toArticleChatError(
      new Error("Azure OpenAI HTTP 401: token limit exceeded for this API key"),
    );
    expect(e.code).toBe("provider_auth");
  });

  it("prefers an explicit 403 status over overlapping rate-limit language", () => {
    const e = toArticleChatError(
      new Error("Mistral HTTP 403: too many requests for this API key"),
    );
    expect(e.code).toBe("provider_auth");
  });

  it("prefers an explicit 413 status over overlapping auth language", () => {
    const e = toArticleChatError(
      new Error("OpenRouter HTTP 413: unauthorized because the prompt is too long"),
    );
    expect(e.code).toBe("provider_context_limit");
  });

  it("maps context-window responses", () => {
    const e = toArticleChatError(
      new Error("Azure OpenAI HTTP 400: maximum context length exceeded"),
    );
    expect(e.code).toBe("provider_context_limit");
  });

  it("defaults to provider_unavailable", () => {
    const e = toArticleChatError(new Error("network reset"));
    expect(e.code).toBe("provider_unavailable");
  });
});
