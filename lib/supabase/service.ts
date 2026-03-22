import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service-role key.
 * Does NOT require cookies — suitable for cron jobs and background tasks.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return createSupabaseClient(url, key);
}
