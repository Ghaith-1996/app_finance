-- Audit H2: SMS digests require proof of phone possession. Verified numbers live in a table only
-- the server can write; codes are single-use, expire, cap guesses and cap sends.
BEGIN;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000002a1', 'phone-h2@example.test'),
  ('00000000-0000-0000-0000-0000000002a2', 'phone-h2-other@example.test');

DO $$
DECLARE
  u CONSTANT UUID := '00000000-0000-0000-0000-0000000002a1';
  t0 CONSTANT TIMESTAMPTZ := '2026-10-02T12:00:00Z';
  r RECORD;
  outcome TEXT;
BEGIN
  -- First send is issued; an immediate resend hits the 60s cooldown.
  SELECT * INTO r FROM issue_phone_verification(u, '+14165551234', 'hash-1', t0);
  ASSERT r.outcome = 'issued', 'first send';
  SELECT * INTO r FROM issue_phone_verification(u, '+14165551234', 'hash-x', t0 + interval '30 seconds');
  ASSERT r.outcome = 'cooldown' AND r.retry_after_seconds = 30, format('cooldown, got %s/%s', r.outcome, r.retry_after_seconds);
  ASSERT (SELECT code_hash FROM phone_verification_challenges WHERE user_id = u) = 'hash-1', 'cooldown must not replace the code';

  -- A code for another number does not verify this one.
  outcome := confirm_phone_verification(u, '+14165559999', 'hash-1', t0 + interval '1 minute');
  ASSERT outcome = 'no_challenge', format('wrong phone, got %s', outcome);

  -- Wrong guesses are counted; the 6th attempt is refused even with the right code.
  FOR i IN 1..5 LOOP
    outcome := confirm_phone_verification(u, '+14165551234', 'wrong', t0 + interval '1 minute');
    ASSERT outcome = 'invalid', format('guess %s, got %s', i, outcome);
  END LOOP;
  outcome := confirm_phone_verification(u, '+14165551234', 'hash-1', t0 + interval '1 minute');
  ASSERT outcome = 'too_many_attempts', format('attempt cap, got %s', outcome);
  ASSERT NOT EXISTS (SELECT 1 FROM verified_phone_numbers WHERE user_id = u), 'nothing verified yet';

  -- A new code resets attempts; an expired code is refused.
  SELECT * INTO r FROM issue_phone_verification(u, '+14165551234', 'hash-2', t0 + interval '2 minutes');
  ASSERT r.outcome = 'issued', 'second send';
  outcome := confirm_phone_verification(u, '+14165551234', 'hash-2', t0 + interval '13 minutes');
  ASSERT outcome = 'expired', format('expiry, got %s', outcome);

  -- Right code within the window verifies, and the code cannot be reused.
  SELECT * INTO r FROM issue_phone_verification(u, '+14165551234', 'hash-3', t0 + interval '14 minutes');
  ASSERT r.outcome = 'issued', 'third send';
  outcome := confirm_phone_verification(u, '+14165551234', 'hash-3', t0 + interval '15 minutes');
  ASSERT outcome = 'verified', format('verify, got %s', outcome);
  ASSERT (SELECT phone_number FROM verified_phone_numbers WHERE user_id = u) = '+14165551234', 'verified row';
  outcome := confirm_phone_verification(u, '+14165551234', 'hash-3', t0 + interval '15 minutes');
  ASSERT outcome = 'no_challenge', format('reuse, got %s', outcome);

  -- At most 5 sends per rolling hour (3 used so far in this window).
  SELECT * INTO r FROM issue_phone_verification(u, '+14165551234', 'hash-4', t0 + interval '16 minutes');
  ASSERT r.outcome = 'issued', 'fourth send';
  SELECT * INTO r FROM issue_phone_verification(u, '+14165551234', 'hash-5', t0 + interval '17 minutes');
  ASSERT r.outcome = 'issued', 'fifth send';
  SELECT * INTO r FROM issue_phone_verification(u, '+14165551234', 'hash-6', t0 + interval '18 minutes');
  ASSERT r.outcome = 'hourly_limit' AND r.retry_after_seconds = 42 * 60, format('hourly cap, got %s/%s', r.outcome, r.retry_after_seconds);
  SELECT * INTO r FROM issue_phone_verification(u, '+14165551234', 'hash-7', t0 + interval '61 minutes');
  ASSERT r.outcome = 'issued', 'window resets after an hour';
END $$;

-- Users cannot write verification state or call the functions; they can read their own verified row.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000002a2","role":"authenticated"}', true);
DO $$
BEGIN
  BEGIN
    INSERT INTO verified_phone_numbers (user_id, phone_number)
      VALUES ('00000000-0000-0000-0000-0000000002a2', '+14165550000');
    RAISE EXCEPTION 'authenticated user wrote verified_phone_numbers';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM phone_verification_challenges;
    RAISE EXCEPTION 'authenticated user read challenges';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM confirm_phone_verification('00000000-0000-0000-0000-0000000002a2', '+14165550000', 'x');
    RAISE EXCEPTION 'authenticated user called confirm_phone_verification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT NOT EXISTS (SELECT 1 FROM verified_phone_numbers), 'another user''s verified row is visible';
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'issue_phone_verification(uuid,text,text,timestamptz)', 'EXECUTE'), 'anon issue';
  ASSERT has_function_privilege('service_role', 'issue_phone_verification(uuid,text,text,timestamptz)', 'EXECUTE'), 'service issue';
  ASSERT has_function_privilege('service_role', 'confirm_phone_verification(uuid,text,text,timestamptz)', 'EXECUTE'), 'service confirm';
END $$;

ROLLBACK;
