import { afterEach, describe, expect, it, vi } from "vitest";

import { sendDigestSms } from "@/lib/notifications/delivery";

// Audit J5: only a confirmed non-acceptance is "failed" (retryable). A 5xx may have been accepted,
// so it is "uncertain" and never resent automatically. No real request is made (fetch is mocked).

const digest = {
  id: "digest-1",
  summaryLine: "Bullish leaders: AAPL.",
  bullishSymbols: ["AAPL"],
  bearishSymbols: [],
  topStories: [],
} as never;

describe("Twilio response classification", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    [429, "failed"],
    [400, "failed"],
    [500, "uncertain"],
    [503, "uncertain"],
  ])("HTTP %i is %s", async (status, expected) => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "auth-token";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG123";
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ message: "error" }) }) as never;

    const result = await sendDigestSms({ digest, phoneNumber: "+14165551234", baseUrl: "https://pulsefolio.example" });

    expect(result.status).toBe(expected);
  });
});
