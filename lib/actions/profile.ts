"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  defaultHandle,
  deriveNamesFromMetadata,
  type UserProfileData,
  validateProfileInput,
} from "@/lib/profile/utils";
import { sanitizeExternalUrl } from "@/lib/security/external-url";
import { sanitizeRedirect } from "@/lib/security/redirect";

type UserProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
  accepted_terms_at: string | null;
};

export async function getCurrentUserProfile(): Promise<UserProfileData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("user_profiles")
    .select("user_id, first_name, last_name, display_name, avatar_url, handle, accepted_terms_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const derived = deriveNamesFromMetadata(meta);
  const row = (data as UserProfileRow | null) ?? null;

  return {
    firstName: row?.first_name?.trim() || derived.firstName,
    lastName: row?.last_name?.trim() || derived.lastName,
    handle: row?.handle?.trim() || defaultHandle(user),
    displayName:
      row?.display_name?.trim() ||
      `${row?.first_name?.trim() || derived.firstName} ${row?.last_name?.trim() || derived.lastName}`.trim(),
    avatarUrl: sanitizeExternalUrl(
      row?.avatar_url ||
      (meta.avatar_url as string | undefined) ||
      (meta.picture as string | undefined) ||
      null,
    ),
    acceptedTermsAt: row?.accepted_terms_at ?? null,
  };
}

export async function saveCurrentUserProfile(input: {
  firstName: string;
  lastName: string;
  handle: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const validation = validateProfileInput(input);
  if (!validation.ok) return { ok: false, error: validation.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: "Unauthorized" };

  const { firstName, lastName, handle, displayName } = validation.value;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const rawAvatarUrl =
    (meta.avatar_url as string | undefined) ||
    (meta.picture as string | undefined) ||
    null;
  const avatarUrl = sanitizeExternalUrl(rawAvatarUrl);

  const { data: existingHandle } = await supabase
    .from("user_profiles")
    .select("user_id")
    .eq("handle", handle)
    .maybeSingle();

  if (existingHandle && existingHandle.user_id !== user.id) {
    return { ok: false, error: "That username is already taken." };
  }

  const payload = {
    user_id: user.id,
    first_name: firstName,
    last_name: lastName,
    display_name: displayName,
    handle,
    avatar_url: avatarUrl,
  };

  const { error } = await supabase
    .from("user_profiles")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    if (error.message.toLowerCase().includes("idx_user_profiles_handle")) {
      return { ok: false, error: "That username is already taken." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/home");
  revalidatePath("/settings");
  revalidatePath("/complete-profile");

  return { ok: true };
}

export async function completeProfileAction(input: {
  firstName: string;
  lastName: string;
  handle: string;
  acceptTerms?: boolean;
  redirectTo?: string;
}): Promise<{ ok: false; error: string } | never> {
  if (!input.acceptTerms) {
    return { ok: false, error: "You must accept the Terms of Service to continue." };
  }

  const result = await saveCurrentUserProfile(input);
  if (!result.ok) return result;

  // Record ToS acceptance
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("user_profiles")
      .update({ accepted_terms_at: new Date().toISOString() })
      .eq("user_id", user.id);
  }

  redirect(sanitizeRedirect(input.redirectTo?.trim(), "/portfolio"));
}
