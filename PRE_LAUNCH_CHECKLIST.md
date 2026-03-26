# Pre-Launch Checklist

## Environment Variables

- [ ] `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key (server-side only)
- [ ] `FINNHUB_API_KEY` — required for watchlist search and portfolio company news
- [ ] `TWELVE_DATA_API_KEY` — required for watchlist detail dashboard
- [ ] `NEWSAPI_KEY` — required for global news ingestion
- [ ] `EDGAR_IDENTITY` — required for SEC EDGAR fetcher
- [ ] At least one AI provider key (`AI_PROVIDER` + matching key)
- [ ] `CRON_SECRET` — if using unattended ingestion via `/api/news/cron`
- [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — Cloudflare Turnstile widget site key (client-side)
- [ ] `TURNSTILE_SECRET_KEY` — Cloudflare Turnstile secret key (server-side only)
- [ ] Vercel Project Settings includes all cron route env vars in the **Production** environment
- [ ] GitHub repository secrets include `CRON_ENDPOINT`, `CRON_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`
- [ ] GitHub repository secrets include any enabled source creds (`NEWSAPI_KEY`, `EDGAR_IDENTITY`, `FINNHUB_API_KEY`)

## Database Migrations

Apply all migrations in order before first deploy:

```
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
```

Verify RLS is enabled on all user-facing tables:
- `portfolios`
- `holdings`
- `watchlist_items`
- `article_chat_threads`
- `article_chat_messages`

## API Provider Quotas

- [ ] Finnhub: free tier is 60 calls/minute — verify watchlist search + refresh stays within limits
- [ ] Twelve Data: free tier is 8 calls/minute, 800/day — verify dashboard usage with caching
- [ ] Yahoo Finance: unofficial, no SLA — portfolio refresh should degrade gracefully if unavailable
- [ ] NewsAPI: free tier is 100 requests/day — verify cron schedule stays within limits

## Build and Deploy

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] `npm run build` completes without errors
- [ ] `.env` is **not** committed to version control
- [ ] `.next/` is in `.gitignore`
- [ ] `.github/workflows/news-cron.yml` exists on the default branch
- [ ] GitHub Actions is enabled for the repository
- [ ] The `News Cron` workflow is visible in the Actions tab
- [ ] The workflow schedule is offset from the top of the hour and matches the intended UTC cadence

## Smoke Tests

After deploy, verify each flow manually:

- [ ] Login via OAuth (Google or GitHub) works
- [ ] Onboarding: CSV import + manual entry both save to DB
- [ ] Portfolio overview loads and shows correct totals from DB
- [ ] Full portfolio page loads without blocking on live quotes
- [ ] Refresh prices button updates holdings and shows new values
- [ ] Watchlist page loads saved items
- [ ] Watchlist search finds symbols via Finnhub
- [ ] Adding a watchlist item persists to DB and shows in list
- [ ] Clicking a watchlist item loads Twelve Data detail dashboard
- [ ] Feed page loads personal and market feeds
- [ ] Article chat creates thread and returns AI response
- [ ] Turnstile widget renders on article chat, copilot, community post, and comment surfaces
- [ ] Submitting without completing Turnstile challenge returns a clear error
- [ ] Analysis pipeline completes: ingest → enrich → analyze
- [ ] `workflow_dispatch` successfully runs `python -m workers.news_ingestion.cron_runner` in GitHub Actions
- [ ] The workflow successfully `POST`s the generated payload to `/api/news/cron`
- [ ] A scheduled GitHub Actions run appears in the Actions tab and reaches `/api/news/cron` with a `POST` payload
- [ ] The GitHub runner can execute the Python ingestion worker with production secrets

## Rollback

- Database: migrations are additive. No destructive changes in 001-009.
- Code: revert to previous deployment. All features degrade to DB-stored values if providers are unavailable.
- If a migration fails mid-deploy: fix forward preferred. Rolling back schema changes requires manual SQL.

## Known Limitations

- Portfolio performance chart shows simulated data (labeled "Simulated")
- Monthly change is hardcoded to 0 in portfolio overview
- No real-time WebSocket price streaming
- Personal feed can be empty if no articles score above the relevance threshold
- Article chat depends on a configured AI provider
- The GitHub scheduler depends on `python -m workers.news_ingestion.cron_runner`, so the runner environment and repository secrets must be verified in production rather than assumed
- GitHub scheduled workflows run in UTC on the default branch and can be delayed during high-load periods

