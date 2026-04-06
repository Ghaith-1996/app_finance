-- Phase 2 remediation:
-- - Stripe webhook idempotence state tracking
-- - single effective subscription row per user
-- - one active analysis run per portfolio
-- - feed retention supporting indexes
-- - atomic plan-aware AI quota consumption

ALTER TABLE billing_events
  ALTER COLUMN processed_at DROP NOT NULL;

ALTER TABLE billing_events
  ADD COLUMN IF NOT EXISTS processing_state TEXT,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

UPDATE billing_events
   SET processing_state = COALESCE(processing_state, 'processed')
 WHERE processing_state IS NULL;

ALTER TABLE billing_events
  ALTER COLUMN processing_state SET DEFAULT 'processed',
  ALTER COLUMN processing_state SET NOT NULL;

ALTER TABLE billing_events
  DROP CONSTRAINT IF EXISTS billing_events_processing_state_check;

ALTER TABLE billing_events
  ADD CONSTRAINT billing_events_processing_state_check
  CHECK (processing_state IN ('processing', 'processed', 'failed'));

WITH ranked_subscriptions AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY
        CASE
          WHEN status IN ('trialing', 'active') THEN 0
          WHEN status = 'past_due' AND current_period_end IS NOT NULL AND current_period_end > now() THEN 1
          ELSE 2
        END,
        COALESCE(current_period_end, to_timestamp(0)) DESC,
        updated_at DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM subscriptions
)
DELETE FROM subscriptions s
USING ranked_subscriptions ranked
WHERE s.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_id_unique
  ON subscriptions(user_id);

ALTER TYPE analysis_status ADD VALUE IF NOT EXISTS 'degraded';

WITH ranked_active_runs AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY portfolio_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM analysis_runs
  WHERE status IN ('queued', 'processing_holdings', 'mapping_news', 'generating_insights')
)
UPDATE analysis_runs runs
   SET status = 'failed',
       progress = 0,
       completed_at = COALESCE(runs.completed_at, now())
  FROM ranked_active_runs ranked
 WHERE runs.id = ranked.id
   AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_runs_active_portfolio_unique
  ON analysis_runs(portfolio_id)
  WHERE status IN ('queued', 'processing_holdings', 'mapping_news', 'generating_insights');

CREATE INDEX IF NOT EXISTS idx_feed_items_created_at
  ON feed_items(created_at);

CREATE INDEX IF NOT EXISTS idx_analysis_runs_portfolio_created_at
  ON analysis_runs(portfolio_id, created_at DESC);

ALTER FUNCTION get_ai_quota_status(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  SET search_path = public;

ALTER FUNCTION consume_ai_quota(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ)
  SET search_path = public;

ALTER FUNCTION consume_rate_limit(UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ)
  SET search_path = public;

CREATE OR REPLACE FUNCTION consume_ai_quota_for_user(
  p_user_id UUID,
  p_requested_tier TEXT,
  p_allow_tier_override BOOLEAN DEFAULT false,
  p_surface TEXT DEFAULT 'shared_ai',
  p_time_zone TEXT DEFAULT 'America/Toronto',
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  allowed BOOLEAN,
  denial_code TEXT,
  effective_plan_key TEXT,
  required_plan_key TEXT,
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
  v_plan_key TEXT := 'free';
  v_status TEXT;
  v_current_period_end TIMESTAMPTZ;
  v_required_plan TEXT := 'free';
  v_plan_rank INTEGER := 1;
  v_required_rank INTEGER := 1;
  v_quota RECORD;
BEGIN
  IF p_requested_tier NOT IN ('free', 'premium', 'ultimate') THEN
    RAISE EXCEPTION 'Unsupported model tier: %', p_requested_tier;
  END IF;

  SELECT s.plan_key, s.status, s.current_period_end
    INTO v_plan_key, v_status, v_current_period_end
    FROM subscriptions s
   WHERE s.user_id = p_user_id
   ORDER BY s.updated_at DESC, s.created_at DESC, s.id DESC
   LIMIT 1;

  IF NOT FOUND THEN
    v_plan_key := 'free';
  ELSIF v_plan_key NOT IN ('free', 'premium', 'ultimate') THEN
    v_plan_key := 'free';
  ELSIF NOT (
    v_status IN ('trialing', 'active')
    OR (v_status = 'past_due' AND v_current_period_end IS NOT NULL AND v_current_period_end > p_now)
  ) THEN
    v_plan_key := 'free';
  END IF;

  v_plan_rank := CASE v_plan_key
    WHEN 'ultimate' THEN 3
    WHEN 'premium' THEN 2
    ELSE 1
  END;

  v_required_plan := CASE p_requested_tier
    WHEN 'ultimate' THEN 'ultimate'
    WHEN 'premium' THEN 'premium'
    ELSE 'free'
  END;

  v_required_rank := CASE v_required_plan
    WHEN 'ultimate' THEN 3
    WHEN 'premium' THEN 2
    ELSE 1
  END;

  IF v_required_rank > v_plan_rank AND NOT COALESCE(p_allow_tier_override, false) THEN
    SELECT *
      INTO v_quota
      FROM get_ai_quota_status(
        p_user_id,
        v_plan_key,
        p_surface,
        p_time_zone,
        p_now
      );

    allowed := false;
    denial_code := 'plan_upgrade_required';
    effective_plan_key := v_plan_key;
    required_plan_key := v_required_plan;
    quota_limit := COALESCE(v_quota.quota_limit, 0);
    quota_used := COALESCE(v_quota.quota_used, 0);
    quota_remaining := COALESCE(v_quota.quota_remaining, 0);
    quota_window := COALESCE(v_quota.quota_window, 'day');
    resets_at := v_quota.resets_at;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT *
    INTO v_quota
    FROM consume_ai_quota(
      p_user_id,
      v_plan_key,
      p_surface,
      p_time_zone,
      p_now
    );

  allowed := COALESCE(v_quota.allowed, true);
  denial_code := CASE WHEN allowed THEN NULL ELSE 'quota_exceeded' END;
  effective_plan_key := v_plan_key;
  required_plan_key := NULL;
  quota_limit := COALESCE(v_quota.quota_limit, 0);
  quota_used := COALESCE(v_quota.quota_used, 0);
  quota_remaining := COALESCE(v_quota.quota_remaining, 0);
  quota_window := COALESCE(v_quota.quota_window, 'day');
  resets_at := v_quota.resets_at;
  RETURN NEXT;
END;
$$;
