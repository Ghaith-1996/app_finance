-- Audit J5 acceptance: concurrent claims -> exactly one sender; confirmed failures retry;
-- uncertain sends are never replayed; stale workers cannot overwrite newer outcomes.

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000005b1', 'digest-j5@example.test');
INSERT INTO notification_digests (id, user_id, digest_date, window_start, window_end, source_mode, summary_line) VALUES
  ('00000000-0000-0000-0000-00000000d501', '00000000-0000-0000-0000-0000000005b1', '2026-10-01', now() - interval '1 day', now(), 'portfolio', 'race'),
  ('00000000-0000-0000-0000-00000000d502', '00000000-0000-0000-0000-0000000005b1', '2026-10-02', now() - interval '1 day', now(), 'portfolio', 'rules');

-- 1. Two real sessions claim the same SMS delivery at the same time: exactly one may send.
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT set_config('pf.dblink_host', :'DBLINK_HOST', false);

DO $$
DECLARE
  conn TEXT := format('dbname=postgres user=postgres password=postgres host=%s', current_setting('pf.dblink_host'));
  call CONSTANT TEXT := 'SELECT action FROM claim_notification_delivery(''00000000-0000-0000-0000-00000000d501'', ''sms'')';
  a_action TEXT;
  b_action TEXT;
  waited BOOLEAN;
BEGIN
  PERFORM dblink_connect('claim_a', conn);
  PERFORM dblink_connect('claim_b', conn);
  PERFORM dblink_exec('claim_a', 'SET ROLE service_role');
  PERFORM dblink_exec('claim_b', 'SET ROLE service_role');

  -- A claims inside an open transaction; B's claim must wait on the unique key, then lose.
  PERFORM dblink_exec('claim_a', 'BEGIN');
  SELECT x INTO a_action FROM dblink('claim_a', call) AS t(x TEXT);
  PERFORM dblink_send_query('claim_b', call);
  PERFORM pg_sleep(0.3);
  waited := dblink_is_busy('claim_b') = 1;
  PERFORM dblink_exec('claim_a', 'COMMIT');
  SELECT x INTO b_action FROM dblink_get_result('claim_b') AS t(x TEXT);
  PERFORM * FROM dblink_get_result('claim_b') AS t(x TEXT);
  PERFORM dblink_disconnect('claim_a');
  PERFORM dblink_disconnect('claim_b');

  ASSERT waited, 'second claimer did not wait';
  ASSERT a_action = 'send' AND b_action = 'skip', format('claims: A=%s B=%s', a_action, b_action);
  ASSERT (SELECT count(*) FROM notification_deliveries WHERE digest_id = '00000000-0000-0000-0000-00000000d501') = 1,
    'duplicate delivery rows';
END $$;

-- 2. Status rules (rolled back).
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  d CONSTANT UUID := '00000000-0000-0000-0000-00000000d502';
  c RECORD;
  stale_token UUID;
  ok BOOLEAN;
BEGIN
  -- Confirmed rejection (e.g. 429) is retried; the old token cannot complete afterwards.
  SELECT * INTO c FROM claim_notification_delivery(d, 'sms');
  ASSERT c.action = 'send' AND c.attempt_count = 1, format('first claim %s', c);
  stale_token := c.claim_token;
  ASSERT complete_notification_delivery(d, 'sms', c.claim_token, 'failed', NULL, 'Too Many Requests'), 'complete failed';
  SELECT * INTO c FROM claim_notification_delivery(d, 'sms');
  ASSERT c.action = 'send' AND c.attempt_count = 2, format('retry after confirmed failure %s', c);
  ok := complete_notification_delivery(d, 'sms', stale_token, 'sent', 'SM-old', NULL);
  ASSERT NOT ok, 'a stale worker overwrote the current attempt';
  ASSERT complete_notification_delivery(d, 'sms', c.claim_token, 'sent', 'SM123', NULL), 'complete sent';
  SELECT * INTO c FROM claim_notification_delivery(d, 'sms');
  ASSERT c.action = 'skip' AND c.status = 'sent', 'sent delivery claimed again';

  -- Uncertain (possibly accepted) is never replayed.
  SELECT * INTO c FROM claim_notification_delivery(d, 'email');
  ASSERT complete_notification_delivery(d, 'email', c.claim_token, 'uncertain', NULL, 'timeout'), 'complete uncertain';
  SELECT * INTO c FROM claim_notification_delivery(d, 'email');
  ASSERT c.action = 'skip' AND c.status = 'uncertain', format('uncertain replayed %s', c);

  -- Attempt cap on repeated confirmed failures.
  UPDATE notification_deliveries SET status = 'failed', attempt_count = 3, claim_token = NULL
  WHERE digest_id = d AND channel = 'email';
  SELECT * INTO c FROM claim_notification_delivery(d, 'email', 3);
  ASSERT c.action = 'skip' AND c.status = 'failed', format('attempt cap ignored %s', c);

  -- A fresh pending claim blocks others; a stale SMS claim becomes uncertain, a stale email claim is reclaimed.
  DELETE FROM notification_deliveries WHERE digest_id = d;
  SELECT * INTO c FROM claim_notification_delivery(d, 'sms');
  SELECT * INTO c FROM claim_notification_delivery(d, 'sms');
  ASSERT c.action = 'skip' AND c.status = 'pending', 'in-flight claim was not respected';
  UPDATE notification_deliveries SET claimed_at = now() - interval '1 hour' WHERE digest_id = d AND channel = 'sms';
  SELECT * INTO c FROM claim_notification_delivery(d, 'sms');
  ASSERT c.action = 'skip' AND c.status = 'uncertain', format('stale sms %s', c);

  SELECT * INTO c FROM claim_notification_delivery(d, 'email');
  UPDATE notification_deliveries SET claimed_at = now() - interval '1 hour' WHERE digest_id = d AND channel = 'email';
  SELECT * INTO c FROM claim_notification_delivery(d, 'email');
  ASSERT c.action = 'send' AND c.attempt_count = 2, format('stale email not reclaimed %s', c);
END $$;
ROLLBACK;

DO $$
BEGIN
  ASSERT NOT has_function_privilege('authenticated', 'claim_notification_delivery(uuid,text,integer,interval)', 'EXECUTE'), 'authenticated claim';
  ASSERT NOT has_function_privilege('anon', 'complete_notification_delivery(uuid,text,uuid,text,text,text)', 'EXECUTE'), 'anon complete';
END $$;
