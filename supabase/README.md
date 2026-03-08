# Supabase migrations

Run the initial schema in one of these ways:

1. **Supabase Dashboard**: Open your project → SQL Editor → paste the contents of `migrations/001_initial_schema.sql` → Run.

2. **Supabase CLI**: From this directory run `supabase db push` (or `supabase migration up`) after linking your project with `supabase link`.

After running, ensure your app's `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
