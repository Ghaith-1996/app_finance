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
};

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
    .select("email_digest_enabled, sms_digest_enabled, phone_number")
    .eq("user_id", user.id)
    .maybeSingle();

  const row = (data as PreferenceRow | null) ?? null;
  return {
    emailDigestEnabled: Boolean(row?.email_digest_enabled),
    smsDigestEnabled: Boolean(row?.sms_digest_enabled),
    phoneNumber: row?.phone_number?.trim() ?? "",
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
      },
      { onConflict: "user_id" },
    );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/settings");
  return { ok: true };
}
