alter table user_profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

comment on column user_profiles.first_name is
  'Given name collected during profile completion/settings.';

comment on column user_profiles.last_name is
  'Family name collected during profile completion/settings.';
