import type {
  NotificationPreferenceInput,
  NotificationPreferences,
} from "@/lib/notifications/types";

const E164_RE = /^\+[1-9]\d{7,14}$/;
export const DEFAULT_PRICE_MOVE_ALERT_THRESHOLD_PERCENT = 5;
export const DEFAULT_CONCENTRATION_ALERT_THRESHOLD_PERCENT = 35;
const MIN_PRICE_MOVE_ALERT_THRESHOLD_PERCENT = 1;
const MAX_PRICE_MOVE_ALERT_THRESHOLD_PERCENT = 50;
const MIN_CONCENTRATION_ALERT_THRESHOLD_PERCENT = 10;
const MAX_CONCENTRATION_ALERT_THRESHOLD_PERCENT = 90;

export function defaultNotificationPreferences(): NotificationPreferences {
  return {
    emailDigestEnabled: false,
    smsDigestEnabled: false,
    phoneNumber: "",
    criticalNewsAlertsEnabled: false,
    earningsReportAlertsEnabled: false,
    priceMoveAlertsEnabled: false,
    priceMoveThresholdPercent: DEFAULT_PRICE_MOVE_ALERT_THRESHOLD_PERCENT,
    concentrationAlertsEnabled: false,
    concentrationThresholdPercent: DEFAULT_CONCENTRATION_ALERT_THRESHOLD_PERCENT,
  };
}

function coerceThreshold(value: number, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
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
    criticalNewsAlertsEnabled: Boolean(input.criticalNewsAlertsEnabled),
    earningsReportAlertsEnabled: Boolean(input.earningsReportAlertsEnabled),
    priceMoveAlertsEnabled: Boolean(input.priceMoveAlertsEnabled),
    priceMoveThresholdPercent: coerceThreshold(
      input.priceMoveThresholdPercent,
      DEFAULT_PRICE_MOVE_ALERT_THRESHOLD_PERCENT,
    ),
    concentrationAlertsEnabled: Boolean(input.concentrationAlertsEnabled),
    concentrationThresholdPercent: coerceThreshold(
      input.concentrationThresholdPercent,
      DEFAULT_CONCENTRATION_ALERT_THRESHOLD_PERCENT,
    ),
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

  if (
    value.priceMoveThresholdPercent < MIN_PRICE_MOVE_ALERT_THRESHOLD_PERCENT ||
    value.priceMoveThresholdPercent > MAX_PRICE_MOVE_ALERT_THRESHOLD_PERCENT
  ) {
    return {
      ok: false,
      error: "Price move alert threshold must be between 1% and 50%.",
    };
  }

  if (
    value.concentrationThresholdPercent < MIN_CONCENTRATION_ALERT_THRESHOLD_PERCENT ||
    value.concentrationThresholdPercent > MAX_CONCENTRATION_ALERT_THRESHOLD_PERCENT
  ) {
    return {
      ok: false,
      error: "Concentration alert threshold must be between 10% and 90%.",
    };
  }

  return { ok: true, value };
}
