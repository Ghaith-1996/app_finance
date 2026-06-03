"use server";

import { revalidatePath } from "next/cache";

import {
  defaultNotificationPreferences,
  validateNotificationPreferenceInput,
} from "@/lib/notifications/preferences";
import type {
  NotificationPreferenceInput,
  NotificationPreferences,
} from "@/lib/notifications/types";
import { createClient } from "@/lib/supabase/server";

type PreferenceRow = {
  email_digest_enabled: boolean | null;
  sms_digest_enabled: boolean | null;
  phone_number: string | null;
  critical_news_alerts_enabled: boolean | null;
  earnings_report_alerts_enabled: boolean | null;
  price_move_alerts_enabled: boolean | null;
  price_move_threshold_percent: number | string | null;
  concentration_alerts_enabled: boolean | null;
  concentration_threshold_percent: number | string | null;
};

function numericPreference(value: number | string | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getCurrentUserNotificationPreferences(): Promise<NotificationPreferences> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return defaultNotificationPreferences();
  }

  const { data } = await supabase
    .from("user_notification_preferences")
    .select(
      "email_digest_enabled, sms_digest_enabled, phone_number, critical_news_alerts_enabled, earnings_report_alerts_enabled, price_move_alerts_enabled, price_move_threshold_percent, concentration_alerts_enabled, concentration_threshold_percent",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  const row = (data as PreferenceRow | null) ?? null;
  const defaults = defaultNotificationPreferences();
  return {
    emailDigestEnabled: Boolean(row?.email_digest_enabled),
    smsDigestEnabled: Boolean(row?.sms_digest_enabled),
    phoneNumber: row?.phone_number?.trim() ?? "",
    criticalNewsAlertsEnabled: Boolean(row?.critical_news_alerts_enabled),
    earningsReportAlertsEnabled: Boolean(row?.earnings_report_alerts_enabled),
    priceMoveAlertsEnabled: Boolean(row?.price_move_alerts_enabled),
    priceMoveThresholdPercent: numericPreference(
      row?.price_move_threshold_percent,
      defaults.priceMoveThresholdPercent,
    ),
    concentrationAlertsEnabled: Boolean(row?.concentration_alerts_enabled),
    concentrationThresholdPercent: numericPreference(
      row?.concentration_threshold_percent,
      defaults.concentrationThresholdPercent,
    ),
  };
}

export async function saveCurrentUserNotificationPreferences(
  input: NotificationPreferenceInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validation = validateNotificationPreferenceInput(input);
  if (!validation.ok) {
    return validation;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("user_notification_preferences")
    .upsert(
      {
        user_id: user.id,
        email_digest_enabled: validation.value.emailDigestEnabled,
        sms_digest_enabled: validation.value.smsDigestEnabled,
        phone_number: validation.value.phoneNumber || null,
        critical_news_alerts_enabled: validation.value.criticalNewsAlertsEnabled,
        earnings_report_alerts_enabled: validation.value.earningsReportAlertsEnabled,
        price_move_alerts_enabled: validation.value.priceMoveAlertsEnabled,
        price_move_threshold_percent: validation.value.priceMoveThresholdPercent,
        concentration_alerts_enabled: validation.value.concentrationAlertsEnabled,
        concentration_threshold_percent: validation.value.concentrationThresholdPercent,
      },
      { onConflict: "user_id" },
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  return { ok: true };
}
