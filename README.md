# Pulsefolio

Pulsefolio monitors portfolios and watchlists, ingests market news and provides AI-assisted article and portfolio analysis.
It uses Next.js App Router, React, TypeScript, Tailwind, Supabase Auth/Postgres and a Python ingestion worker.
CSV import and manual entry persist holdings; there is no live brokerage connection or trade execution.
The public `/demo` is an interactive, scripted sample. Its allocations and stories are not a user's live account.

## Architecture and user journeys

Browser components provide interaction; server pages/actions use the authenticated Supabase session.
The browser client, session server client and server-only service-role client have different privileges.
Service-role credentials and server environment variables must never enter browser bundles.
Ownership, RLS, runtime validation, billing rights, quotas and Turnstile checks remain required at their respective boundaries.

Python fetches, normalizes and upserts raw articles into the global `news_items` pool.
TypeScript enriches the durable backlog and analyzes it for portfolios, producing personalized `feed_items` and insights.
The scheduled Python runner runs on GitHub Actions, then posts its JSON payload to the deployed cron route.
The workflow subsequently drains enrichment/extraction and portfolio analysis. A successful ingest is not proof that later stages succeeded.
Current and candidate ingestion share later enrichment/analysis endpoints but have distinct ingestion secrets and source sets.

- `/onboarding`: CSV/manual import, preview and persisted replace/merge operations.
- `/portfolio` and `/portfolio/full`: stored holdings, USD valuation, explicit quote freshness and hourly history.
- `/watchlist`: saved symbols, Finnhub search/quotes and Twelve Data detail information.
- `/feed`: personal/market feeds, article detail, saved stories and article chat; `/feed?story=<id>` selects a story.
- `/analysis`: automatic run status and results; the UI does not expose a public manual news-refresh operation.
- `/home`: portfolio summary and timely next actions. `/community`: protected social posts and comments.
- `/settings`: profile, preferences, subscriptions, notifications and SMS possession verification.

Deprecated `/api/news/refresh` and `/api/news/ingest` remain admin/debug tools.
Admin job health is exposed at `GET /api/admin/job-health`; authorization is mandatory.
Read task instructions in [AGENTS.md](AGENTS.md) before modifying the repository.

## Local startup

From the repository root:

```bash
npm ci
npm run dev
```

Create local configuration from [`.env.example`](.env.example); never commit or print secret values.
The minimum auth configuration is `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Server data/jobs additionally need `SUPABASE_SERVICE_ROLE_KEY`; missing configuration is not an authenticated working product.
Use a separate development Supabase project with the required migrations and Auth redirect URLs configured.
OAuth requires the corresponding provider configuration; local installation does not verify an OAuth round trip.
`npm run build` builds production assets; `npm run start` serves those assets.
Provider configuration is needed for the features below, not just for startup.

## AI providers and transports

`AI_PROVIDER` selects general enrichment/analysis through [lib/services/ai/index.ts](lib/services/ai/index.ts).
Unrecognized or absent values use the public OpenAI implementation.
Five provider paths are maintained:

| ID | Transport | Configuration names |
|---|---|---|
| `azure` | Azure OpenAI Responses | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_MODEL` (or `AZURE_OPENAI_DEPLOYMENT`), optional `AZURE_OPENAI_REASONING_EFFORT` |
| `openrouter` | OpenRouter chat completions; StepFun default | `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_APP_NAME` |
| `mistral` | Mistral chat completions | `MISTRAL_API_KEY`, optional `MISTRAL_MODEL` |
| `openai` | Public OpenAI chat completions | `OPENAI_API_KEY` |
| `anthropic` | Anthropic Messages | `ANTHROPIC_API_KEY` |

Azure's base URL accepts the resource root or `/openai/v1/`; the model identifies the deployed Azure deployment.
An Azure AI Foundry agent endpoint is not an Azure OpenAI Responses endpoint.
OpenRouter defaults to `stepfun/step-3.5-flash:free`; retain this path unless explicitly authorized to remove it.
Defaults and validation live in the provider modules and [lib/env.ts](lib/env.ts), not in an independently maintained model catalog.
Article chat and portfolio copilot select by model tier: `free` → OpenRouter, `premium` → Mistral, `ultimate` → Azure.
[lib/billing/plans.ts](lib/billing/plans.ts) defines tier rights; [lib/security/ai-access.ts](lib/security/ai-access.ts) enforces billing, burst and durable quota checks.
Failed answer requests release the charged quota bucket on a best-effort basis; failed requests still count against burst limits.
`AI_PROVIDER` does not override this tier routing.

Provider smoke scripts make external requests and require explicit authorization, even when a model is labelled free:

```bash
node --env-file=.env scripts/test-openrouter.mjs
node --env-file=.env scripts/test-azure-openai.mjs
```

These scripts verify a provider path, not a complete user workflow. They were not run by the documentation consolidation.

## Data and worker prerequisites

Apply required migrations before deploying dependent code. Follow [supabase/README.md](supabase/README.md).
Historical duplicate prefixes require checking each environment's ledger; do not blindly rename or replay migrations.
Docker, Bash and a disposable local Supabase Postgres container are prerequisites for the SQL validator.
It builds a fresh schema, replays upgrade seeds and exercises real SQL/concurrency tests; it does not validate a deployed project's state.

From the repository root, install the Python dependencies locked by CI:

```bash
python -m pip install --require-hashes -r requirements.lock
python -m workers.news_ingestion.main --check
```

See [worker troubleshooting](workers/news_ingestion/TROUBLESHOOTING.md) for sources, candidate preflight and diagnostics.
The preflight validates configuration/imports/cache paths, not remote ingestion or provider availability.
A local Next.js admin/debug worker launch needs Python on the server PATH; scheduled ingestion uses Python on the GitHub runner.
Do not run a real cron runner as an ordinary local check: it fetches external sources and writes through service-role access.

## Verification commands and evidence

These commands exist in the current scripts/workflow sources; their presence is not a successful execution record:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
python -B -m unittest discover -s workers/news_ingestion/tests -t .
bash scripts/db/validate-migrations.sh
```

`npm run test:watch` supports local Vitest iteration. There is no `npm run db:validate` script.
Keep results tied to a commit/working-tree state, command, runtime, initial data and real versus simulated layers.
Mocks can verify application failure handling; they cannot prove database locking, rollback, RLS or atomic quotas.
SQL execution cannot by itself prove OAuth, browser behavior, a real news source or live AI operation.
[TEST_AUDIT.md](TEST_AUDIT.md) records the dated test cleanup decisions; its counters are historical.
The local E2E runner below executes real application layers with external HTTP fixtures. Check each run's assertion results for the exact sub-oracles exercised; its existence alone does not establish complete coverage or verify OAuth and live providers.
Provider smoke scripts are not E2E coverage. Current quality-gate results belong to the implementation reports, not inherited claims in this guide.
Ordinary deterministic checks must avoid real paid generations, emails, SMS and payments.

## Schedulers

GitHub scheduled jobs use UTC and the default branch. Verify workflow presence, Actions enablement and secrets in the target repository.
Schedules can be delayed or dropped; inspect actual runs and durable state rather than assuming the nominal cadence.
A manual dispatch and a scheduled run against staging remain deployment checks, not proofs supplied by these YAML files.

| Job / workflow | UTC schedule | POST endpoint | GitHub endpoint / bearer secret |
|---|---|---|---|
| Current news: [news-cron.yml](.github/workflows/news-cron.yml) | `7,27,47 * * * *` | `/api/news/cron` | `CRON_ENDPOINT` / `CRON_SECRET` |
| Candidate news: [news-cron-v2.yml](.github/workflows/news-cron-v2.yml) | Manual dispatch only | `/api/news/cron/v2` | `NEWS_V2_CRON_ENDPOINT` / `NEWS_V2_CRON_SECRET` |
| Daily digest: [daily-digest.yml](.github/workflows/daily-digest.yml) | `0,15,30,45 13,14 * * *` | `/api/notifications/daily-digest/cron` | `DIGEST_CRON_ENDPOINT` / `DIGEST_CRON_SECRET` |
| Value snapshots: [portfolio-value-snapshots.yml](.github/workflows/portfolio-value-snapshots.yml) | `5 * * * *` | `/api/portfolio/value-snapshots/cron` | Base derived from `CRON_ENDPOINT` / `CRON_SECRET` |
| Earnings: [earnings-report-sync.yml](.github/workflows/earnings-report-sync.yml) | `17 9 * * *` | `/api/earnings-reports/cron` | `EARNINGS_REPORTS_CRON_ENDPOINT` / `CRON_SECRET` |
| Smart alerts: [smart-alerts.yml](.github/workflows/smart-alerts.yml) | `*/15 * * * *` | `/api/notifications/smart-alerts/cron` | `SMART_ALERTS_CRON_ENDPOINT` / `SMART_ALERTS_CRON_SECRET` or `CRON_SECRET` |

All endpoints require their configured bearer token; the GitHub endpoint must include the full deployed route path.
News workflows require `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the runner.
Current uses `python -m workers.news_ingestion.cron_runner`: EDGAR, NewsAPI, GNews and targeted Finnhub.
Configure `EDGAR_IDENTITY`, `NEWSAPI_KEY` and `FINNHUB_API_KEY` for enabled current sources.
Candidate uses `python -m workers.news_ingestion.cron_runner_v2`: EDGAR, NewsAPI.ai, GNews and best-effort NewsCatcher.
Configure `EDGAR_IDENTITY`, `NEWSAPI_AI_API_KEY` and optional `NEWSCATCHER_API_KEY`; degraded NewsCatcher does not alone block candidate ingestion.
Candidate later enrichment and analysis reuse `CRON_ENDPOINT`/`CRON_SECRET`; do not replace its distinct ingestion credentials with these.
News extraction uses `workers.news_ingestion.extract_full_text`, including the current queued backlog drain.
The deployed enrich/analysis routes need Supabase server credentials and the configured general AI provider.
Inspect ingestion results, extraction, enrichment backlog and analysis runs separately; zero inserted articles does not mean later recovery work should be skipped.

Digest execution is gated by the actual 9 AM `America/New_York` hour, preserving DST independently of UTC schedule.
Delivery needs `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` and verified SMS numbers.
`APP_BASE_URL` is the preferred canonical link origin; `NEXT_PUBLIC_APP_URL`/`NEXT_PUBLIC_SITE_URL` are lower-priority fallbacks.
Digest/page/channel uniqueness and delivery claims prevent duplicates; stale or ambiguous SMS delivery is `uncertain` and must not be blindly resent.
Snapshots upsert one bucket per portfolio/UTC hour, refresh Yahoo quotes and require migration 041 for trustworthy history.
The deployed snapshot route also accepts `PORTFOLIO_SNAPSHOT_CRON_SECRET`; this workflow sends `CRON_SECRET`, so align route/runtime configuration.
Earnings scans tracked holdings/watchlist symbols, prefers company report URLs and uses SEC fallback (`EDGAR_IDENTITY`); failures preserve last-known-good links.
Smart alerts persist deduplicated in-app rows; email/SMS delivery of these alert rows is not wired.
Digest, snapshots, earnings and alerts require Supabase URL and service-role access in the deployed app.

For diagnosis inspect workflow HTTP status/stage JSON, then admin job health and persisted rows.
Health includes freshness, enrichment backlog, failed runs, stale quotes and failed/uncertain deliveries; failed health reads report degraded.
It does not yet fully report billing reconciliation drift or per-portfolio analysis age.

## Staging checks still requiring evidence

### Isolated local E2E

`npm run test:e2e` builds a disposable Node22/Python3.11/Chromium image, starts a fresh Supabase2.119.0 stack, applies all44 migrations in lexical order, and runs the production Next app and Playwright. Docker's `default` context must be available. Set `E2E_SUPABASE_BIN` to the installed2.119.0 CLI executable; install that CLI outside this checkout. On Windows use its native `supabase.exe`. Set `E2E_RESULTS_DIR` to choose an external proof directory.

The runner supplies fictitious provider credentials and locally generated Auth credentials. It does not load the project `.env`. External provider HTTP is intercepted; the app, Auth, PostgREST, RLS, RPCs, SDKs, parsers and Python subprocesses execute normally. The internal Docker network blocks external egress during scenarios. OAuth redirects and real provider services still require the separately authorized staging checks below.

Normal runs remove only their own containers, network and image, including on failure. Exported proof contains versions, migration/source hashes, the patch fingerprint, assertion results and sanitized HTTP events. It excludes session cookies, tokens, request headers and provider payloads. Private diagnostics remain in the runner's temporary directory; do not upload them. CI uploads only `e2e-results/` and keeps SQL upgrade/concurrency validation in its separate job.

For local debugging, `E2E_KEEP_DIAGNOSTIC=1` retains the printed owned namespace and temporary workdir. Those runs are not qualification evidence. Stop that exact Supabase workdir with `supabase stop --no-backup --workdir <printed-workdir>`, remove its `<namespace>-tests` container, then its `<namespace>` network and image. Never prune shared Docker resources. `test:e2e:browser` is an internal entry point requiring the prepared container environment, not a substitute for the runner's gates.

These are open acceptance criteria; no success checkbox or deployment status is inherited from older sessions.
Use owned test accounts/data. Real-provider and sandbox checks are a separately authorized activity.

- Verify OAuth round trips and confirmed email ownership, redirect handling, terms/profile gates and two-user data isolation.
- Confirm migrations/RPCs and service-role-only grants before deploying; confirm thesis migrations 030/031 and all dependencies through 041.
- Import CSV and manual positions, reload from DB, exercise merge/replace and add/sell/idempotent retry without losing holdings.
- Check USD/FX totals, missing/stale quotes, manual price refresh, history exclusions and the nonblocking full-portfolio load.
- Persist watchlist additions, verify Finnhub search and Twelve Data detail, and inspect provider quotas/cache behavior.
- Verify personal/market feed, deep links, article thread persistence and authenticated chat with authorized providers.
- Verify real Turnstile widgets on chat/copilot/community/comment; missing or invalid challenges must fail clearly.
- Run current and candidate pipelines independently; inspect ingest → extract/enrich → analyze, including retry/degraded recovery.
- Confirm manual and scheduled Actions runs reach deployed routes and have the correct source and endpoint secrets.
- With authorized Resend/Twilio test facilities, verify one digest/page/email/SMS, code send/confirm, deduplication and uncertain-delivery handling.
- Verify snapshot, earnings and smart-alert rows and admin health from durable state; do not treat a 200 response as sufficient evidence.
- Stripe sandbox: test both old/new subscription event orders, entitlement preservation during outage, webhook retries and duplicate claims.
- Measure signed-in feed/home/community/portfolio/watchlist/settings/analysis/pricing at 375/768/1024/1280 px in both themes, including contrast, focus and overflow.
- Verify deploy egress controls, production Turnstile keys, Actions/required CI settings and repository homepage `https://pulsefolio.app`.

[The audit report](docs/audit/AUDIT_REMEDIATION_REPORT.md) preserves dated decisions and unresolved D15 semantics, alert backfill and SMS CAPTCHA choices.
The operational checks above include its remaining staging obligations; older test counts do not close them.

## Rollback and limits

Restore a previously reviewed app deployment when necessary; code rollback does not automatically roll back database writes or schema.
Inspect migration history and dependencies per environment. Prefer a reviewed fix forward; do not invent destructive rollback SQL or assume every migration is additive.
Provider outages may preserve stored prices/reports and yield partial/stale/degraded states; they do not guarantee a complete successful analysis.
Ambiguous delivery remains uncertain. Missing schema can make a feature unavailable rather than silently successful.

Portfolio values use USD with recorded FX; unavailable positions are excluded explicitly and FX movement is not separately attributed in daily change.
History uses compatible `valuation_version` snapshots; pre-041 snapshots are excluded. The 30-day move remains unknown when uncomputed, not an invented zero.
The portfolio chart uses compatible hourly history where available and a holdings-derived fallback; this is not live WebSocket price streaming.
A personal feed may legitimately be empty; new holdings/watchlist symbols affect analysis/report links on subsequent jobs.
Themes support light/dark and persist in cookies/storage. Locale types include `en`/`fr`, but the current preference provider forces English; do not claim a complete French UI.
Demo material and illustrative scenarios remain distinct from real account guarantees; publisher labels may represent aggregator-sourced articles.

## Canonical references

- [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md): agent entry points; AGENTS holds the complete stable rules.
- [Supabase guide](supabase/README.md): deployment ordering, ledgers, SQL validation and isolation checks.
- [Worker troubleshooting](workers/news_ingestion/TROUBLESHOOTING.md): locked environment, sources and diagnostic boundaries.
- [Security policy](SECURITY.md): reporting and testing restrictions; deployed branch status is a policy statement, not locally verified deployment evidence.
- [Audit remediation report](docs/audit/AUDIT_REMEDIATION_REPORT.md) and [test audit](TEST_AUDIT.md): decisions and evidence dated by campaign/commit.
- [Legal constants](lib/legal/constants.ts), [terms](app/terms/page.tsx) and [privacy](app/privacy/page.tsx): canonical operator details and public obligations.
