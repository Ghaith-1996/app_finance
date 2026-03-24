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

## GitHub Actions news scheduler

Production news ingestion and analysis are driven by `app/api/news/cron/route.ts`, but the scheduler now lives in `.github/workflows/news-cron.yml`.

The workflow:

- runs every 20 minutes at `7,27,47` minutes past the hour in UTC
- also supports manual `workflow_dispatch`
- calls the deployed production `GET /api/news/cron` endpoint with `Authorization: Bearer <CRON_SECRET>`

Required GitHub repository secrets:

- `CRON_ENDPOINT` - full production URL for the cron route, for example `https://your-app.vercel.app/api/news/cron`
- `CRON_SECRET`

Required Vercel production env vars for the route itself:

- `CRON_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEWSAPI_KEY`
- `EDGAR_IDENTITY`
- `FINNHUB_API_KEY`
- AI provider envs used by enrichment (`AI_PROVIDER` plus the matching provider credentials)

Notes:

- Scheduled GitHub Actions workflows run on the latest commit of the default branch only.
- Schedule times are interpreted in UTC.
- GitHub can delay or drop scheduled workflows during high-load periods, especially near the top of the hour, which is why the workflow uses an offset schedule instead of `0,20,40`.
- Public repositories can have scheduled workflows disabled automatically after 60 days of inactivity.
- Before relying on the schedule, run the workflow once with `workflow_dispatch` and confirm the deployed environment can execute `runPythonWorker()`.
