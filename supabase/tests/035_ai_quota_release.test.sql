-- Audit H5: a released reservation returns exactly one unit to the bucket that was charged,
-- and the quota functions are callable only by the service role.
BEGIN;

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000005a1', 'quota-h5@example.test');

DO $$
DECLARE
  u CONSTANT UUID := '00000000-0000-0000-0000-0000000005a1';
  r RECORD;
  late_r RECORD;
  remaining INTEGER;
BEGIN
  -- Free plan: daily window in America/Toronto. Reserve twice at 23:50 local on Oct 1.
  SELECT * INTO r FROM consume_ai_quota(u, 'free', 'shared_ai', 'America/Toronto', '2026-10-02T03:50:00Z');
  ASSERT r.allowed AND r.quota_used = 1, 'first reservation';
  SELECT * INTO r FROM consume_ai_quota(u, 'free', 'shared_ai', 'America/Toronto', '2026-10-02T03:50:00Z');
  ASSERT r.quota_used = 2, 'second reservation';

  -- A reservation made just after local midnight belongs to the next day's bucket.
  SELECT * INTO late_r FROM consume_ai_quota(u, 'free', 'shared_ai', 'America/Toronto', '2026-10-02T04:10:00Z');
  ASSERT late_r.quota_used = 1, 'next-day bucket starts at 1';

  -- Releasing the Oct 1 reservation (identified by its window + resets_at) after midnight still
  -- refunds the Oct 1 bucket, not the current one.
  remaining := release_ai_quota(u, r.quota_window, r.resets_at, 'shared_ai', 'America/Toronto');
  ASSERT remaining = 1, format('Oct 1 bucket should drop to 1, got %s', remaining);
  ASSERT (SELECT used_count FROM ai_usage_counters
          WHERE user_id = u AND bucket_start = r.resets_at - interval '1 day') = 1, 'wrong bucket refunded';
  ASSERT (SELECT used_count FROM ai_usage_counters
          WHERE user_id = u AND bucket_start = late_r.resets_at - interval '1 day') = 1, 'current bucket touched';

  -- Never below zero.
  PERFORM release_ai_quota(u, r.quota_window, r.resets_at, 'shared_ai', 'America/Toronto');
  remaining := release_ai_quota(u, r.quota_window, r.resets_at, 'shared_ai', 'America/Toronto');
  ASSERT remaining = 0, 'release must not go negative';

  -- Monthly window (premium) round-trips too.
  SELECT * INTO r FROM consume_ai_quota(u, 'premium', 'shared_ai', 'America/Toronto', '2026-10-15T12:00:00Z');
  remaining := release_ai_quota(u, r.quota_window, r.resets_at, 'shared_ai', 'America/Toronto');
  ASSERT remaining = 0, 'monthly release';

  -- Only the service role may call these functions (they accept arbitrary user ids).
  ASSERT NOT has_function_privilege('anon', 'release_ai_quota(uuid,text,timestamptz,text,text)', 'EXECUTE'), 'anon release';
  ASSERT NOT has_function_privilege('authenticated', 'release_ai_quota(uuid,text,timestamptz,text,text)', 'EXECUTE'), 'authenticated release';
  ASSERT NOT has_function_privilege('authenticated', 'consume_ai_quota_for_user(uuid,text,boolean,text,text,timestamptz)', 'EXECUTE'), 'authenticated consume';
  ASSERT NOT has_function_privilege('anon', 'consume_rate_limit(uuid,text,integer,integer,timestamptz)', 'EXECUTE'), 'anon rate limit';
  ASSERT NOT has_function_privilege('authenticated', 'get_ai_quota_status(uuid,text,text,text,timestamptz)', 'EXECUTE'), 'authenticated status';
  ASSERT has_function_privilege('service_role', 'release_ai_quota(uuid,text,timestamptz,text,text)', 'EXECUTE'), 'service role release';
  ASSERT has_function_privilege('service_role', 'consume_ai_quota_for_user(uuid,text,boolean,text,text,timestamptz)', 'EXECUTE'), 'service role consume';
END $$;

ROLLBACK;
