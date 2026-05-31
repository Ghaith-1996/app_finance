-- Keep profile completion/legal fields private while preserving community authors.
--
-- user_profiles now contains first_name, last_name, and accepted_terms_at.
-- Those fields are account/private state and should not be broadly readable
-- by every authenticated user. Community surfaces should read this safe view.

CREATE OR REPLACE VIEW public.public_user_profiles AS
SELECT
  user_id,
  NULLIF(handle, '') AS display_name,
  avatar_url,
  handle
FROM public.user_profiles;

COMMENT ON VIEW public.public_user_profiles IS
  'Public profile projection for community UI. Does not expose first_name, last_name, or accepted_terms_at.';

GRANT SELECT ON public.public_user_profiles TO authenticated;

DROP POLICY IF EXISTS "Users can read all profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;

CREATE POLICY "Users can read own profile"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
