import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseServiceRoleKey, requireSupabaseUrl } from "@/lib/env";

/**
 * Server-only Supabase client using the service-role key.
 * Does NOT require cookies — suitable for cron jobs and background tasks.
 */
export function createServiceClient() {
  const url = requireSupabaseUrl();
  const key = requireSupabaseServiceRoleKey();
  return createSupabaseClient(url, key);
}
