import { beforeEach, describe, expect, it, vi } from "vitest";

const authGetUser = vi.fn();
const upsert = vi.fn();
const maybeSingle = vi.fn();
const mocked = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocked.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: authGetUser,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle,
        }),
      }),
      upsert,
    }),
  }),
}));

import {
  getCurrentUserNotificationPreferences,
  saveCurrentUserNotificationPreferences,
} from "@/lib/actions/notifications";

const smartAlertDefaults = {
  criticalNewsAlertsEnabled: false,
  earningsReportAlertsEnabled: false,
  priceMoveAlertsEnabled: false,
  priceMoveThresholdPercent: 5,
  concentrationAlertsEnabled: false,
  concentrationThresholdPercent: 35,
};

describe("notification preferences actions", () => {
  beforeEach(() => {
    authGetUser.mockReset();
    upsert.mockReset();
    maybeSingle.mockReset();
    mocked.revalidatePath.mockReset();
    authGetUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
    });
    upsert.mockResolvedValue({ error: null });
    maybeSingle.mockResolvedValue({ data: null });
  });

  it("loads defaults when the user has no saved preferences", async () => {
    const result = await getCurrentUserNotificationPreferences();

    expect(result).toEqual({
      emailDigestEnabled: false,
      smsDigestEnabled: false,
      phoneNumber: "",
      ...smartAlertDefaults,
    });
  });

  it("saves email-only preferences", async () => {
    const result = await saveCurrentUserNotificationPreferences({
      emailDigestEnabled: true,
      smsDigestEnabled: false,
      phoneNumber: "",
      ...smartAlertDefaults,
    });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        email_digest_enabled: true,
        sms_digest_enabled: false,
        phone_number: null,
        critical_news_alerts_enabled: false,
        earnings_report_alerts_enabled: false,
        price_move_alerts_enabled: false,
        price_move_threshold_percent: 5,
        concentration_alerts_enabled: false,
        concentration_threshold_percent: 35,
      },
      { onConflict: "user_id" },
    );
  });

  it("saves sms-only preferences when the phone number is valid", async () => {
    const result = await saveCurrentUserNotificationPreferences({
      emailDigestEnabled: false,
      smsDigestEnabled: true,
      phoneNumber: "+14165551234",
      ...smartAlertDefaults,
    });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        email_digest_enabled: false,
        sms_digest_enabled: true,
        phone_number: "+14165551234",
        critical_news_alerts_enabled: false,
        earnings_report_alerts_enabled: false,
        price_move_alerts_enabled: false,
        price_move_threshold_percent: 5,
        concentration_alerts_enabled: false,
        concentration_threshold_percent: 35,
      },
      { onConflict: "user_id" },
    );
  });

  it("saves both channels together", async () => {
    const result = await saveCurrentUserNotificationPreferences({
      emailDigestEnabled: true,
      smsDigestEnabled: true,
      phoneNumber: "+14165551234",
      criticalNewsAlertsEnabled: true,
      earningsReportAlertsEnabled: true,
      priceMoveAlertsEnabled: true,
      priceMoveThresholdPercent: 7.5,
      concentrationAlertsEnabled: true,
      concentrationThresholdPercent: 30,
    });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        email_digest_enabled: true,
        sms_digest_enabled: true,
        phone_number: "+14165551234",
        critical_news_alerts_enabled: true,
        earnings_report_alerts_enabled: true,
        price_move_alerts_enabled: true,
        price_move_threshold_percent: 7.5,
        concentration_alerts_enabled: true,
        concentration_threshold_percent: 30,
      },
      { onConflict: "user_id" },
    );
  });

  it("rejects invalid phone formats when sms is enabled", async () => {
    const result = await saveCurrentUserNotificationPreferences({
      emailDigestEnabled: false,
      smsDigestEnabled: true,
      phoneNumber: "416-555-1234",
      ...smartAlertDefaults,
    });

    expect(result).toEqual({
      ok: false,
      error: "Phone number must use E.164 format, for example +14165551234.",
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects out-of-range smart alert thresholds", async () => {
    const result = await saveCurrentUserNotificationPreferences({
      emailDigestEnabled: false,
      smsDigestEnabled: false,
      phoneNumber: "",
      ...smartAlertDefaults,
      priceMoveAlertsEnabled: true,
      priceMoveThresholdPercent: 75,
    });

    expect(result).toEqual({
      ok: false,
      error: "Price move alert threshold must be between 1% and 50%.",
    });
    expect(upsert).not.toHaveBeenCalled();
  });
});
