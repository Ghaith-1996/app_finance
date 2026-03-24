# Portfolio Signal

Next.js app for portfolio monitoring, market/news ingestion, and AI-assisted article analysis.

## Local run

```bash
npm install
npm run dev
```

The app reads runtime configuration from `.env.example`. Copy the required values into `.env`.

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

## Vercel cron

Production news ingestion and analysis are driven by `app/api/news/cron/route.ts` on a 20-minute schedule via `vercel.json`.

Required Vercel project env vars for cron:

- `CRON_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEWSAPI_KEY`
- `EDGAR_IDENTITY`
- `FINNHUB_API_KEY`
- AI provider envs used by enrichment (`AI_PROVIDER` plus the matching provider credentials)

Notes:

- Vercel cron jobs invoke the route with `GET`, so the route supports both `GET` and `POST`.
- The 20-minute cadence requires a Vercel plan that supports sub-daily cron schedules.
- Cron jobs run on production deployments only.
- Before relying on the schedule, manually call the route once with `Authorization: Bearer <CRON_SECRET>` to confirm the deployed environment can execute `runPythonWorker()`.
