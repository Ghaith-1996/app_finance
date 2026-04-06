-- Durable AI usage controls.
-- These tables remain server-only: application code and Stripe sync use the
-- service-role client, while authenticated users only receive derived state.

CREATE TABLE ai_usage_counters (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_type TEXT NOT NULL CHECK (bucket_type IN ('day', 'month')),
  bucket_start TIMESTAMPTZ NOT NULL,
  surface TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, bucket_type, bucket_start, surface)
);

CREATE TABLE rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  limiter_key TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_counters_user_bucket
  ON ai_usage_counters(user_id, bucket_type, bucket_start DESC, surface);

CREATE INDEX idx_rate_limit_events_lookup
  ON rate_limit_events(user_id, limiter_key, occurred_at);

CREATE TRIGGER ai_usage_counters_updated_at
  BEFORE UPDATE ON ai_usage_counters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE ai_usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION get_ai_quota_status(
  p_user_id UUID,
  p_plan_key TEXT,
  p_surface TEXT DEFAULT 'shared_ai',
  p_time_zone TEXT DEFAULT 'America/Toronto',
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  quota_limit INTEGER,
  quota_used INTEGER,
  quota_remaining INTEGER,
  quota_window TEXT,
  resets_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_window TEXT;
  v_bucket_start TIMESTAMPTZ;
  v_resets_at TIMESTAMPTZ;
  v_used INTEGER := 0;
BEGIN
  CASE p_plan_key
    WHEN 'free' THEN
      v_limit := 100;
      v_window := 'day';
    WHEN 'premium' THEN
      v_limit := 5000;
      v_window := 'month';
    WHEN 'ultimate' THEN
      v_limit := 20000;
      v_window := 'month';
    ELSE
      RAISE EXCEPTION 'Unsupported AI quota plan key: %', p_plan_key;
  END CASE;

  IF v_window = 'day' THEN
    v_bucket_start := timezone(
      p_time_zone,
      date_trunc('day', timezone(p_time_zone, p_now))
    );
    v_resets_at := timezone(
      p_time_zone,
      date_trunc('day', timezone(p_time_zone, p_now)) + interval '1 day'
    );
  ELSE
    v_bucket_start := timezone(
      p_time_zone,
      date_trunc('month', timezone(p_time_zone, p_now))
    );
    v_resets_at := timezone(
      p_time_zone,
      date_trunc('month', timezone(p_time_zone, p_now)) + interval '1 month'
    );
  END IF;

  SELECT used_count
    INTO v_used
    FROM ai_usage_counters
   WHERE user_id = p_user_id
     AND bucket_type = v_window
     AND bucket_start = v_bucket_start
     AND surface = coalesce(p_surface, 'shared_ai');

  quota_limit := v_limit;
  quota_used := coalesce(v_used, 0);
  quota_remaining := GREATEST(v_limit - quota_used, 0);
  quota_window := v_window;
  resets_at := v_resets_at;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION consume_ai_quota(
  p_user_id UUID,
  p_plan_key TEXT,
  p_surface TEXT DEFAULT 'shared_ai',
  p_time_zone TEXT DEFAULT 'America/Toronto',
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  allowed BOOLEAN,
  quota_limit INTEGER,
  quota_used INTEGER,
  quota_remaining INTEGER,
  quota_window TEXT,
  resets_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_window TEXT;
  v_bucket_start TIMESTAMPTZ;
  v_resets_at TIMESTAMPTZ;
  v_surface TEXT := coalesce(p_surface, 'shared_ai');
  v_used INTEGER := 0;
BEGIN
  CASE p_plan_key
    WHEN 'free' THEN
      v_limit := 100;
      v_window := 'day';
    WHEN 'premium' THEN
      v_limit := 5000;
      v_window := 'month';
    WHEN 'ultimate' THEN
      v_limit := 20000;
      v_window := 'month';
    ELSE
      RAISE EXCEPTION 'Unsupported AI quota plan key: %', p_plan_key;
  END CASE;

  IF v_window = 'day' THEN
    v_bucket_start := timezone(
      p_time_zone,
      date_trunc('day', timezone(p_time_zone, p_now))
    );
    v_resets_at := timezone(
      p_time_zone,
      date_trunc('day', timezone(p_time_zone, p_now)) + interval '1 day'
    );
  ELSE
    v_bucket_start := timezone(
      p_time_zone,
      date_trunc('month', timezone(p_time_zone, p_now))
    );
    v_resets_at := timezone(
      p_time_zone,
      date_trunc('month', timezone(p_time_zone, p_now)) + interval '1 month'
    );
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('ai_quota:' || p_user_id::text || ':' || v_surface || ':' || v_bucket_start::text)
  );

  SELECT used_count
    INTO v_used
    FROM ai_usage_counters
   WHERE user_id = p_user_id
     AND bucket_type = v_window
     AND bucket_start = v_bucket_start
     AND surface = v_surface;

  IF coalesce(v_used, 0) >= v_limit THEN
    allowed := false;
    quota_limit := v_limit;
    quota_used := coalesce(v_used, 0);
    quota_remaining := 0;
    quota_window := v_window;
    resets_at := v_resets_at;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO ai_usage_counters (
    user_id,
    bucket_type,
    bucket_start,
    surface,
    used_count
  )
  VALUES (
    p_user_id,
    v_window,
    v_bucket_start,
    v_surface,
    1
  )
  ON CONFLICT (user_id, bucket_type, bucket_start, surface)
  DO UPDATE
    SET used_count = ai_usage_counters.used_count + 1,
        updated_at = now()
  RETURNING ai_usage_counters.used_count INTO v_used;

  allowed := true;
  quota_limit := v_limit;
  quota_used := coalesce(v_used, 0);
  quota_remaining := GREATEST(v_limit - quota_used, 0);
  quota_window := v_window;
  resets_at := v_resets_at;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION consume_rate_limit(
  p_user_id UUID,
  p_limiter_key TEXT,
  p_window_seconds INTEGER,
  p_max_requests INTEGER,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  retry_after_ms INTEGER,
  resets_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_window INTERVAL := make_interval(secs => p_window_seconds);
  v_cutoff TIMESTAMPTZ := p_now - v_window;
  v_count INTEGER := 0;
  v_oldest TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('rate_limit:' || p_user_id::text || ':' || p_limiter_key)
  );

  DELETE FROM rate_limit_events
   WHERE user_id = p_user_id
     AND limiter_key = p_limiter_key
     AND occurred_at < v_cutoff;

  SELECT COUNT(*), MIN(occurred_at)
    INTO v_count, v_oldest
    FROM rate_limit_events
   WHERE user_id = p_user_id
     AND limiter_key = p_limiter_key
     AND occurred_at >= v_cutoff;

  IF v_count >= p_max_requests THEN
    allowed := false;
    remaining := 0;
    resets_at := coalesce(v_oldest, p_now) + v_window;
    retry_after_ms := GREATEST(
      FLOOR(EXTRACT(EPOCH FROM (resets_at - p_now)) * 1000)::INTEGER,
      0
    );
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO rate_limit_events (user_id, limiter_key, occurred_at)
  VALUES (p_user_id, p_limiter_key, p_now);

  allowed := true;
  remaining := GREATEST(p_max_requests - (v_count + 1), 0);
  resets_at := coalesce(v_oldest, p_now) + v_window;
  retry_after_ms := NULL;
  RETURN NEXT;
END;
$$;
