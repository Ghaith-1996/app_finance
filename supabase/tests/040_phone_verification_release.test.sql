-- Review follow-up to H2: releasing an unsent attempt voids that code and refunds the send, and
-- cannot touch a different (newer) attempt. Only the service role may call it.
BEGIN;

INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-0000000040a1', 'phone-040@example.test');

DO $$
DECLARE
  u CONSTANT UUID := '00000000-0000-0000-0000-0000000040a1';
  r RECORD;
  released BOOLEAN;
BEGIN
  SELECT * INTO r FROM issue_phone_verification(u, '+14165551234', 'hash-1', now());
  ASSERT r.outcome = 'issued', 'issued';

  -- A different hash (e.g. a stale caller) releases nothing.
  released := release_phone_verification(u, 'hash-other');
  ASSERT NOT released, 'released a different attempt';

  released := release_phone_verification(u, 'hash-1');
  ASSERT released, 'release failed';
  ASSERT (SELECT code_hash FROM phone_verification_challenges WHERE user_id = u) IS NULL, 'code not voided';
  ASSERT (SELECT sends_in_window FROM phone_verification_challenges WHERE user_id = u) = 0, 'send not refunded';
  ASSERT confirm_phone_verification(u, '+14165551234', 'hash-1', now()) = 'no_challenge', 'released code still verifies';

  -- No cooldown after a release: the user can request again immediately.
  SELECT * INTO r FROM issue_phone_verification(u, '+14165551234', 'hash-2', now());
  ASSERT r.outcome = 'issued', format('reissue after release, got %s', r.outcome);

  -- Releasing twice is a no-op.
  ASSERT release_phone_verification(u, 'hash-2'), 'second release';
  ASSERT NOT release_phone_verification(u, 'hash-2'), 'double release';

  ASSERT NOT has_function_privilege('authenticated', 'release_phone_verification(uuid,text)', 'EXECUTE'), 'authenticated release';
  ASSERT NOT has_function_privilege('anon', 'release_phone_verification(uuid,text)', 'EXECUTE'), 'anon release';
  ASSERT has_function_privilege('service_role', 'release_phone_verification(uuid,text)', 'EXECUTE'), 'service release';
END $$;

ROLLBACK;
