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
    });
  });

  it("saves email-only preferences", async () => {
    const result = await saveCurrentUserNotificationPreferences({
      emailDigestEnabled: true,
      smsDigestEnabled: false,
      phoneNumber: "",
    });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        email_digest_enabled: true,
        sms_digest_enabled: false,
        phone_number: null,
      },
      { onConflict: "user_id" },
    );
  });

  it("saves sms-only preferences when the phone number is valid", async () => {
    const result = await saveCurrentUserNotificationPreferences({
      emailDigestEnabled: false,
      smsDigestEnabled: true,
      phoneNumber: "+14165551234",
    });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        email_digest_enabled: false,
        sms_digest_enabled: true,
        phone_number: "+14165551234",
      },
      { onConflict: "user_id" },
    );
  });

  it("saves both channels together", async () => {
    const result = await saveCurrentUserNotificationPreferences({
      emailDigestEnabled: true,
      smsDigestEnabled: true,
      phoneNumber: "+14165551234",
    });

    expect(result).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-1",
        email_digest_enabled: true,
        sms_digest_enabled: true,
        phone_number: "+14165551234",
      },
      { onConflict: "user_id" },
    );
  });

  it("rejects invalid phone formats when sms is enabled", async () => {
    const result = await saveCurrentUserNotificationPreferences({
      emailDigestEnabled: false,
      smsDigestEnabled: true,
      phoneNumber: "416-555-1234",
    });

    expect(result).toEqual({
      ok: false,
      error: "Phone number must use E.164 format, for example +14165551234.",
    });
    expect(upsert).not.toHaveBeenCalled();
  });
});
