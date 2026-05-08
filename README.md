# Pulsefolio

Next.js app for portfolio monitoring, market/news ingestion, and AI-assisted article analysis.

## Local run

```bash
npm install
npm run dev
```

The app reads runtime configuration from `.env.example`. Create `.env.local` or `.env` from that file before starting the dev server.

Minimum local env required to boot the app:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

If either is missing, the app will now fail with a repo-specific `[env] Missing required environment variable` message instead of the generic Supabase runtime error.

## AI providers

Select the active provider with `AI_PROVIDER`.

- `azure`: Azure OpenAI Responses API. Configure `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`, and `AZURE_OPENAI_MODEL` with your GPT-5.2 deployment name.
- `openrouter`: Keeps the existing StepFun setup via `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`.
- `openai`: Public OpenAI API using `OPENAI_API_KEY`.
- `anthropic`: Anthropic API using `ANTHROPIC_API_KEY`.

For Azure GPT-5.2, set:

```env
AI_PROVIDER=azure
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_BASE_URL=https://your-resource.openai.azure.com
AZURE_OPENAI_MODEL=gpt-5.2
AZURE_OPENAI_REASONING_EFFORT=medium
```

`AZURE_OPENAI_BASE_URL` can be either the resource root or the full `/openai/v1/` base URL. `AZURE_OPENAI_MODEL` should match the Azure deployment name, not just the model family.

## Smoke tests

```bash
node --env-file=.env scripts/test-azure-openai.mjs
node --env-file=.env scripts/test-openrouter.mjs
```

## GitHub Actions news scheduler

Production news ingestion and analysis are driven by `app/api/news/cron/route.ts`, but the scheduler now lives in `.github/workflows/news-cron.yml`.

The workflow:

- runs every 20 minutes at `7,27,47` minutes past the hour in UTC
- also supports manual `workflow_dispatch`
- runs `python -m workers.news_ingestion.cron_runner` on the GitHub runner to build the ingest payload
- `POST`s that JSON payload to the deployed production `/api/news/cron` endpoint with `Authorization: Bearer <CRON_SECRET>`

Required GitHub repository secrets:

- `CRON_ENDPOINT` - full production URL for the cron route, for example `https://your-app.vercel.app/api/news/cron`
- `CRON_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEWSAPI_KEY` - if NewsAPI ingestion is enabled
- `EDGAR_IDENTITY` - if EDGAR ingestion is enabled
- `FINNHUB_API_KEY` - if Finnhub ingestion is enabled

Required Vercel production env vars for the route itself:

- `CRON_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- AI provider envs used by enrichment (`AI_PROVIDER` plus the matching provider credentials)

## GitHub Actions daily digest scheduler

Morning digest notifications are driven by `app/api/notifications/daily-digest/cron/route.ts` and scheduled from `.github/workflows/daily-digest.yml`.

The workflow:

- runs at `0,15,30,45 13,14 * * *` in UTC
- also supports manual `workflow_dispatch`
- `POST`s the deployed production `/api/notifications/daily-digest/cron` endpoint with `Authorization: Bearer <DIGEST_CRON_SECRET>`
- relies on the route to gate execution to the real `9:00 AM America/New_York` hour so DST stays correct without hard-coding DST rules in GitHub Actions

Required GitHub repository secrets:

- `DIGEST_CRON_ENDPOINT` - full production URL for the digest route, for example `https://your-app.vercel.app/api/notifications/daily-digest/cron`
- `DIGEST_CRON_SECRET`

Required production env vars for digest delivery:

- `DIGEST_CRON_SECRET`
- `RESEND_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `APP_BASE_URL` - canonical public app origin used in digest email and SMS links
- optional `NEXT_PUBLIC_SITE_URL` or `NEXT_PUBLIC_APP_URL` as lower-priority fallbacks when `APP_BASE_URL` is not set

Notes:

- Scheduled GitHub Actions workflows run on the latest commit of the default branch only.
- Schedule times are interpreted in UTC.
- GitHub can delay or drop scheduled workflows during high-load periods, especially near the top of the hour, which is why the workflow uses an offset schedule instead of `0,20,40`.
- Public repositories can have scheduled workflows disabled automatically after 60 days of inactivity.
- Digest links now prefer the configured canonical app URL and only fall back to a trusted runtime request origin when no app URL env is configured.
- Before relying on the schedule, run the workflow once with `workflow_dispatch` and confirm GitHub Actions can execute `python -m workers.news_ingestion.cron_runner` and the deployed route accepts the `POST` payload.

