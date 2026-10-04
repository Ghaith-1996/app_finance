import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Audit H2: SMS digests go only to a number the user proved they control. Code expiry, guess and
// send limits are proven against Postgres in supabase/tests/038_sms_phone_verification.test.sql.
// No message is sent: the Twilio adapters are mocked.

const currentService = vi.hoisted(() => ({ value: null as unknown }));
const sendDigestSmsMock = vi.hoisted(() => vi.fn());
const sendTwilioSmsMock = vi.hoisted(() => vi.fn());
const twilioConfigured = vi.hoisted(() => ({ value: true }));
const userSession = vi.hoisted(() => ({
  verifiedPhone: null as string | null,
  upsert: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => currentService.value }));
vi.mock("@/lib/notifications/delivery", () => ({
  sendDigestEmail: vi.fn(),
  sendDigestSms: (...args: unknown[]) => sendDigestSmsMock(...args),
  sendTwilioSms: (...args: unknown[]) => sendTwilioSmsMock(...args),
  isTwilioConfigured: () => twilioConfigured.value,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data:
              table === "verified_phone_numbers" && userSession.verifiedPhone
                ? { phone_number: userSession.verifiedPhone }
                : null,
          }),
        }),
      }),
      upsert: userSession.upsert,
    }),
  }),
}));

import { saveCurrentUserNotificationPreferences } from "@/lib/actions/notifications";
import { runDailyDigestCron } from "@/lib/notifications/daily-digest";
import {
  confirmPhoneVerificationCodeForUser,
  sendPhoneVerificationCodeForUser,
} from "@/lib/notifications/phone-verification";
import { createMockServiceSupabase } from "@/tests/helpers/mock-service-supabase";

const PHONE = "+14165551234";
const prefs = {
  emailDigestEnabled: false,
  smsDigestEnabled: true,
  phoneNumber: PHONE,
  criticalNewsAlertsEnabled: false,
  earningsReportAlertsEnabled: false,
  priceMoveAlertsEnabled: false,
  priceMoveThresholdPercent: 5,
  concentrationAlertsEnabled: false,
  concentrationThresholdPercent: 35,
};

function rpcClient(answer: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data: answer, error: null });
  currentService.value = { rpc };
  return rpc;
}

beforeEach(() => {
  sendDigestSmsMock.mockReset();
  sendTwilioSmsMock.mockReset();
  twilioConfigured.value = true;
  userSession.upsert.mockReset().mockResolvedValue({ error: null });
  userSession.verifiedPhone = null;
});

describe("saving SMS preferences", () => {
  it("rejects enabling SMS for an unverified number and writes nothing", async () => {
    const result = await saveCurrentUserNotificationPreferences(prefs);
    expect(result).toEqual({ ok: false, error: "Verify this phone number before enabling SMS digests." });
    expect(userSession.upsert).not.toHaveBeenCalled();
  });

  it("rejects a number different from the verified one", async () => {
    userSession.verifiedPhone = "+14165550000";
    const result = await saveCurrentUserNotificationPreferences(prefs);
    expect(result.ok).toBe(false);
    expect(userSession.upsert).not.toHaveBeenCalled();
  });

  it("saves when the number is verified, and email-only never needs verification", async () => {
    userSession.verifiedPhone = PHONE;
    expect(await saveCurrentUserNotificationPreferences(prefs)).toEqual({ ok: true });

    userSession.verifiedPhone = null;
    expect(
      await saveCurrentUserNotificationPreferences({ ...prefs, emailDigestEnabled: true, smsDigestEnabled: false }),
    ).toEqual({ ok: true });
  });
});

describe("digest SMS recipients", () => {
  const NOW = new Date("2026-01-15T14:00:00.000Z");

  function setupDigest(verified: Array<{ user_id: string; phone_number: string }>) {
    currentService.value = createMockServiceSupabase({
      db: {
        verified_phone_numbers: verified,
        user_notification_preferences: [
          { user_id: "user-1", email_digest_enabled: false, sms_digest_enabled: true, phone_number: PHONE },
        ],
        notification_digests: [
          {
            id: "digest-1",
            user_id: "user-1",
            digest_date: "2026-01-15",
            time_zone: "America/New_York",
            window_start: "2026-01-14T22:00:00.000Z",
            window_end: "2026-01-15T14:00:00.000Z",
            source_mode: "portfolio",
            portfolio_id: "portfolio-1",
            portfolio_name: "Main",
            summary_line: "Bullish leaders: AAPL.",
            bullish_symbols: ["AAPL"],
            bearish_symbols: [],
            top_stories: [],
          },
        ],
      },
    });
  }

  const run = () => runDailyDigestCron({ now: NOW, request: new Request("https://pulsefolio.example/api/x") });

  it("does not text a number that was never verified (e.g. written directly to the preferences row)", async () => {
    setupDigest([]);
    await run();
    expect(sendDigestSmsMock).not.toHaveBeenCalled();
  });

  it("does not text a number changed after verification", async () => {
    setupDigest([{ user_id: "user-1", phone_number: "+14165550000" }]);
    await run();
    expect(sendDigestSmsMock).not.toHaveBeenCalled();
  });

  it("texts the verified number", async () => {
    setupDigest([{ user_id: "user-1", phone_number: PHONE }]);
    sendDigestSmsMock.mockResolvedValue({
      channel: "sms",
      status: "sent",
      digestId: "digest-1",
      providerMessageId: "SM1",
      errorText: null,
    });
    await run();
    expect(sendDigestSmsMock).toHaveBeenCalledTimes(1);
    expect(sendDigestSmsMock.mock.calls[0][0]).toMatchObject({ phoneNumber: PHONE });
  });
});

describe("sending a verification code", () => {
  it("stores only a hash bound to user + number and texts the code", async () => {
    const rpc = rpcClient([{ outcome: "issued", retry_after_seconds: 0 }]);
    sendTwilioSmsMock.mockResolvedValue({ status: "sent", providerMessageId: "SM1", errorText: null });

    const result = await sendPhoneVerificationCodeForUser("user-1", PHONE, { generateCode: () => "042917" });

    expect(result).toEqual({ ok: true });
    const expectedHash = createHash("sha256").update(`user-1:${PHONE}:042917`).digest("hex");
    expect(rpc).toHaveBeenCalledWith("issue_phone_verification", {
      p_user_id: "user-1",
      p_phone: PHONE,
      p_code_hash: expectedHash,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("042917");
    expect(sendTwilioSmsMock).toHaveBeenCalledWith(PHONE, expect.stringContaining("042917"));
  });

  it("does not text when the database refuses the send (cooldown / hourly cap)", async () => {
    rpcClient([{ outcome: "cooldown", retry_after_seconds: 42 }]);
    expect(await sendPhoneVerificationCodeForUser("user-1", PHONE)).toMatchObject({
      ok: false,
      error: "Please wait 42 seconds before requesting another code.",
      retryAfterSeconds: 42,
    });

    rpcClient([{ outcome: "hourly_limit", retry_after_seconds: 2520 }]);
    expect(await sendPhoneVerificationCodeForUser("user-1", PHONE)).toMatchObject({
      ok: false,
      error: "Too many codes requested. Try again in 42 minutes.",
    });
    expect(sendTwilioSmsMock).not.toHaveBeenCalled();
  });

  it("says an ambiguous provider result may still deliver, instead of claiming failure", async () => {
    rpcClient([{ outcome: "issued", retry_after_seconds: 0 }]);
    sendTwilioSmsMock.mockResolvedValue({ status: "uncertain", providerMessageId: null, errorText: "timeout" });
    const result = await sendPhoneVerificationCodeForUser("user-1", PHONE);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toMatch(/could not confirm/i);
  });
});

describe("confirming a verification code", () => {
  it("rejects malformed codes without touching the database", async () => {
    const rpc = rpcClient("verified");
    expect(await confirmPhoneVerificationCodeForUser("user-1", PHONE, "12ab56")).toEqual({
      ok: false,
      error: "Enter the 6-digit code from the text message.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["verified", true],
    ["invalid", false],
    ["expired", false],
    ["too_many_attempts", false],
    ["no_challenge", false],
  ])("database outcome %s → ok=%s", async (outcome, ok) => {
    const rpc = rpcClient(outcome);
    const result = await confirmPhoneVerificationCodeForUser("user-1", PHONE, " 123456 ");
    expect(result.ok).toBe(ok);
    expect(rpc).toHaveBeenCalledWith("confirm_phone_verification", {
      p_user_id: "user-1",
      p_phone: PHONE,
      p_code_hash: createHash("sha256").update(`user-1:${PHONE}:123456`).digest("hex"),
    });
  });
});

// PR review: a code that was never sent must not consume the cooldown or hourly allowance.
describe("unsent verification codes", () => {
  const issued = [{ outcome: "issued", retry_after_seconds: 0 }];
  const hashFor = (code: string) => createHash("sha256").update(`user-1:${PHONE}:${code}`).digest("hex");

  it("does not issue a code at all when Twilio is not configured", async () => {
    const rpc = rpcClient(issued);
    twilioConfigured.value = false;

    const result = await sendPhoneVerificationCodeForUser("user-1", PHONE);

    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/unavailable/i) });
    expect(rpc).not.toHaveBeenCalled();
    expect(sendTwilioSmsMock).not.toHaveBeenCalled();
  });

  it("returns a controlled error and releases the attempt when sending throws", async () => {
    const rpc = rpcClient(issued);
    sendTwilioSmsMock.mockRejectedValue(new Error("Missing TWILIO_AUTH_TOKEN"));

    const result = await sendPhoneVerificationCodeForUser("user-1", PHONE, { generateCode: () => "111111" });

    expect(result.ok).toBe(false);
    expect(rpc).toHaveBeenCalledWith("release_phone_verification", { p_user_id: "user-1", p_code_hash: hashFor("111111") });
  });

  it("releases the attempt when Twilio definitively rejects the message", async () => {
    const rpc = rpcClient(issued);
    sendTwilioSmsMock.mockResolvedValue({ status: "failed", providerMessageId: null, errorText: "invalid number" });

    await sendPhoneVerificationCodeForUser("user-1", PHONE, { generateCode: () => "222222" });

    expect(rpc).toHaveBeenCalledWith("release_phone_verification", { p_user_id: "user-1", p_code_hash: hashFor("222222") });
  });

  it("keeps the attempt when delivery is uncertain", async () => {
    const rpc = rpcClient(issued);
    sendTwilioSmsMock.mockResolvedValue({ status: "uncertain", providerMessageId: null, errorText: "timeout" });

    await sendPhoneVerificationCodeForUser("user-1", PHONE);

    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["issue_phone_verification"]);
  });
});
