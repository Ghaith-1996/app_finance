"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

function validId(value: string): boolean {
  return value.trim().length >= 8;
}

export async function markAlertRead(
  alertId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!validId(alertId)) return { ok: false, error: "Invalid alert." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("notification_alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("id", alertId)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/alerts");
  revalidatePath("/home");
  return { ok: true };
}

export async function markAllAlertsRead(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase
    .from("notification_alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/alerts");
  revalidatePath("/home");
  return { ok: true };
}
