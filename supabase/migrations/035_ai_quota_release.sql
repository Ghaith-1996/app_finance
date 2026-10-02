-- Audit H5: failed AI requests must not count against the user's quota (product decision 2026-10-02).
--
-- consume_ai_quota_for_user still reserves one unit before generation so concurrent requests cannot
-- overspend. When the request then fails (provider error/timeout, storage failure), the application
-- calls release_ai_quota with the window and reset time returned by the reservation, which identifies
-- exactly the bucket that was charged even if the request crossed a reset boundary.
-- The burst limiter (consume_rate_limit) is intentionally not refunded: it is abuse protection.

CREATE OR REPLACE FUNCTION public.release_ai_quota(
  p_user_id UUID,
  p_quota_window TEXT,
  p_resets_at TIMESTAMPTZ,
  p_surface TEXT DEFAULT 'shared_ai',
  p_time_zone TEXT DEFAULT 'America/Toronto'
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_surface TEXT := coalesce(p_surface, 'shared_ai');
  v_bucket_start TIMESTAMPTZ;
  v_used INTEGER;
BEGIN
  -- Inverse of consume_ai_quota: resets_at = bucket_start + 1 day/month in the quota time zone.
  IF p_quota_window = 'day' THEN
    v_bucket_start := timezone(p_time_zone, timezone(p_time_zone, p_resets_at) - interval '1 day');
  ELSIF p_quota_window = 'month' THEN
    v_bucket_start := timezone(p_time_zone, timezone(p_time_zone, p_resets_at) - interval '1 month');
  ELSE
    RAISE EXCEPTION 'Unsupported AI quota window: %', p_quota_window USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('ai_quota:' || p_user_id::text || ':' || v_surface || ':' || v_bucket_start::text)
  );

  UPDATE ai_usage_counters
  SET used_count = GREATEST(used_count - 1, 0),
      updated_at = now()
  WHERE user_id = p_user_id
    AND bucket_type = p_quota_window
    AND bucket_start = v_bucket_start
    AND surface = v_surface
  RETURNING used_count INTO v_used;

  RETURN coalesce(v_used, 0);
END;
$$;

-- These functions take an arbitrary user id and are only meant for the server (service role).
-- Supabase's default privileges grant EXECUTE to anon/authenticated; remove that.
REVOKE ALL ON FUNCTION public.release_ai_quota(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_ai_quota(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.consume_ai_quota_for_user(UUID, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota_for_user(UUID, TEXT, BOOLEAN, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.get_ai_quota_status(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_quota_status(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.consume_rate_limit(UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ) TO service_role;
