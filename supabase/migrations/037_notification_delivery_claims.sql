-- Audit J5: one worker per delivery attempt, and safe retries.
--
-- claim_notification_delivery atomically decides whether the caller may contact the provider.
-- Exactly one concurrent caller receives a claim token (conditional insert, or row-locked update).
-- complete_notification_delivery records the outcome only for the current token, so a worker
-- whose stale claim was taken over cannot overwrite the newer outcome.
--
-- Status semantics:
--   pending    a worker holds the claim (claim_token/claimed_at)
--   sent       provider accepted
--   skipped    nothing to send (e.g. no phone number)
--   failed     provider confirmed non-acceptance -> retried on a later run, up to p_max_attempts
--   uncertain  the provider may have accepted (timeout, network error, 5xx) -> never auto-resent
-- A stale SMS claim becomes uncertain (it may have been sent). A stale email claim is reclaimed,
-- because email sends carry a provider idempotency key.

ALTER TABLE notification_deliveries
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claim_token UUID,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Existing rows: one attempt already happened for anything not pending-from-before.
UPDATE notification_deliveries SET attempt_count = 1 WHERE attempt_count = 0;

CREATE OR REPLACE FUNCTION public.claim_notification_delivery(
  p_digest_id UUID,
  p_channel TEXT,
  p_max_attempts INTEGER DEFAULT 3,
  p_stale_after INTERVAL DEFAULT interval '10 minutes'
)
RETURNS TABLE (action TEXT, claim_token UUID, status TEXT, attempt_count INTEGER)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_token UUID := gen_random_uuid();
  v_row notification_deliveries%ROWTYPE;
BEGIN
  IF p_channel NOT IN ('email', 'sms') THEN
    RAISE EXCEPTION 'Unsupported channel %', p_channel USING ERRCODE = '22023';
  END IF;

  INSERT INTO notification_deliveries AS d (digest_id, channel, status, attempt_count, claim_token, claimed_at)
  VALUES (p_digest_id, p_channel, 'pending', 1, v_token, now())
  ON CONFLICT ON CONSTRAINT notification_deliveries_digest_channel_unique DO NOTHING;

  IF FOUND THEN
    RETURN QUERY SELECT 'send'::TEXT, v_token, 'pending'::TEXT, 1;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM notification_deliveries d
  WHERE d.digest_id = p_digest_id AND d.channel = p_channel
  FOR UPDATE;

  IF v_row.status IN ('sent', 'skipped', 'uncertain') THEN
    RETURN QUERY SELECT 'skip'::TEXT, NULL::UUID, v_row.status, v_row.attempt_count;
    RETURN;
  END IF;

  IF v_row.status = 'pending' THEN
    IF coalesce(v_row.claimed_at, v_row.updated_at) > now() - p_stale_after THEN
      -- Another worker is (or recently was) sending.
      RETURN QUERY SELECT 'skip'::TEXT, NULL::UUID, 'pending'::TEXT, v_row.attempt_count;
      RETURN;
    END IF;
    IF p_channel = 'sms' THEN
      UPDATE notification_deliveries d
      SET status = 'uncertain',
          claim_token = NULL,
          error_text = coalesce(d.error_text,
            'SMS delivery state became stale before confirmation; automatic resend was blocked to avoid duplicates.')
      WHERE d.id = v_row.id;
      RETURN QUERY SELECT 'skip'::TEXT, NULL::UUID, 'uncertain'::TEXT, v_row.attempt_count;
      RETURN;
    END IF;
  END IF;

  -- failed (confirmed non-acceptance) or a stale email claim: retry if attempts remain.
  IF v_row.attempt_count >= p_max_attempts THEN
    RETURN QUERY SELECT 'skip'::TEXT, NULL::UUID, v_row.status, v_row.attempt_count;
    RETURN;
  END IF;

  UPDATE notification_deliveries d
  SET status = 'pending',
      claim_token = v_token,
      claimed_at = now(),
      attempt_count = d.attempt_count + 1
  WHERE d.id = v_row.id;

  RETURN QUERY SELECT 'send'::TEXT, v_token, 'pending'::TEXT, v_row.attempt_count + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_notification_delivery(
  p_digest_id UUID,
  p_channel TEXT,
  p_claim_token UUID,
  p_status TEXT,
  p_provider_message_id TEXT,
  p_error_text TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('sent', 'skipped', 'failed', 'uncertain') THEN
    RAISE EXCEPTION 'Unsupported final status %', p_status USING ERRCODE = '22023';
  END IF;

  UPDATE notification_deliveries
  SET status = p_status,
      provider_message_id = p_provider_message_id,
      error_text = p_error_text,
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END,
      claim_token = NULL
  WHERE digest_id = p_digest_id
    AND channel = p_channel
    AND claim_token = p_claim_token
    AND status = 'pending';

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_delivery(UUID, TEXT, INTEGER, INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_delivery(UUID, TEXT, INTEGER, INTERVAL) TO service_role;
REVOKE ALL ON FUNCTION public.complete_notification_delivery(UUID, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_notification_delivery(UUID, TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;
