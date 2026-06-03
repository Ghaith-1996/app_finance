"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

function normalizeNewsItemId(newsItemId: string): string | null {
  const value = newsItemId.trim();
  return value.length >= 8 ? value : null;
}

export async function getSavedArticleState(newsItemId: string): Promise<boolean> {
  const normalized = normalizeNewsItemId(newsItemId);
  if (!normalized) return false;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("user_saved_articles")
    .select("id")
    .eq("user_id", user.id)
    .eq("news_item_id", normalized)
    .maybeSingle();

  return Boolean(data?.id);
}

export async function setSavedArticleState(
  newsItemId: string,
  saved: boolean,
): Promise<{ ok: true; saved: boolean } | { ok: false; error: string }> {
  const normalized = normalizeNewsItemId(newsItemId);
  if (!normalized) return { ok: false, error: "Invalid article." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  if (saved) {
    const { error } = await supabase
      .from("user_saved_articles")
      .upsert(
        {
          user_id: user.id,
          news_item_id: normalized,
          saved_at: new Date().toISOString(),
        },
        { onConflict: "user_id,news_item_id", ignoreDuplicates: true },
      );

    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("user_saved_articles")
      .delete()
      .eq("user_id", user.id)
      .eq("news_item_id", normalized);

    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/saved");
  revalidatePath("/feed");
  revalidatePath("/home");
  return { ok: true, saved };
}
