-- Review follow-up to 038 (audit H2): a verification code that was never sent (SMS provider not
-- configured, request threw, or the provider definitively rejected it) must not use up the
-- user's resend cooldown or hourly allowance. The server releases exactly the attempt it issued:
-- the code is voided and the send is refunded. Attempts whose delivery is uncertain are kept.

CREATE OR REPLACE FUNCTION public.release_phone_verification(
  p_user_id UUID,
  p_code_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE phone_verification_challenges
  SET code_hash = NULL,
      sends_in_window = GREATEST(sends_in_window - 1, 0),
      last_sent_at = last_sent_at - interval '60 seconds'
  WHERE user_id = p_user_id
    AND code_hash = p_code_hash;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.release_phone_verification(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_phone_verification(UUID, TEXT) TO service_role;
