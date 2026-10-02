-- Audit H2: SMS digests require proof that the user controls the phone number.
--
-- user_notification_preferences is writable by its owner (RLS "FOR ALL"), so verification state
-- cannot live there. Verified numbers are kept in verified_phone_numbers, which only the server
-- (service role) writes; the digest sends SMS only when the saved number equals the verified one.
-- Codes are stored as hashes, expire after 10 minutes, allow 5 guesses, and sends are limited to
-- one per 60 seconds and 5 per rolling hour per user.

CREATE TABLE phone_verification_challenges (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  -- NULL once consumed; the row is kept so the send window survives a successful verification.
  code_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ NOT NULL,
  send_window_started_at TIMESTAMPTZ NOT NULL,
  sends_in_window INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE verified_phone_numbers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE phone_verification_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE verified_phone_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own verified phone"
  ON verified_phone_numbers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON phone_verification_challenges FROM anon, authenticated;
REVOKE ALL ON verified_phone_numbers FROM anon, authenticated;
GRANT SELECT ON verified_phone_numbers TO authenticated;

CREATE OR REPLACE FUNCTION public.issue_phone_verification(
  p_user_id UUID,
  p_phone TEXT,
  p_code_hash TEXT,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (outcome TEXT, retry_after_seconds INTEGER)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row phone_verification_challenges%ROWTYPE;
  v_window_open BOOLEAN;
BEGIN
  INSERT INTO phone_verification_challenges (
    user_id, phone_number, code_hash, expires_at, attempts, last_sent_at, send_window_started_at, sends_in_window
  )
  VALUES (p_user_id, p_phone, p_code_hash, p_now + interval '10 minutes', 0, p_now, p_now, 1)
  ON CONFLICT (user_id) DO NOTHING;

  IF FOUND THEN
    RETURN QUERY SELECT 'issued'::TEXT, 0;
    RETURN;
  END IF;

  SELECT * INTO v_row FROM phone_verification_challenges WHERE user_id = p_user_id FOR UPDATE;

  IF v_row.last_sent_at > p_now - interval '60 seconds' THEN
    RETURN QUERY SELECT 'cooldown'::TEXT,
      ceil(extract(epoch FROM (v_row.last_sent_at + interval '60 seconds' - p_now)))::INTEGER;
    RETURN;
  END IF;

  v_window_open := v_row.send_window_started_at > p_now - interval '1 hour';
  IF v_window_open AND v_row.sends_in_window >= 5 THEN
    RETURN QUERY SELECT 'hourly_limit'::TEXT,
      ceil(extract(epoch FROM (v_row.send_window_started_at + interval '1 hour' - p_now)))::INTEGER;
    RETURN;
  END IF;

  UPDATE phone_verification_challenges
  SET phone_number = p_phone,
      code_hash = p_code_hash,
      expires_at = p_now + interval '10 minutes',
      attempts = 0,
      last_sent_at = p_now,
      send_window_started_at = CASE WHEN v_window_open THEN send_window_started_at ELSE p_now END,
      sends_in_window = CASE WHEN v_window_open THEN sends_in_window + 1 ELSE 1 END
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT 'issued'::TEXT, 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_phone_verification(
  p_user_id UUID,
  p_phone TEXT,
  p_code_hash TEXT,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row phone_verification_challenges%ROWTYPE;
BEGIN
  -- Row lock serializes concurrent guesses, so the attempt cap cannot be exceeded.
  SELECT * INTO v_row FROM phone_verification_challenges WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND OR v_row.code_hash IS NULL OR v_row.phone_number <> p_phone THEN
    RETURN 'no_challenge';
  END IF;
  IF v_row.expires_at <= p_now THEN
    RETURN 'expired';
  END IF;
  IF v_row.attempts >= 5 THEN
    RETURN 'too_many_attempts';
  END IF;

  UPDATE phone_verification_challenges SET attempts = attempts + 1 WHERE user_id = p_user_id;

  IF v_row.code_hash <> p_code_hash THEN
    RETURN 'invalid';
  END IF;

  UPDATE phone_verification_challenges SET code_hash = NULL WHERE user_id = p_user_id;

  INSERT INTO verified_phone_numbers (user_id, phone_number, verified_at)
  VALUES (p_user_id, p_phone, p_now)
  ON CONFLICT (user_id) DO UPDATE
    SET phone_number = EXCLUDED.phone_number, verified_at = EXCLUDED.verified_at;

  RETURN 'verified';
END;
$$;

REVOKE ALL ON FUNCTION public.issue_phone_verification(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_phone_verification(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.confirm_phone_verification(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_phone_verification(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
