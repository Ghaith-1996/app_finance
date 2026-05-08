# Pre-Launch Checklist

Status note as of April 22, 2026:

- `[x]` = verified locally in this workspace or current git state
- `[ ]` = still missing, externally managed, manually verified, or currently failing

## Environment Variables

Locally verified in `.env`:

- [x] `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- [x] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anon key
- [x] `SUPABASE_SERVICE_ROLE_KEY` - Supabase service-role key (server-side only)
- [x] `FINNHUB_API_KEY` - required for watchlist search and portfolio company news
- [x] `NEWSAPI_KEY` - required for global news ingestion
- [x] `EDGAR_IDENTITY` - required for SEC EDGAR fetcher
- [x] At least one AI provider path is configured locally (`AI_PROVIDER=azure` plus matching Azure env vars)
- [x] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` - Turnstile widget site key exists locally
- [x] `TURNSTILE_SECRET_KEY` - Turnstile secret key exists locally

Still missing locally or not yet production-validated:

- [ ] `TWELVE_DATA_API_KEY` - required for watchlist detail dashboard
- [ ] `CRON_SECRET` - required for unattended ingestion via `/api/news/cron`
- [ ] `DIGEST_CRON_SECRET` - required for `/api/notifications/daily-digest/cron`
- [ ] `APP_BASE_URL` - required for canonical digest links
- [ ] `RESEND_API_KEY` - required for morning digest email delivery
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` - required for morning digest SMS delivery
- [ ] Turnstile keys are production keys; the current local keys are Cloudflare test keys and must be replaced before launch
- [ ] Vercel Project Settings includes all required env vars in the **Production** environment
- [ ] GitHub repository secrets include `CRON_ENDPOINT`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`
- [ ] GitHub repository secrets include enabled source credentials (`NEWSAPI_KEY`, `EDGAR_IDENTITY`, `FINNHUB_API_KEY`, and any later provider keys)
- [ ] GitHub repository secrets include `DIGEST_CRON_ENDPOINT` and `DIGEST_CRON_SECRET`

## Database Migrations

Current repo state:

- [x] `supabase/migrations/` currently contains schema history through `024`
- [x] `024_daily_digest_notifications.sql` exists
- [x] `024_ticker_earnings_reports.sql` exists

Apply all current migrations in order before launch:

```text
001_initial_schema.sql
002_holdings_position_fields.sql
003_portfolio_source_csv.sql
004_news_classification.sql
005_news_source_fields.sql
006_article_chat.sql
007_feed_match_reason_codes.sql
008_extracted_content.sql
008_news_full_content.sql
009_watchlist_items.sql
010_article_extractions.sql
011_community.sql
012_user_profile_names.sql
013_feed_match_sources.sql
014_billing.sql
015_billing_events_rls.sql
016_billing_private_rls.sql
017_redact_billing_payloads.sql
018_lock_down_news_item_writes.sql
019_news_detail_open_count.sql
019_user_accepted_terms.sql
020_durable_ai_usage_limits.sql
021_phase2_security_and_concurrency.sql
022_stale_recovery_backfill.sql
023_analysis_run_heartbeat.sql
024_daily_digest_notifications.sql
024_ticker_earnings_reports.sql
```

RLS verified locally in migration files for expected user-facing tables:

- [x] `portfolios`
- [x] `holdings`
- [x] `watchlist_items`
- [x] `article_chat_threads`
- [x] `article_chat_messages`

Still re-verify in deployed Supabase:

- [ ] Internal-only tables (`billing_customers`, `subscriptions`, `billing_events`, `ai_usage_counters`, `rate_limit_events`) are accessible only through the service-role path and any Supabase linter warning is intentionally accepted

## API Provider Quotas

- [ ] Finnhub: verify watchlist search plus refresh stays within the free-tier limit
- [ ] Twelve Data: verify detail dashboard usage with caching once `TWELVE_DATA_API_KEY` is configured
- [ ] Yahoo Finance: verify portfolio refresh degrades gracefully if the provider is unavailable
- [ ] NewsAPI: verify cron schedule stays within the daily request limit

## Build and Deploy

Repository and workflow files verified locally:

- [x] `.env` is **not** committed to version control
- [x] `.next/` is in `.gitignore`
- [x] `.github/workflows/news-cron.yml` exists locally and is tracked in git
- [x] `.github/workflows/news-cron.yml` includes `workflow_dispatch`
- [x] `.github/workflows/news-cron.yml` runs `python -m workers.news_ingestion.cron_runner`
- [x] `.github/workflows/daily-digest.yml` exists locally
- [x] `.github/workflows/daily-digest.yml` includes `workflow_dispatch`
- [x] `.github/workflows/earnings-report-sync.yml` exists locally
- [x] `npm run build` completes without errors

Still open before launch:

- [ ] `.github/workflows/news-cron.yml` is confirmed present on the default branch in GitHub
- [ ] `.github/workflows/daily-digest.yml` is tracked in git and present on the default branch (it exists locally today but is not tracked)
- [ ] `.github/workflows/earnings-report-sync.yml` is tracked in git and present on the default branch (it exists locally today but is not tracked)
- [ ] GitHub Actions is enabled for the repository
- [ ] The `News Cron` workflow is visible in the Actions tab
- [ ] The `Daily Digest` workflow is visible in the Actions tab
- [ ] The earnings-report workflow is visible in the Actions tab
- [ ] Workflow schedules are confirmed in GitHub and match the intended UTC cadence

## Current Blockers

The following checks currently fail locally and should be treated as open launch blockers until fixed:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes

Current failure areas observed locally on April 22, 2026:

- `typecheck` is failing in `tests/daily-digest-cron-route.test.ts` and `tests/portfolio-copilot-panel-grant.test.tsx`
- `lint` is failing in `app/privacy/page.tsx`, `app/terms/page.tsx`, and multiple components with `react-hooks/set-state-in-effect`, hook dependency, and unescaped entity issues
- `test` is failing in 9 files, including `tests/portfolio-csv-import-flow.test.tsx`, `tests/app-shell-layout.test.tsx`, `tests/community-types.test.ts`, `tests/gnews-targeting.test.ts`, `tests/news-health-route.test.ts`, `tests/onboarding-page.test.tsx`, `tests/portfolio-price-sync.test.ts`, `tests/refresh-route.test.ts`, and `tests/watchlist-page.test.tsx`

## Smoke Tests

After deploy, verify each flow manually. All items in this section remain open until exercised against deployed infrastructure:

- [ ] Login via OAuth (Google or GitHub) works
- [ ] Onboarding: CSV import plus manual entry both save to DB
- [ ] Portfolio overview loads and shows correct totals from DB
- [ ] Full portfolio page loads without blocking on live quotes
- [ ] Refresh prices button updates holdings and shows new values
- [ ] Watchlist page loads saved items
- [ ] Watchlist search finds symbols via Finnhub
- [ ] Adding a watchlist item persists to DB and shows in list
- [ ] Clicking a watchlist item loads Twelve Data detail dashboard
- [ ] Feed page loads personal and market feeds
- [ ] Article chat creates a thread and returns an AI response
- [ ] Turnstile widget renders on article chat, copilot, community post, and comment surfaces using production keys
- [ ] Submitting without completing the Turnstile challenge returns a clear error
- [ ] Analysis pipeline completes: ingest -> enrich -> analyze
- [ ] `workflow_dispatch` successfully runs `python -m workers.news_ingestion.cron_runner` in GitHub Actions
- [ ] The workflow successfully `POST`s the generated payload to `/api/news/cron`
- [ ] A scheduled GitHub Actions run appears in the Actions tab and reaches `/api/news/cron` with a `POST` payload
- [ ] The GitHub runner can execute the Python ingestion worker with production secrets
- [ ] Enable both digest channels for a test user, run `workflow_dispatch` for `Daily Digest`, and verify one digest page, one email, one SMS, and no duplicate delivery rows
- [ ] Run `workflow_dispatch` for the earnings-report workflow and verify expected writes to `ticker_earnings_reports`

## Rollback

- Database: migrations are additive. No destructive changes in the early schema history.
- Code: revert to the previous deployment. Features should degrade to DB-stored values if providers are unavailable.
- If a migration fails mid-deploy: fix forward is preferred. Rolling back schema changes requires manual SQL.

## Known Limitations

- Portfolio performance chart shows simulated data (labeled "Simulated")
- Monthly change is hardcoded to `0` in portfolio overview
- No real-time WebSocket price streaming
- Personal feed can be empty if no articles score above the relevance threshold
- Article chat depends on a configured AI provider
- The GitHub scheduler depends on `python -m workers.news_ingestion.cron_runner`, so the runner environment and repository secrets must be verified in production rather than assumed
- GitHub scheduled workflows run in UTC on the default branch and can be delayed during high-load periods
- Morning digests are fixed to a `9:00 AM America/New_York` send window; correct delivery depends on digest workflow secrets plus working Resend and Twilio credentials
