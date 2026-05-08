import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendDigestEmail, sendDigestSms } from "@/lib/notifications/delivery";
import type { DailyDigestSnapshot } from "@/lib/notifications/types";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

const digest: DailyDigestSnapshot = {
  id: "digest-1",
  userId: "user-1",
  digestDate: "2026-01-15",
  timeZone: "America/New_York",
  windowStart: "2026-01-14T22:00:00.000Z",
  windowEnd: "2026-01-15T14:00:00.000Z",
  sourceMode: "portfolio",
  portfolioId: "portfolio-1",
  portfolioName: "Main",
  summaryLine: "Bullish leaders: AAPL. Bearish leaders: TSLA.",
  bullishSymbols: ["AAPL"],
  bearishSymbols: ["TSLA"],
  topStories: [
    {
      newsItemId: "news-1",
      headline: "Apple overnight move",
      source: "Wire",
      url: "https://example.com/story",
      publishedAt: "2026-01-15T13:30:00.000Z",
      category: "technology",
      relevanceScore: 91,
      aiSummary: "Summary",
      whyItMatters: "Why it matters",
      matchedSymbols: ["AAPL"],
      symbolEffects: { AAPL: "bullish" },
      matchSources: ["portfolio"],
      displayEffect: "bullish",
    },
  ],
  createdAt: "2026-01-15T14:00:00.000Z",
};

describe("daily digest delivery adapters", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("builds the expected Resend payload", async () => {
    process.env.RESEND_API_KEY = "re_test";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_123" }),
    }) as typeof fetch;

    const result = await sendDigestEmail({
      digest,
      email: "user@example.com",
      baseUrl: "https://pulsefolio.example",
    });

    expect(result).toEqual({
      channel: "email",
      status: "sent",
      digestId: "digest-1",
      providerMessageId: "email_123",
      errorText: null,
    });

    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(String(init?.body));
    expect(body.to).toBe("user@example.com");
    expect(body.subject).toContain("Pulsefolio Morning Digest");
    expect(body.html).toContain("Apple overnight move");
    expect(body.html).toContain("https://pulsefolio.example/digest/digest-1");
  });

  it("escapes interpolated HTML in the rendered email and does not import react-dom/server", async () => {
    process.env.RESEND_API_KEY = "re_test";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email_123" }),
    }) as typeof fetch;

    const dangerousDigest: DailyDigestSnapshot = {
      ...digest,
      summaryLine: `Bullish leaders: <script>alert("x")</script>. Bearish leaders: "TSLA".`,
      topStories: [
        {
          ...digest.topStories[0],
          headline: `Apple <img src=x onerror=alert("x") /> move`,
          aiSummary: `Summary with <b>markup</b>`,
        },
      ],
    };

    await sendDigestEmail({
      digest: dangerousDigest,
      email: "user@example.com",
      baseUrl: "https://pulsefolio.example",
    });

    const [, init] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(body.html).toContain("Apple &lt;img src=x onerror=alert(&quot;x&quot;) /&gt; move");
    expect(body.html).toContain("Summary with &lt;b&gt;markup&lt;/b&gt;");
    expect(body.html).not.toContain("react-dom/server");

    const deliverySource = readFileSync(
      join(process.cwd(), "lib", "notifications", "delivery.ts"),
      "utf8",
    );
    expect(deliverySource).not.toMatch(/react-dom\/server/);
  });

  it("builds the expected Twilio payload", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "auth-token";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG123";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sid: "SM123" }),
    }) as typeof fetch;

    const result = await sendDigestSms({
      digest,
      phoneNumber: "+14165551234",
      baseUrl: "https://pulsefolio.example",
    });

    expect(result).toEqual({
      channel: "sms",
      status: "sent",
      digestId: "digest-1",
      providerMessageId: "SM123",
      errorText: null,
    });

    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const body = String(init?.body);
    expect(body).toContain("To=%2B14165551234");
    expect(body).toContain("MessagingServiceSid=MG123");
    expect(body).toContain("Pulsefolio+Morning+Digest");
    expect(body).toContain("digest%2Fdigest-1");
  });

  it("returns failed for definite Twilio API failures", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "auth-token";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG123";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Bad phone number" }),
    }) as typeof fetch;

    const result = await sendDigestSms({
      digest,
      phoneNumber: "+14165551234",
      baseUrl: "https://pulsefolio.example",
    });

    expect(result).toEqual({
      channel: "sms",
      status: "failed",
      digestId: "digest-1",
      providerMessageId: null,
      errorText: "Bad phone number",
    });
  });

  it("returns uncertain for Twilio transport errors", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "auth-token";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG123";
    global.fetch = vi.fn().mockRejectedValue(new Error("socket hang up")) as typeof fetch;

    const result = await sendDigestSms({
      digest,
      phoneNumber: "+14165551234",
      baseUrl: "https://pulsefolio.example",
    });

    expect(result).toEqual({
      channel: "sms",
      status: "uncertain",
      digestId: "digest-1",
      providerMessageId: null,
      errorText: "socket hang up",
    });
  });

  it("skips when the contact target is missing", async () => {
    const emailResult = await sendDigestEmail({
      digest,
      email: "",
      baseUrl: "https://pulsefolio.example",
    });
    const smsResult = await sendDigestSms({
      digest,
      phoneNumber: "",
      baseUrl: "https://pulsefolio.example",
    });

    expect(emailResult.status).toBe("skipped");
    expect(smsResult.status).toBe("skipped");
    expect(global.fetch).toBe(originalFetch);
  });
});
