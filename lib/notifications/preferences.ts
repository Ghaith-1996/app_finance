import type {
  NotificationPreferenceInput,
  NotificationPreferences,
} from "@/lib/notifications/types";

const E164_RE = /^\+[1-9]\d{7,14}$/;

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    emailDigestEnabled: false,
    smsDigestEnabled: false,
    phoneNumber: "",
  };
}

export function validateNotificationPreferenceInput(
  input: NotificationPreferenceInput,
):
  | { ok: true; value: NotificationPreferences }
  | { ok: false; error: string } {
  const value = {
    emailDigestEnabled: Boolean(input.emailDigestEnabled),
    smsDigestEnabled: Boolean(input.smsDigestEnabled),
    phoneNumber: input.phoneNumber.trim(),
  } satisfies NotificationPreferences;

  if (value.smsDigestEnabled && !value.phoneNumber) {
    return {
      ok: false,
      error: "Enter a phone number in E.164 format to enable SMS digests.",
    };
  }

  if (value.phoneNumber && !E164_RE.test(value.phoneNumber)) {
    return {
      ok: false,
      error: "Phone number must use E.164 format, for example +14165551234.",
    };
  }

  return { ok: true, value };
}
