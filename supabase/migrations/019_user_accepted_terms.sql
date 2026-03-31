-- Add accepted_terms_at to track Terms of Service acceptance
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.user_profiles.accepted_terms_at
  IS 'Timestamp when the user accepted the Terms of Service. NULL means not yet accepted.';
