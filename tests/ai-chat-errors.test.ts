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

  it("defaults to provider_unavailable", () => {
    const e = toArticleChatError(new Error("network reset"));
    expect(e.code).toBe("provider_unavailable");
  });
});
