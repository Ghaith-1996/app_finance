import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseAnonKey, requireSupabaseUrl } from "@/lib/env";

export function createClient() {
  const url = requireSupabaseUrl();
  const anonKey = requireSupabaseAnonKey();

  return createBrowserClient(
    url,
    anonKey
  );
}
