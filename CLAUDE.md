---
description: 
alwaysApply: true
---

# CLAUDE.md

## What This File Is

This is the root handoff document for AI agents working in this repository.

Goal: an agent should be able to read this first and avoid spending large context re-discovering the architecture, data model, routes, runtime assumptions, and current repo state.

This document is intentionally detailed, but it is still a handoff, not a replacement for reading the exact files you are about to edit. Treat it as the repo map and decision log.

## Project Identity

Project name:

- `Pulsefolio` (package name: `pulsefolio`)

Legacy/internal identifiers:

- some worker user-agent strings and older comments still use `portfolio-signal`; treat those as legacy naming unless the task is explicitly a rename cleanup.

What the app does:

- portfolio-aware finance workflow app
- ingests global market/news data
- stores a shared 24-hour news pool
- enriches articles with AI
- runs portfolio-specific matching and scoring
- generates a personalized feed and portfolio insights
- supports article-level chat and portfolio-level copilot chat
- supports billing-gated AI tiers, durable AI quotas, and Turnstile bot verification
- can send 9 AM Eastern portfolio/watchlist digest notifications by email/SMS
- tracks latest earnings-report links for held/watchlist symbols

What it is not:

- not a finished production system
- not a broker trading app
- not fully end-to-end tested across Supabase + Python worker + live AI + UI

Product posture:

- real auth, DB, ingestion, AI, and feed logic exist
- UI is polished and product-like
- some pages remain frontend-first or partially aspirational
- marketing copy can be more mature than the underlying implementation

## Current Session Decisions

These decisions were made across recent implementation threads and are reflected in code/doc changes:

- user wants to use Azure `gpt-5.2` for the main path
- StepFun `step-3.5-flash:free` via OpenRouter should remain available for switching back and forth
- Azure support was implemented as a separate provider, not by overloading the existing public OpenAI provider
- the app now supports `AI_PROVIDER=azure`
- the Azure provider expects Azure OpenAI Responses API endpoints on `openai.azure.com`
- the user also showed an Azure AI Foundry published agent endpoint on `services.ai.azure.com`; that is not the same endpoint type and is not valid for `AZURE_OPENAI_BASE_URL`
- a recommended portfolio-news system prompt was provided for Azure agents
- article chat no longer falls back to the canned stub reply in production; provider failures now surface a 503 with a user-facing temporary-unavailable message
- article chat output budget was raised from `350` to `2000` tokens across Azure, OpenAI, OpenRouter, and Anthropic via `lib/services/ai/constants.ts`
- added regression test `tests/article-chat-token-budget.test.ts` to assert the 2000-token budget for all four providers
- first-time OAuth users are now gated through `/complete-profile` until `user_profiles.first_name`, `last_name`, and `handle` are all present
- `/settings` now includes editable profile fields (first name, last name, username) backed by `lib/actions/profile.ts`
- `components/app/user-menu.tsx` is now an avatar dropdown with `Settings` and `Sign out`, and it refreshes after profile saves via a client-side `profile-updated` event
- profile domain helpers/types now live in `lib/profile/utils.ts`; `lib/actions/profile.ts` is intentionally async-only because `"use server"` files cannot export sync helpers like `isProfileComplete`
- added migration `supabase/migrations/012_user_profile_names.sql` for `user_profiles.first_name` and `user_profiles.last_name`
- added regression coverage for the profile flow in `tests/profile-utils.test.ts`, `tests/auth-callback-route.test.ts`, and `tests/user-menu.test.tsx`
- `app/api/news/cron/route.ts` is finalized through `POST`; GitHub Actions builds the ingest payload with `python -m workers.news_ingestion.cron_runner` and posts it to the deployed route
- added `.github/workflows/news-cron.yml` to trigger the production cron route every 20 minutes at `7,27,47` minutes past the hour (UTC) plus `workflow_dispatch`
- cron start/end observability was added in `app/api/news/cron/route.ts` with duration, inserted counts by source, enrichment count, and analysis processed/skipped/error counts
- removed `vercel.json`; Vercel still hosts the route, but GitHub Actions is now the active scheduler
- `README.md` and `PRE_LAUNCH_CHECKLIST.md` now document the GitHub Actions scheduler setup, required secrets/env vars, and post-deploy smoke test
- the remaining deployment risk is keeping GitHub Actions worker secrets and the deployed cron finalize route in sync
- allowlisted admins now bypass Stripe AI model-tier gating without changing their underlying Stripe plan; billing summaries expose `hasAdminModelAccess` and unlock `free`, `premium`, and `ultimate`
- added `/admin` as an allowlist-only admin console page, linked beneath `Settings` in the user menu for admin viewers
- the admin console provides manual controls for `/api/news/health`, `/api/news/refresh`, and `/api/news/refresh-v2` using the viewer's existing session cookie
- added the Phase 1 candidate news pipeline in parallel with the current one: `POST /api/news/cron/v2`, `POST /api/news/refresh-v2`, `.github/workflows/news-cron-v2.yml`, Python `providerSet=candidate`, and shared writes into the existing `news_items` pool
- candidate ingestion uses EDGAR + NewsAPI.ai + GNews + NewsCatcher with portfolio keyword queries; the current scheduled pipeline stays active and unchanged until explicit cutover
- candidate workflow/runtime note: `NEWS_V2_CRON_SECRET` must be present both in GitHub Actions and in the deployed app runtime serving `/api/news/cron/v2`; shared enrich/analysis steps still use `CRON_SECRET`, while NewsCatcher auth/search probes are warning-only best-effort checks
- article chat UI moved out of the article detail panel into a separate surface: right-side sticky sidebar at `xl+` and a mobile slide-over sheet below `xl`
- FeedView now owns article chat state, including activity tracking and a guarded story-switch confirmation modal when the current chat has messages or a draft
- ArticleChatPanel now reports activity via `onActivityChange` and supports headerless/styled reuse inside the sidebar/sheet
- tests updated to cover the new chat panel placement, mobile sheet rendering, and story switch guard behavior (`tests/feed-view.test.tsx`, `tests/article-chat-panel.test.tsx`)
- added `syncHoldingPricesIfStale(portfolioId, { minAgeMs? })` in `lib/actions/portfolio.ts` with a default 60-second freshness window and return shape `{ updated, skipped, error }`
- `syncHoldingPricesIfStale` performs auth + ownership checks, skips when `portfolios.last_synced_at` or latest `holdings.quote_as_of` is fresh, delegates stale refreshes to the existing `syncHoldingPricesInternal` path, and remains server-safe (no `revalidatePath`)
- manual refresh behavior remains unchanged: `refreshHoldingPrices(portfolioId)` still uses the same sync path and performs route revalidation for button-driven flows
- portfolio-backed pages no longer block the full page render on top-level sync; they now stream only isolated value surfaces with `Suspense` while rendering snapshot content immediately
- `/portfolio` streams only the total-value card; import method, last analyzed, and top stories render from snapshot
- `/feed` streams only the Active portfolio value card; coverage, analysis pulse, and feed list render from snapshot
- security hardening pass completed without changing normal user flows: deprecated news debug routes are now admin-only, `news_items` authenticated writes were removed, `/complete-profile` now sanitizes `redirectTo`, feed/watchlist/community/profile URLs are filtered to safe `http`/`https` targets, and publisher extraction now rejects private/internal URLs before fetch
- new deployment/config follow-up: set `ADMIN_USER_IDS` or `ADMIN_USER_EMAILS` for the debug news routes, and apply the new Supabase migration `018_lock_down_news_item_writes.sql` in every environment
- `/analysis` streams only the right-side Portfolio snapshot panel; analysis run and insight priorities render from snapshot
- `/portfolio/full` streams only the performance hero/chart and holdings block; sector cards and right-rail insight/advisor/latest-analysis blocks remain snapshot-based
- added request-scoped cached server loaders in `lib/server/portfolio-refresh-loaders.ts` (`loadFreshOverviewAfterPriceSync`, `loadFreshFullPortfolioAfterPriceSync`) to run stale-only sync then fetch fresh DB data for streamed regions
- full-portfolio streamed regions share one cached in-flight refresh promise per request to avoid duplicate quote-provider work when both hero and holdings refresh concurrently
- added focused sync primitive coverage in `tests/portfolio-price-sync.test.ts` for stale-skip rules, stale refresh, no-holdings non-fatal behavior, provider-failure swallowing, auth/ownership protection, repeated-call suppression, and manual refresh behavior
- added render-focused streaming tests in `tests/streamed-price-refresh-pages.test.tsx` covering localized Suspense fallbacks on `/portfolio`, `/feed`, `/analysis`, and `/portfolio/full`
- added loader dedupe coverage in `tests/portfolio-refresh-loaders.test.ts` to assert a single sync/read pass for concurrent full-portfolio loader calls
- the landing page (`/`) was completely redesigned with a high-density bento grid, glassmorphism, and kinetic typography
- added `components/marketing/use-cases.tsx`: a premium interactive section showcasing AI Use Cases (Strategy Synthesis, Portfolio Guardrails, Macro Signal, Alpha Capture) with motion-tracked glass cards and GLSL-inspired noise backgrounds
- landing page hero now uses GSAP-powered floating decorative elements and an "Available on GitHub" banner
- landing page layout is now fully semantic and responsive, using a custom grid system that feels premium and "alive"
- global CSS (`app/globals.css`) now includes high-performance keyframe animations for floating elements and glass shimmer effects
- added high-res AI assets (Strategy, Guardrails, Macro, Alpha) for the interactive use cases section
- installed `framer-motion`, `gsap`, and `clsx` to support the new premium interface standards
- app shell layout max-width widened from `1400px` to `1600px` (`components/app/app-shell-layout.tsx`), portfolio page grid ratios adjusted to give the left column more space
- `/complete-profile` now requires first-time users to accept Terms of Service via a checkbox before completing their profile; the `ProfileForm` component accepts a `requireTerms` prop that gates the submit button
- added `/terms` page (`app/terms/page.tsx`) with 15 legal sections covering service description, AI-generated content disclaimers, billing, privacy, limitation of liability, etc.
- replaced the generic `/terms` copy with a fixed legal document using static effective/last-updated dates, repo-accurate Stripe billing language, and explicit operator/contact/refund/jurisdiction placeholders from `lib/legal/constants.ts`
- added a separate public `/privacy` page plus shared legal shell/layout support in `components/legal/legal-document-shell.tsx`; login and first-time profile completion now expose both Terms and Privacy links, while the existing `accepted_terms_at` flow remains unchanged
- durable AI usage enforcement now replaces process-local AI gating: `supabase/migrations/020_durable_ai_usage_limits.sql`, `lib/security/ai-access.ts`, `lib/security/rate-limit.ts`, and `lib/billing/ai-usage.ts` enforce server-side model-tier access, burst limits, and quota consumption through Supabase RPCs
- article chat and portfolio copilot now share AI quotas of `100/day` on Free, `5,000/month` on Premium, and `20,000/month` on Ultimate, plus a durable burst cap of `10` requests per `60` seconds for all plans
- billing summaries now expose `aiQuotaLimit`, `aiQuotaWindow`, `aiQuotaUsed`, `aiQuotaRemaining`, and `aiQuotaResetsAt`; settings and pricing surfaces show quota copy/usage, and analysis/community throttles now use the same durable Supabase-backed rate limiter primitive
- added regression coverage for durable AI entitlements/quota enforcement and legal-link rendering (`tests/ai-access.test.ts`, `tests/durable-ai-usage-migration.test.ts`, updated article-chat / portfolio-copilot route tests, `tests/profile-form-legal-links.test.tsx`, and `tests/login-language-hidden.test.tsx`)
- new deployment follow-up: apply `supabase/migrations/020_durable_ai_usage_limits.sql` in every environment before relying on the durable quota/rate-limit enforcement
- personal feed article limits raised: `ANALYSIS_NEWS_POOL_LIMIT` 100→500 (articles scored per analysis run), `MAX_PAGE_SIZE` 100→500 (pagination cap), `DEFAULT_FEED_PAGE_SIZE` 50→100; time-based 24-hour filter unchanged
- updated `tests/analysis-constants.test.ts` to reflect the new 500-article pool limit
- feed sorting/pagination now supports `match`, `recent`, `hot`, and `oldest` where applicable; `hot` uses `news_items.detail_open_count`
- added `POST /api/feed/open` plus migration `019_news_detail_open_count.sql` to increment `detail_open_count` when a user opens a story detail
- analysis runs can now finish as `degraded` when AI failures make output unreliable; feed/digest/page loaders treat `complete` and `degraded` runs as usable
- added Phase 2 DB hardening in `supabase/migrations/021_phase2_security_and_concurrency.sql`: Stripe webhook processing states/reclaim, unique subscription row per user, unique active analysis run per portfolio, feed indexes, and atomic plan-aware AI quota RPC
- added stale-recovery follow-up migrations `022_stale_recovery_backfill.sql` and `023_analysis_run_heartbeat.sql`; active analysis runs now use `analysis_runs.updated_at` as a heartbeat/staleness signal
- article chat now supports both story-scoped chat (`newsItemId`) and general feed Ask AI (`portfolioId` + message, no `newsItemId`)
- story chat, general feed chat, and portfolio copilot use HMAC-signed Turnstile grant cookies scoped to user + portfolio for 15 minutes; auth, ownership, billing, quota, and story validation still run on every request
- Turnstile grant issuance now uses `respondForChat` in article chat and portfolio copilot, so a passed challenge can still mint the grant cookie even when downstream provider/billing/storage work fails
- AI tier routing is now explicit: `free` -> OpenRouter, `premium` -> Mistral, `ultimate` -> Azure
- settings now includes billing, notification preferences, theme preferences, and profile editing on one surface
- root preferences infrastructure exists for light/dark theme and locale cookies/localStorage; locale is currently forced to `en` even though `fr` remains in the supported-locale type
- added daily digest notifications: `user_notification_preferences`, `notification_digests`, `notification_deliveries`, digest builder/delivery services, `/digest/[digestId]`, `POST /api/notifications/daily-digest/cron`, and `.github/workflows/daily-digest.yml`
- daily digest runs are scheduled from GitHub Actions at `0,15,30,45 13,14 * * *` UTC, while the route itself only runs during the real `9 AM America/New_York` hour for DST safety
- digest email delivery uses Resend; digest SMS delivery uses Twilio; SMS pending deliveries are not blindly resent and can become `uncertain`
- digest email/SMS links now prefer feed links: story titles open `/feed?story=<newsItemId>` with that article selected, and the main CTA opens `/feed`
- digest links prefer `APP_BASE_URL`, then `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL`, before trusted request-origin fallback
- added latest earnings-report tracking: `ticker_earnings_reports`, `lib/services/earnings-reports.ts`, `POST /api/earnings-reports/cron`, and `.github/workflows/earnings-report-sync.yml`
- earnings-report sync resolves tracked symbols from holdings + watchlists, prefers company-hosted investor/earnings links, falls back to SEC filings, and inactivates rows for no-longer-tracked symbols
- portfolio holdings and watchlist details now expose latest earnings-report links when `ticker_earnings_reports` has an active row
- portfolio performance is no longer simulated: `components/app/portfolio-performance-chart.tsx` now derives live fallback points from holdings, current quotes, cost basis, and previous-close implied value, and uses stored value snapshots when available
- added hourly portfolio value snapshots: migration `supabase/migrations/025_portfolio_value_snapshots.sql`, service `lib/services/portfolio-value-snapshots.ts`, route `POST /api/portfolio/value-snapshots/cron`, and `.github/workflows/portfolio-value-snapshots.yml`
- `/portfolio/full` loads recent value snapshots through `lib/server/page-loaders.ts`; the performance chart uses stored snapshots when at least two valid points exist, otherwise it falls back to the live holdings-derived view
- the landing page hero mock product panel was widened toward the right, and "View demo" / demo CTAs now route to the public `/demo` page instead of the authenticated feed
- added public `/demo` with `components/marketing/demo-workspace.tsx`: interactive use cases for daily brief, article impact + story chat, AI advisor, and guardrails; demo answers are intentionally longer and more detailed than the previous feed redirect
- `README.md` and `PRE_LAUNCH_CHECKLIST.md` now document daily digest and earnings-report scheduler setup in addition to the news scheduler

Important runtime note:

- the workspace `.env` now uses `AI_PROVIDER=azure`
- Azure credentials/base URL/model are present in `.env`, but article chat can still fail at runtime if the Azure deployment name or endpoint configuration is wrong

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase SSR/client SDK
- Yahoo Finance (`yahoo-finance2`)
- Python worker for ingestion
- Vitest + Testing Library
- Framer Motion & GSAP (Performance animation layer)
- `clsx` for tailwind utility merging
- Stripe (billing/subscriptions)
- Recharts (charts in watchlist dashboard and portfolio)
- Cloudflare Turnstile (bot verification)
- Resend and Twilio API integrations for digest delivery

Node scripts:

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:watch`

## Top-Level Directory Map

- `app/`
  - App Router pages and API routes
- `components/`
  - app UI and marketing UI
- `components/legal/`
  - shared legal document shell used by `/terms` and `/privacy`
- `components/providers/`
  - app-wide preferences provider for theme/locale state
- `emails/`
  - React email rendering for daily digest delivery
- `lib/actions/`
  - server actions for portfolio, profile, watchlist, community, and notification preferences
- `lib/notifications/`
  - daily digest build, delivery, preference, and timezone helpers
- `lib/preferences.ts`
  - theme/locale cookie and localStorage constants/helpers
- `lib/legal/`
  - shared legal placeholders, static dates, and legal document constants
- `lib/services/`
  - core business logic
- `lib/server/`
  - server page loaders and shared feed resolver
- `lib/services/cache.ts`
  - in-memory TTL cache for expensive provider calls
- `lib/billing/`
  - Stripe billing: plans, subscriptions, store, sync, webhook
- `lib/security/`
  - rate limiting, redirect validation, timing-safe comparison, Turnstile
- `lib/env.ts`
  - centralized environment validation
- `lib/logger.ts`
  - structured server-side logging
- `lib/supabase/`
  - server/browser/service-role Supabase clients
- `supabase/migrations/`
  - schema source of truth
- `workers/news_ingestion/`
  - Python ingestion worker
- `tests/`
  - Vitest coverage
- `scripts/`
  - AI smoke tests
- `analysis.txt`
  - longer plain-text repo analysis generated earlier

## Current Git / Repo State

At the time this document was refreshed, `git status --short` was clean before editing `AGENTS.md` and `CLAUDE.md`.

Implications:

- do not assume it remains clean in a later session; always run `git status --short`
- do not revert unrelated local changes
- prefer reading the current file contents before editing any modified files

## Runtime Architecture

High-level split:

- browser/client components handle interaction
- server components load authenticated data
- server actions manage portfolio import/edit flows
- Next API routes expose feed, analysis, ingest, health, and chat behaviors
- Python worker fetches and normalizes external news
- TypeScript handles AI enrichment and portfolio scoring
- notification services build and deliver stored daily digest snapshots
- earnings-report services resolve tracked symbol report links for portfolio/watchlist surfaces
- portfolio value snapshot services record hourly portfolio values for historical charting

Important conceptual split:

- `news_items` is the global, shared recent news pool
- `feed_items` is the portfolio-specific result of analysis

That split is central to the product and the code.

Ingestion model:

- scheduled production ingestion into `news_items` happens via a 20-minute cron job (`POST /api/news/cron`)
- the cron job builds its global ticker universe from all user holdings + all user watchlist symbols
- it runs Python worker (EDGAR + NewsAPI + GNews) + Finnhub targeted news
- after enrichment, it runs analysis for all portfolios automatically
- user-triggered refresh (`/api/news/refresh`) is deprecated and no longer called by the UI
- manual candidate testing can also write into the same pool via `POST /api/news/cron/v2` or `POST /api/news/refresh-v2`
- personal feed selection considers both portfolio holdings and watchlist symbols
- `feed_items.match_sources` tracks whether each story matched via `"portfolio"`, `"watchlist"`, or both
- `news_items.detail_open_count` tracks story-detail opens and powers `hot` feed sorting

Notification model:

- users opt into email and/or SMS daily digest delivery from `/settings`
- digest cron builds one stored `notification_digests` row per user/date and upserts `notification_deliveries` rows per channel
- digest email story titles open `/feed?story=<newsItemId>` so the feed page selects that article; digest CTA/SMS fallback links open `/feed`
- `/digest/[digestId]` remains an authenticated owner-only stored snapshot view

Earnings-report model:

- the earnings sync cron resolves all unique symbols from holdings and watchlists
- `ticker_earnings_reports` stores preferred company/SEC links, report dates, active state, and last error
- portfolio holdings and watchlist detail views render report links from active rows when available

Portfolio value snapshot model:

- an hourly GitHub Actions job posts to `POST /api/portfolio/value-snapshots/cron`
- the route records one `portfolio_value_snapshots` row per portfolio per UTC hour using service-role access and Yahoo quotes
- `/portfolio/full` loads recent snapshots and uses them for the performance chart when at least two valid points exist

## Authentication And Session Model

Supabase auth is used throughout.

Files:

- `middleware.ts`
- `lib/supabase/server.ts`
- `lib/supabase/client.ts`
- `lib/supabase/service.ts`
- `app/(auth)/login/page.tsx`
- `app/auth/callback/route.ts`

Protected routes:

- `/onboarding`
- `/analysis`
- `/feed`
- `/portfolio`
- `/home`
- `/watchlist`
- `/settings`
- `/admin`
- `/complete-profile`
- `/digest/[digestId]`

Login flow:

- login page offers Google and GitHub OAuth
- callback route exchanges auth code for session
- after success, users with incomplete profile rows are redirected to `/complete-profile?redirectTo=...`
- profile completion requires first name, last name, and username (`user_profiles.handle`)
- first-time completion also requires Terms acceptance and stores `accepted_terms_at`
- users with complete profiles are redirected to the requested route or `/portfolio`

Supabase clients:

- `lib/supabase/server.ts`
  - cookie-backed server client for server components/routes/actions
- `lib/supabase/client.ts`
  - browser client
- `lib/supabase/service.ts`
  - service-role client for backend/worker-style tasks

## Pages And User-Facing Surfaces

### `/`

File:

- `app/page.tsx`

Purpose:

- premium marketing/landing page with high-density Bento Grid and Kinetic Typography
- built with motion-tracked glass surfaces and GLSL-inspired visual effects
- interactive "Use Cases" section demonstrating Strategy, Guardrails, Macro, and Alpha workflows
- hero mock product panel is widened toward the right for a denser first viewport
- clear conversion paths to public `/demo`, GitHub, and Login

Important caveat:

- product messaging can imply a more complete backend than actually exists

### `/demo`

Files:

- `app/demo/page.tsx`
- `components/marketing/demo-workspace.tsx`

Purpose:

- public, unauthenticated product demo that shows realistic Pulsefolio workflows instead of redirecting to `/feed`

Current behavior:

- includes interactive demo modes for daily brief, article impact + story chat, AI advisor, and guardrails/concentration risk
- demo article/advisor answers are intentionally longer and more detailed so users can understand the expected AI depth
- landing page "View demo" links and use-case CTAs route here, including anchors like `/demo#daily-brief`, `/demo#adviser`, and `/demo#article-impact`

### `/login`

Files:

- `app/(auth)/login/page.tsx`
- `app/(auth)/login/layout.tsx`

Purpose:

- sign in with Google or GitHub via Supabase OAuth
- exposes public links to `/terms` and `/privacy` beneath the auth controls

### `/onboarding`

Files:

- `app/onboarding/page.tsx`
- `app/onboarding/layout.tsx`
- `components/app/csv-dropzone.tsx`
- `components/app/column-mapper.tsx`
- `components/app/holdings-review-table.tsx`
- `components/app/symbol-search.tsx`
- `lib/actions/portfolio.ts`
- `lib/services/csv-parser.ts`

Current behavior:

- two entry modes: CSV import or manual entry
- CSV path:
  - upload file
  - parse headers/rows
  - auto-detect column mapping
  - if ambiguous, prompt manual mapping
  - normalize to holding drafts
  - try Yahoo symbol resolution
  - unresolved entries stay unresolved until reviewed
- manual path:
  - symbol search
  - user enters quantity, average cost, optional thesis
  - rows become confirmed when required fields are valid
- review step:
  - user sees confirmed/unresolved/skipped entries
  - if a portfolio already exists, user chooses `replace` or `merge`
- successful save redirects to `/analysis?portfolioId=...`

Important implementation notes:

- save mode defaults to `replace`
- import source is tracked (`csv` vs `manual`)
- live quotes are fetched after save when Yahoo is available

### `/analysis`

Files:

- `app/analysis/page.tsx`
- `app/analysis/layout.tsx`
- `components/app/analysis-run-trigger.tsx`
- `app/api/news/refresh/route.ts`
- `app/api/analysis/run/route.ts`

Purpose:

- user-triggered pipeline run page

Current UI behavior:

- loads first portfolio by default if present
- shows portfolio overview and latest insights
- main action is pipeline execution through `AnalysisRunTrigger`

Pipeline concept shown to user:

1. ingest
2. enrichment
3. analysis

`analysis_runs` statuses currently used in code:

- `queued`
- `processing_holdings`
- `mapping_news`
- `generating_insights`
- `complete`
- `degraded`
- `failed`

### `/feed`

Files:

- `app/feed/page.tsx`
- `app/feed/layout.tsx`
- `components/app/feed-view.tsx`
- `components/app/news-feed-card.tsx`
- `components/app/article-chat-panel.tsx`
- `app/api/feed/route.ts`
- `app/api/article-chat/route.ts`

Purpose:

- personalized daily brief and market feed

Important behavior:

- personal feed = latest completed or degraded analysis run
- market feed = direct `news_items` query from the last 24 hours
- server resolver supports pagination, recency cap, mode-specific sort, ticker/source/category filters, and watchlist-only fallback
- client-side filtering exists for loaded holdings, sectors, category, source type, recency, sort, and ticker input
- `?story=<newsItemId>` deep-links into the feed and selects that story after feed data loads; this is used by digest email/SMS links
- `hot` sort uses `detail_open_count`; story detail opens are posted to `/api/feed/open`
- Ask AI supports both selected-story chat and general portfolio/market chat, with 15-minute portfolio-wide Turnstile grant reuse
- article chat lives in a right-side sticky sidebar on `xl+` and a mobile slide-over below `xl`

### `/portfolio`

Files:

- `app/portfolio/page.tsx`
- `app/portfolio/layout.tsx`
- `components/app/portfolio-table.tsx`
- `components/app/refresh-prices-button.tsx`

Purpose:

- main portfolio overview surface

Current behavior:

- loads first portfolio
- shows total value, import method, last analyzed
- top stories section uses latest feed highlights
- if no portfolio exists, user is pushed toward onboarding

### `/portfolio/full`

Files:

- `app/portfolio/full/page.tsx`
- `components/app/portfolio-holdings-table.tsx`
- `components/app/portfolio-copilot-panel.tsx`

Purpose:

- deeper holdings and strategy surface

Current behavior:

- sector bucket cards are heuristic, not based on a full normalized taxonomy
- includes refresh prices button
- includes portfolio copilot panel
- includes summary cards built from holdings, insights, and feed highlights
- performance chart uses hourly `portfolio_value_snapshots` when available and falls back to holdings/current-quote/cost-basis-derived points instead of simulated data
- holdings rows include quick links to `/feed?ticker=SYMBOL` and a latest earnings report link when available

### `/watchlist`

Files:

- `app/watchlist/page.tsx`
- `components/app/watchlist-page-client.tsx`
- `components/app/watchlist-items.tsx`
- `components/app/watchlist-search-panel.tsx`
- `components/app/watchlist-detail-dashboard.tsx`
- `lib/actions/watchlist.ts`
- `lib/watchlist/watchlist-data.ts`
- `lib/services/finnhub.ts`
- `lib/services/twelvedata.ts`

Current state:

- fully server-backed per-user watchlist stored in `watchlist_items` table
- prices refresh via Finnhub on every page visit
- "Add to Watchlist" opens an inline search panel (Finnhub symbol search)
- search requires explicit submit (button click or Enter), no live-as-you-type
- clicking a search result upserts the symbol to DB and selects it
- selected symbol state is URL-driven via `?symbol=...` (deep-linkable)
- right side of the page shows a Twelve Data detail dashboard for the selected symbol
- dashboard includes: summary, 30-day price chart (SVG), market stats, company profile
- dashboard has overview/financials tabs using Recharts for price, revenue/net income, debt/cash/FCF, and EPS charts where data exists
- dashboard surfaces the latest earnings report link from `ticker_earnings_reports` when available
- dashboard degrades gracefully if some Twelve Data endpoints fail
- per-row 3-dot menu supports delete (calls server action, removes from DB)
- global "Refresh prices" button re-fetches Finnhub quotes for all saved items
- rows are clickable to select a symbol for the detail dashboard
- links into `/feed?symbol=...` per row

### `/complete-profile`

Files:

- `app/complete-profile/page.tsx`
- `components/app/profile-form.tsx`
- `lib/actions/profile.ts`
- `lib/profile/utils.ts`

Purpose:

- dedicated first-login gate after OAuth

Current behavior:

- requires an authenticated user
- preloads any existing/derived profile values from `user_profiles` and OAuth metadata
- redirects completed users to the requested destination immediately
- otherwise requires first name, last name, and username before entering the app
- first-time users must also accept Terms of Service via a checkbox before submitting; the form links to both `/terms` and `/privacy`, but only Terms acceptance is recorded in this flow

### `/settings`

Files:

- `app/settings/page.tsx`
- `components/app/profile-form.tsx`
- `components/app/billing-settings-panel.tsx`
- `lib/actions/profile.ts`

Purpose:

- authenticated profile settings and billing management surface

Current behavior:

- allows editing first name, last name, and username
- updates `user_profiles.display_name` from `first_name + last_name`
- reuses the same validation and save path as first-login completion
- shows `BillingSettingsPanel` with current plan, status, renewal date, allowed model tiers, AI quota usage/remaining/reset timing, and manage/upgrade CTAs
- shows `NotificationSettingsPanel` for 9 AM Eastern email/SMS digest preferences, including E.164 phone validation for SMS
- shows `PreferencesPanel` for light/dark theme selection
- displays `billing=success` badge after Stripe checkout redirect
- allowlisted admins see `hasAdminModelAccess` reflected in the billing UI and get an `Admin` link in the user menu

### `/admin`

Files:

- `app/admin/page.tsx`
- `components/app/admin-console-panel.tsx`
- `lib/security/admin.ts`
- `lib/billing/subscriptions.ts`

Purpose:

- allowlist-only admin surface for model-access verification and manual news operations

Current behavior:

- requires an authenticated Supabase session
- redirects unauthenticated users to `/login?redirectTo=/admin`
- redirects authenticated non-admin users to `/settings`
- shows the current billing summary while clearly separating Stripe plan state from admin-only model-tier overrides
- confirms whether `hasAdminModelAccess` is active and surfaces the currently allowed AI tiers
- provides manual controls for `/api/news/health`, `/api/news/refresh`, and `/api/news/refresh-v2`
- uses the viewer's current session cookie rather than any separate admin token

### `/pricing`

Files:

- `app/pricing/page.tsx`
- `components/app/billing-action-button.tsx`

Purpose:

- public pricing page showing Free, Premium, and Ultimate plan cards

Current behavior:

- fetches live price labels from Stripe (`stripe.prices.retrieve`) for Premium and Ultimate
- shows feature lists per plan and CTA buttons
- discloses AI request quotas directly on the cards: Free `100/day`, Premium `5,000/month`, Ultimate `20,000/month`
- shows the current 7-day first-paid-subscription trial copy when the viewer has not yet used the trial
- Premium CTA and Ultimate CTA create Stripe Checkout sessions
- already-subscribed users on paid plans are rejected (409) by the checkout route
- shows `billing=cancel` feedback when returning from a cancelled checkout

### `/terms`

Files:

- `app/terms/page.tsx`

Purpose:

- public Terms of Service page linked from login and the first-time profile completion flow

Current behavior:

- renders a fixed legal document with static effective/last-updated dates from `lib/legal/constants.ts`
- aligns billing language with Stripe Checkout for new subscriptions, Stripe Customer Portal for upgrades/downgrades/cancellation, and the current 7-day first-paid-subscription trial
- cross-links to `/privacy` and uses explicit placeholders for operator identity, contact email, mailing address, refund terms, and governing jurisdiction that must be finalized before launch
- styled with dark theme matching the rest of the app
- includes a "Back to home" link at the top
- linked from `/login` and the ToS checkbox on `/complete-profile`

### `/privacy`

Files:

- `app/privacy/page.tsx`
- `components/legal/legal-document-shell.tsx`
- `lib/legal/constants.ts`

Purpose:

- public Privacy Policy route for Canadian/Ontario-oriented disclosure

Current behavior:

- covers auth/profile data, portfolio/holdings/watchlist data, billing/subscription metadata, article/chat inputs, community content, essential cookies/preferences, security checks/logs, and admin/support access
- names the actual processors/services reflected in the repo or deployment model: Supabase, Stripe, Vercel, Cloudflare Turnstile, configurable AI providers, and third-party market/news providers where applicable
- describes cross-border processing, request-based privacy rights handling, retention/safeguards/breach notice posture, and links back to `/terms`

### `/digest/[digestId]`

Files:

- `app/digest/[digestId]/page.tsx`

Purpose:

- authenticated owner-only view of a stored daily digest snapshot

Current behavior:

- unauthenticated users are redirected to `/login?redirectTo=/digest/...`
- users can only read their own `notification_digests` rows
- renders the digest window, summary line, bullish/bearish leaders, and stored top stories
- supports `?story=...` highlighting for links that deep-link to a specific digest story
- current outbound email/SMS story links prefer `/feed?story=<newsItemId>`, but this route remains useful for stored snapshot inspection
- external article URLs are sanitized before rendering

## API Routes

### `POST /api/news/refresh` (deprecated)

File:

- `app/api/news/refresh/route.ts`

**Deprecated**: retained for admin/debug use only. No user-facing UI calls this route anymore. Production ingestion and analysis now run via the 20-minute cron job.

Behavior (unchanged, but no longer user-triggered):

- authenticated + allowlist admin only
- resolves selected portfolio or latest one
- requires holdings
- resolves global ticker universe from all holdings in DB
- runs Python worker on global sources
- fetches Finnhub targeted company news for selected portfolio
- enriches newly inserted articles with AI
- runs portfolio analysis
- returns per-stage details plus pool snapshot and analysis metadata

### `POST /api/news/refresh-v2` (deprecated, admin/debug candidate path)

File:

- `app/api/news/refresh-v2/route.ts`

Behavior:

- authenticated + allowlist admin only
- resolves the selected portfolio or latest one owned by the admin caller
- requires holdings
- resolves the global ticker universe from all holdings/watchlist symbols in DB
- builds candidate portfolio keyword queries from the selected portfolio holdings
- runs the candidate Python worker path (`providerSet=candidate`) using EDGAR + NewsAPI.ai + GNews + NewsCatcher
- extracts publisher content, enriches inserted articles, runs analysis for the selected portfolio, and returns per-stage details plus pool snapshot and analysis metadata

Important:

- manual/testing-only path; no public UI outside the admin console calls this route
- writes to the same `news_items` table as the current pipeline
- does not include Finnhub targeted news
- useful for side-by-side candidate provider validation before cutover

### `POST /api/analysis/run`

File:

- `app/api/analysis/run/route.ts`

Behavior:

- authenticated
- requires `portfolioId`
- directly runs analysis on existing pool
- returns `{ runId, meta }`

### `GET /api/analysis/run`

Supports:

- `?runId=...`
- `?portfolioId=...`

Behavior:

- authenticated
- returns current/latest run state

### `GET /api/feed`

File:

- `app/api/feed/route.ts`

Supported modes:

- `mode=personal`
- `mode=market`

Current filters:

- `portfolioId`
- `holding`
- `sector`
- `category`
- `maxMinutes`
- `ticker`
- `sourceType`
- `sort`
- `page`
- `pageSize`

Important behavior:

- feed age is capped to 24 hours for both modes
- personal mode joins `feed_items` to `news_items` for the latest `complete` or `degraded` analysis run
- personal mode returns `matchSources` per story (`"portfolio"`, `"watchlist"`, or both)
- watchlist-only fallback: if user has no portfolio but has watchlist items, personal mode performs lightweight on-the-fly matching against `news_items` using watchlist symbols
- market mode reads `news_items` directly
- market mode marks stories as portfolio matches and/or watchlist matches (`isPortfolioMatch`, `isWatchlistMatch`)
- `hot` sort falls back to recent with a notice when every visible story has `detail_open_count <= 0`
- response includes `watchlistSymbols` array alongside existing `portfolioSymbols` and `portfolioSectors`

### `POST /api/feed/open`

File:

- `app/api/feed/open/route.ts`

Behavior:

- authenticated
- accepts `{ newsItemId }`
- calls the `increment_news_item_detail_open_count` RPC with the service role client
- returns `{ ok: true, detailOpenCount }`
- tracking failures are intentionally non-blocking in the UI

### `GET /api/article-chat`

File:

- `app/api/article-chat/route.ts`

Behavior:

- authenticated
- requires `portfolioId` and `newsItemId`
- verifies portfolio ownership
- validates the news item exists
- lazily creates or loads article chat thread
- returns `{ threadId, messages, turnstileVerified }`

### `POST /api/article-chat`

Behavior:

- authenticated
- requires `portfolioId` and `message`; `newsItemId` is optional
- with `newsItemId`, persists a story-scoped chat thread and stores messages
- without `newsItemId`, answers general feed/portfolio questions using ephemeral messages and no article thread
- validates Turnstile unless the request has a valid 15-minute portfolio-wide chat grant cookie
- mints the chat grant cookie after successful Turnstile verification and still attempts to mint it on downstream provider/billing/storage failures via `respondForChat`
- verifies model-tier access plus durable AI burst/quota limits before admitting the request
- model tier maps to provider: free/OpenRouter, premium/Mistral, ultimate/Azure
- story mode loads article + holdings + latest feed match context and calls `ai.answerArticleQuestion(...)`
- general mode loads portfolio overview + holdings + insights + recent feed + watchlist symbols and calls `ai.answerPortfolioQuestion(...)`
- providers do **not** fall back to the stub on failure; empty or failed generations surface as `AIChatError` / `toArticleChatError`
- may return **403** with `{ error, code: "plan_upgrade_required", currentPlan, requiredPlan, requestedTier }` when the requested model tier exceeds the user's effective access
- may return **429** with `{ error, code: "rate_limited", retryAfterMs, resetsAt }` when the durable per-minute burst cap is exceeded
- may return **429** with `{ error, code: "quota_exceeded", quotaWindow, quotaLimit, quotaUsed, resetsAt }` when the shared AI quota window is exhausted
- on provider failure: returns **503** with `{ error, code }` (`AIChatErrorCode`), logs provider + deployment server-side; **does not** insert an assistant row
- error codes map to distinct user-facing messages: `provider_auth` -> credentials/config hint; `provider_timeout` -> retry hint; `provider_bad_response` -> rephrase hint; `provider_unavailable` -> generic retry
- on story success: stores assistant reply and returns `{ threadId, messages }`
- on general success: returns `{ threadId: null, messages }`

### `POST /api/portfolio-copilot`

File:

- `app/api/portfolio-copilot/route.ts`

Behavior:

- authenticated
- requires `portfolioId` and `message`
- validates Turnstile unless the request has a valid 15-minute portfolio-wide chat grant cookie
- mints the chat grant cookie after successful Turnstile verification and still attempts to mint it on downstream provider/billing/storage failures via `respondForChat`
- verifies model-tier access plus durable AI burst/quota limits before calling the provider
- loads portfolio overview, holdings, latest insights, and latest feed context
- accepts optional recent chat `history` and client-provided `watchlistSymbols`
- may return **403** with `{ error, code: "plan_upgrade_required", currentPlan, requiredPlan, requestedTier }`
- may return **429** with `{ error, code: "rate_limited" | "quota_exceeded", retryAfterMs?, quotaWindow?, quotaLimit?, quotaUsed?, resetsAt? }`
- calls `ai.answerPortfolioQuestion(...)`
- returns `{ answer }`

### `POST /api/news/ingest` (deprecated)

File:

- `app/api/news/ingest/route.ts`

**Deprecated**: retained for admin/debug use only. Production ingestion now runs via the 20-minute cron job.

Behavior (unchanged):

- authenticated + allowlist admin only
- resolves global ticker universe
- runs Python worker
- enriches inserted articles
- does not run portfolio analysis

### `POST /api/news/cron`

File:

- `app/api/news/cron/route.ts`

Behavior:

- secured by `CRON_SECRET`
- accepts the GitHub ingest payload generated by `python -m workers.news_ingestion.cron_runner`
- **primary finalize path** — GitHub Actions runs every 20 minutes, generates the ingest payload, and `POST`s it here
- the GitHub runner resolves the global ticker universe from all holdings and watchlist symbols, runs EDGAR, NewsAPI, GNews, and Finnhub ingestion, then posts the resulting payload here
- extracts publisher content for newly inserted articles
- enriches newly inserted articles with AI
- **runs analysis for ALL portfolios** automatically
- skips recently analyzed portfolios (15-minute cooldown)
- returns per-portfolio analysis results with processed/skipped/error counts
- logs cron start/end summaries with duration, inserted counts by source, enrichment count, and analysis processed/skipped/error totals

Important:

- this is the single source of truth for fresh `news_items`
- user-triggered refresh (`/api/news/refresh`) is deprecated
- personal feed updates depend on this cron completing
- `.github/workflows/news-cron.yml` schedules the production endpoint every 20 minutes in UTC
- deployed Vercel runtime compatibility for `runPythonWorker()` must be verified manually

### `POST /api/news/cron/v2`

File:

- `app/api/news/cron/v2/route.ts`

Behavior:

- secured by `NEWS_V2_CRON_SECRET` (separate from `CRON_SECRET`)
- accepts the candidate ingest payload generated by `python -m workers.news_ingestion.cron_runner_v2`
- **Phase 1 candidate finalize path** — triggered only via `workflow_dispatch` (manual) from `.github/workflows/news-cron-v2.yml`
- the GitHub runner resolves the global ticker universe, builds portfolio keyword queries, runs EDGAR, NewsAPI.ai, GNews, and NewsCatcher ingestion, then posts the resulting payload here
- same post-ingest pipeline as the current path: extraction, enrichment, analysis
- enrichment/extraction/analysis steps reuse the existing shared endpoints via `CRON_ENDPOINT` + `CRON_SECRET`
- writes to the same `news_items` table (no separate candidate table)

Important:

- this is NOT scheduled automatically; it runs only on manual dispatch
- no cross-provider dedupe with the current pipeline in Phase 1
- source types `newsapi_ai` and `newscatcher` are new text values in the `source_type` column
- candidate articles are visible in feeds and affect analysis immediately
- `.github/workflows/news-cron-v2.yml` needs valid `NEWSAPI_AI_API_KEY` / `NEWSCATCHER_API_KEY`, and the deployed app serving this route must also have `NEWS_V2_CRON_SECRET`

### `GET /api/news/health`

File:

- `app/api/news/health/route.ts`

Behavior:

- authenticated + allowlist admin only
- runs worker preflight using `python -m workers.news_ingestion.main --check`
- verifies Python availability and worker dependencies/config

### `POST /api/news/cron/enrich`

File:

- `app/api/news/cron/enrich/route.ts`

Behavior:

- secured by `CRON_SECRET` + timing-safe comparison
- accepts `{ articleIds: string[] }`, max batch size 10
- runs AI enrichment on specific article IDs via `ingestNewsToSupabase`
- returns `{ requested, enriched, skipped, error }`
- rejects empty arrays, non-array bodies, and batches exceeding max size

### `GET /api/analysis/cron`

File:

- `app/api/analysis/cron/route.ts`

Behavior:

- secured by `CRON_SECRET`
- computes eligible portfolio IDs by checking 15-minute cooldown against latest completed `analysis_runs`
- `?force=true` bypasses cooldown
- returns `{ portfolioIds, skippedCount }`

### `POST /api/analysis/cron`

Behavior:

- secured by `CRON_SECRET`
- accepts `{ portfolioId, force? }`
- runs `runAnalysis` for a single portfolio
- respects 15-minute cooldown unless `force: true`
- returns `{ portfolioId, skipped, runId, error, meta }`

### `POST /api/portfolio/sync-prices`

File:

- `app/api/portfolio/sync-prices/route.ts`

Behavior:

- authenticated
- accepts `{ portfolioId }`
- calls `syncHoldingPricesIfStale` with 5-minute freshness window
- then calls `getPortfolioOverview` for fresh data
- returns sync result merged with overview
- proper 401/404/500 error status codes

### `POST /api/portfolio/value-snapshots/cron`

File:

- `app/api/portfolio/value-snapshots/cron/route.ts`

Behavior:

- secured by `PORTFOLIO_SNAPSHOT_CRON_SECRET` if present, otherwise `CRON_SECRET`
- `GET` returns 405 guidance; only `POST` runs the job
- optional `?now=...` test override is parsed as a date
- calls `recordPortfolioValueSnapshots({ now })`
- loads portfolios/holdings with the service-role client, refreshes Yahoo quotes, updates current holding quote fields, and upserts one UTC-hour snapshot per portfolio
- route returns 500 only when all snapshot attempts fatally fail
- `.github/workflows/portfolio-value-snapshots.yml` runs hourly at minute 5 and derives the endpoint from `CRON_ENDPOINT`

### `POST /api/notifications/daily-digest/cron`

File:

- `app/api/notifications/daily-digest/cron/route.ts`

Behavior:

- secured by `DIGEST_CRON_SECRET` + timing-safe comparison
- `GET` returns 405 guidance; only `POST` runs the job
- optional `?now=...` test override is parsed as a date
- calls `runDailyDigestCron({ now, request })`
- route returns 200 when all attempted deliveries are sent/skipped, 500 if any delivery fails or is uncertain
- `.github/workflows/daily-digest.yml` invokes it at `0,15,30,45 13,14 * * *` UTC, while the service itself gates to `9 AM America/New_York`

### `POST /api/earnings-reports/cron`

File:

- `app/api/earnings-reports/cron/route.ts`

Behavior:

- secured by `CRON_SECRET` + timing-safe comparison
- `GET` returns 405 guidance; only `POST` runs the job
- calls `syncTrackedEarningsReports(createServiceClient())`
- syncs tracked symbols from all holdings and watchlist items
- writes active/inactive rows in `ticker_earnings_reports`
- `.github/workflows/earnings-report-sync.yml` invokes it daily at `17 9 * * *` UTC and supports `workflow_dispatch`

### `POST /api/billing/checkout`

File:

- `app/api/billing/checkout/route.ts`

Behavior:

- authenticated
- accepts `{ plan: "premium" | "ultimate" }`
- creates a Stripe Checkout Session
- includes 7-day trial if user has never trialed before
- stores `user_id` and `plan_key` in subscription metadata
- prevents duplicate subscriptions (409)
- redirects success to `/settings?billing=success`, cancel to `/pricing?billing=cancel`
- returns `{ url }` for client redirect

### `POST /api/billing/portal`

File:

- `app/api/billing/portal/route.ts`

Behavior:

- authenticated
- requires existing `stripeCustomerId`
- creates a Stripe Customer Portal session
- return URL is `/settings`
- returns `{ url }` for client redirect

### `POST /api/stripe/webhook`

File:

- `app/api/stripe/webhook/route.ts`

Behavior:

- `runtime = "nodejs"`
- validates Stripe signature via `requireStripeWebhookSecret`
- handles: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- idempotent via `claimStripeEvent`, `markStripeEventProcessed`, and `markStripeEventFailed`
- returns 409 when another fresh worker is already processing the same event
- reclaims failed or stale `processing` events after the configured timeout
- stores minimal audit payload (`buildEventAuditPayload`) not the full Stripe object
- syncs customer record and subscription to DB
- returns 200 with `{ received: true, ignored: true }` for unhandled event types

## Server Actions And Portfolio Logic

Main file:

- `lib/actions/portfolio.ts`

Key actions:

- `previewCSVImport`
- `previewCSVWithMapping`
- `resolveSymbol`
- `saveHoldings`
- `createPortfolio`
- `getPortfolio`
- `getUserPortfolios`
- `updateHolding`
- `deleteHolding`
- `getPortfolioOverview`
- `getPortfolioInsights`
- `getPortfolioFeedHighlights`
- `refreshHoldingPrices`
- `syncHoldingPrices`
- `addPortfolioPosition`
- `recordHoldingSale`
- `recordHoldingAdd`
- `refreshPortfolioPricingSnapshot` — calls `syncHoldingPricesIfStale` + returns fresh overview/holdings for client-side state updates

Watchlist server actions file:

- `lib/actions/watchlist.ts`

Key watchlist actions:

- `loadWatchlistItems` — loads user's saved watchlist rows from DB
- `refreshWatchlistPrices` — re-fetches Finnhub quotes for all items, updates DB
- `searchWatchlistCandidates(query)` — Finnhub symbol search, returns up to 5 candidates
- `addWatchlistItem(candidate)` — upserts symbol to `watchlist_items`
- `deleteWatchlistItem(id)` — removes from DB
- `getWatchlistItemDetails(symbol)` — fetches Twelve Data detail for dashboard

Notification preferences actions file:

- `lib/actions/notifications.ts`

Key notification actions:

- `getCurrentUserNotificationPreferences` - loads the signed-in user's digest email/SMS flags and phone number, falling back to disabled defaults
- `saveCurrentUserNotificationPreferences(input)` - validates E.164 phone number requirements, upserts `user_notification_preferences`, and revalidates `/settings`

Profile actions file:

- `lib/actions/profile.ts`

Key profile actions:

- `getCurrentUserProfile` — loads stored profile fields and derives fallbacks from OAuth metadata
- `saveCurrentUserProfile` — validates and upserts first name, last name, display name, handle, avatar
- `completeProfileAction` — save + redirect wrapper for `/complete-profile`

Important boundary:

- `lib/actions/profile.ts` is a `"use server"` module and must remain async-only
- sync profile helpers/types such as `UserProfileFormData` and `isProfileComplete` live in `lib/profile/utils.ts`

Important save semantics:

- create portfolio if needed
- if `mode=replace`, delete existing holdings first
- if `mode=merge`, upsert by symbol within portfolio
- update `portfolios.source_type`
- fetch live quotes where possible
- recompute allocations
- update `last_synced_at`
- revalidate `/portfolio`, `/onboarding`, `/feed`, `/analysis`

## Portfolio Overview / Quote Logic

Main file:

- `lib/services/portfolio.ts`

Behavior:

- loads holdings
- attempts Yahoo quotes for current prices and daily change
- falls back to DB values if Yahoo fails
- computes total portfolio value and weighted day change
- reads latest completed or degraded run for `lastAnalyzedAt`
- reads `feed_items` count for coverage string

Note:

- monthly change is currently hardcoded to `0`

## CSV Parser

Main file:

- `lib/services/csv-parser.ts`

Capabilities:

- delimiter detection for comma/semicolon/tab
- header alias matching
- optional manual mapping fallback
- supports both holdings files and transaction-style files
- aggregates transactions into positions when file is detected as transactional

Important caveats:

- transaction inference is heuristic
- sell handling clamps oversold positions and records warnings
- quote currency defaults to `USD`

## Yahoo Finance Integration

Main file:

- `lib/services/yahoo-finance.ts`

Used for:

- symbol search / resolution during onboarding
- quote refresh after save
- portfolio display price refresh

Failure behavior:

- app generally falls back gracefully if Yahoo fails

## Finnhub Service

Main file:

- `lib/services/finnhub.ts`

Used for:

- watchlist symbol search (`searchSymbols`)
- watchlist quote refresh (`getQuote`)

Behavior:

- `searchSymbols(query)` calls Finnhub `/search`, filters to equities/ETFs, enriches top 5 with live quotes
- `getQuote(symbol)` returns raw Finnhub quote (current, change, percent change, etc.)
- requires `FINNHUB_API_KEY` (required for watchlist, not optional)
- 8-second timeout on all requests

Error handling:

- throws typed `FinnhubError` with a `code` property classifying the failure
- error codes: `missing_key`, `unauthorized`, `rate_limited`, `timeout`, `http_error`, `bad_payload`
- `searchWatchlistCandidates` in `lib/actions/watchlist.ts` catches `FinnhubError` and maps each code to a specific user-facing message instead of a generic fallback
- transient failures (`rate_limited`, `timeout`, `http_error`, `bad_payload`) are flagged `retryable: true` so the UI can offer a retry button

Note: news-specific Finnhub calls are in `lib/services/news/finnhub-refresh.ts`, not this file.

## Server-Side Cache

Main file:

- `lib/services/cache.ts`

Provides:

- `cacheGet<T>(key)` / `cacheSet(key, value, ttlMs)` / `cacheDel(key)` — basic in-memory TTL cache
- `cached<T>(key, fn, ttlMs)` — fetch-through helper: returns cached value if fresh, else calls `fn` and caches result

Used by:

- Twelve Data service: profile (30 min TTL), quote (1 min TTL), time_series (5 min TTL)
- Prevents repeated API calls when the same watchlist symbol is viewed multiple times

## Environment Validation

Main file:

- `lib/env.ts`

Provides:

- `requireSupabaseUrl()`, `requireSupabaseAnonKey()` — core Supabase config
- `requireFinnhubKey()`, `requireTwelveDataKey()` — provider keys
- `requireDigestCronSecret()`, `requireResendApiKey()`, `requireTwilioAccountSid()`, `requireTwilioAuthToken()`, `requireTwilioMessagingServiceSid()` - daily digest cron/delivery keys
- `hasKey(name)` — boolean check for any env var
- `checkOptionalProviders()` — emits `console.warn` for missing optional keys
- `validateAzureConfig()` — returns `{ ok, issues, key, baseUrl, model }`:
  - detects placeholder API keys (e.g. `your-azure-openai-api-key`)
  - validates base URL contains `*.openai.azure.com`
  - validates model/deployment is present
  - used by `createAzureOpenAIProvider` to fail fast with `AIChatError("provider_auth", ...)` on misconfigured Azure
- `validateMistralConfig()` — returns `{ ok, issues, key, model }`:
  - checks `MISTRAL_API_KEY` (detects placeholder values)
  - defaults `MISTRAL_MODEL` to `mistral-large-latest`
  - used by `createMistralProvider` to fail fast on misconfigured Mistral

All checks are lazy (called on demand), not eager on import, so tests and local dev without all keys still work.

## Structured Logging

Main file:

- `lib/logger.ts`

Provides:

- `createLogger(scope)` — returns `{ info, warn, error }` functions
- Each emits timestamped, scoped structured log lines: `[ISO] [LEVEL] [scope] message {data}`
- Data is JSON-serialized and appended when present
- No secrets are included in log output

Used by:

- `lib/services/finnhub.ts` — logs HTTP errors, timeouts, network failures
- `lib/services/twelvedata.ts` — logs HTTP errors, timeouts, partial endpoint failures
- `lib/actions/watchlist.ts` — logs search failures with typed error codes
- daily digest and earnings-report cron/services log job start/completion/failure summaries

## Twelve Data Service

Main file:

- `lib/services/twelvedata.ts`

Used for:

- watchlist detail dashboard (quote, profile, price chart, stats, earnings, financials)
- latest earnings-report metadata shown in the watchlist detail earnings card

Behavior:

- `getWatchlistDetail(symbol)` fetches 8 Twelve Data endpoints in parallel via `Promise.allSettled`:
  - `/quote` (1 min cache) — price, change, market cap, 52w range
  - `/profile` (30 min cache) — sector, industry, CEO, employees, description
  - `/time_series` (5 min cache) — 30-day daily closes for chart
  - `/statistics` (30 min cache) — P/E, EPS, beta, dividend yield, margins
  - `/earnings` (60 min cache) — last 8 quarters EPS actual/estimate/surprise
  - `/income_statement` (60 min cache) — quarterly revenue + net income
  - `/balance_sheet` (60 min cache) — quarterly debt + cash
  - `/cash_flow` (60 min cache) — quarterly free cash flow
- Returns sectioned `WatchlistDetailData`:
  - `summary` — company, exchange, currency, price, change
  - `chart` — `ChartPoint[]`
  - `stats` — open/high/low/close, PE, EPS, beta, dividend yield, margins, growth
  - `profile` — sector, industry, country, CEO, employees, website, description
  - `earnings` — `EarningsDataPoint[]` (EPS + revenue actual/estimate per quarter)
  - `financials` — `FinancialDataPoint[]` (revenue, net income, debt, cash, FCF by fiscal date)
  - `capabilities` — `{ hasStats, hasProfile, hasEarnings, hasFinancials }` boolean flags
  - `warnings` — per-endpoint `SectionWarning[]` with failure code classification
- Error classification: `missing_key`, `unauthorized`, `rate_limited`, `timeout`, `plan_not_supported`, `network`, `unknown`
- Missing endpoints degrade gracefully — partial sections render; unavailable sections are hidden in the UI
- Requires `TWELVE_DATA_API_KEY`
- 10-second timeout on all requests

Watchlist detail dashboard (`components/app/watchlist-detail-dashboard.tsx`):

- Hero row: symbol, company, exchange, price, change/%, market open status
- Tab strip: **Overview** and **Financials**
- Overview tab:
  - 30-day price chart (recharts `AreaChart` with tooltips and axes)
  - Earnings card: last EPS, next estimate, bar chart of EPS actual vs estimate
  - Key stats grid: open/high/low/close, P/E, EPS, beta, dividend yield, margins, growth
  - Leadership card: CEO + employee count
  - About section: sector/industry badges, country, website, description
- Financials tab:
  - Revenue & Net Income bar chart
  - Debt, Cash & Free Cash Flow bar chart
  - EPS Actual vs Estimate bar chart
- Loading state: animated skeleton placeholder per section
- Error state: styled error card
- All sections hide gracefully when data is unavailable (no empty broken cards)

## Global Ticker Resolution

Main file:

- `lib/services/ticker-resolver.ts`

Behavior:

- reads all holdings across all portfolios
- reads all `watchlist_items` across all users
- combines, deduplicates, and sorts into one global ticker universe

This is used for EDGAR/global ingest and Finnhub targeted news in the cron job.

## News Pipeline

### Public news service surface

File:

- `lib/services/news/index.ts`

Exports:

- `ingestNewsToSupabase`
- pool snapshot helpers
- shared news types

### Python worker bridge

File:

- `lib/services/news/worker.ts`

Behavior:

- spawns `python -m workers.news_ingestion.main`
- falls back to `python3` if needed
- supports `sources` and GNews query overrides
- parses JSON result from stdout

### Source config

File:

- `lib/services/news/source-config.ts`

Current ingest sources:

- `edgar`
- `newsapi`
- `gnews`

Enrichable source types (eligible for AI enrichment):

- `edgar`
- `newsapi`
- `gnews`
- `finnhub` (added when Finnhub was included in the cron pipeline)
- `newsapi_ai`
- `newscatcher`

Current headline-style source types:

- `newsapi`
- `gnews`
- `finnhub`
- `marketaux`
- `newsapi_ai`
- `newscatcher`

### Finnhub targeted refresh

File:

- `lib/services/news/finnhub-refresh.ts`

Behavior:

- optional targeted company-news fetch for holdings
- up to 25 target holdings
- dedupes by normalized URL or headline
- uses source type `finnhub`
- stores related/target symbols in metadata

### GNews targeted queries

File:

- `lib/services/news/gnews-targeting.ts`

Behavior:

- builds holding-based GNews queries such as `"Company" TICKER stock`
- max 8 targeted queries

### Enrichment

File:

- `lib/services/news/ingest.ts`

Behavior:

- selects recent unenriched `news_items`
- calls AI article analysis
- populates:
  - `category`
  - `stock_tags`
  - `global_summary`
  - `overall_effect`
  - `ticker_impacts`

### Publisher article extraction (newspaper4k + PostgreSQL cache)

Primary implementation:

- `workers/news_ingestion/extract_full_text.py` — **newspaper4k** (replaces newspaper3k), desktop **User-Agent** on the Article config, SEC URL skip rules preserved
- URL-level dedupe via `article_extractions` table (`cache_key` = normalized URL); cache hit copies `content` to all matching `news_items` without re-scraping
- Writes long body to **`extracted_content`** (primary) and mirrors to **`full_content`** for legacy readers
- Per-row fields on `news_items`: `extraction_status` (`queued` \| `in_progress` \| `complete` \| `failed` \| `partial` \| `skipped`), `extraction_error`, `extracted_at`, `extraction_cache_key`
- Failed extractions respect a **cooldown** before retry (see `RETRY_COOLDOWN_SECONDS` in Python)

Non-blocking pipeline:

- **Node Readability / jsdom** path has been **removed** from `lib/services/news/publisher-extract.ts`
- `extractPublisherContent` only marks rows `queued` and **spawns** `python -m workers.news_ingestion.extract_full_text --ids ...` (fire-and-forget); does not fetch HTML in Node
- `lib/services/news/extraction-trigger.ts` — `spawnArticleExtractionWorker`
- Python worker `main.py` after ingest calls **`spawn_extraction_worker`** instead of awaiting extraction inline, so worker JSON returns while extraction runs in a **separate OS process**
- `/api/news/refresh` and `/api/news/ingest` return promptly; `stages.extraction` can be **`queued`** with copy that enrichment may use snippets until text arrives

Extraction scoping and diagnostics:

- Extraction is scoped to the **exact `inserted_ids`** returned by the Python worker and Finnhub ingest, not a generic `limit` query
- `extractPublisherContent` accepts `articleIds` as primary scope; when provided, each row is classified into a specific skip bucket:
  - `skippedMissingUrl` — row has no URL
  - `skippedUnsupportedSource` — source type not in extractable set (edgar, etc.)
  - `skippedAlreadyExtracted` — already has `extracted_content` or `extraction_status = complete`
  - `skippedUnsupportedUrl` — SEC/gov URLs that are skipped by policy
- Refresh/ingest/cron routes collect `inserted_ids` from all sources (`workerResult.edgar.inserted_ids`, etc. + `finnhubResult.inserted_ids`) and pass them to `extractPublisherContent({ articleIds })`
- `stages.extraction.detail` includes per-reason skip counts (e.g. "0 extracted: 2 missing URLs, 1 unsupported sources")
- `extractionStats` in the response JSON includes all skip counters so the UI can render an extraction diagnostics panel
- `analysis-run-trigger.tsx` shows an "Extraction skip reasons" panel when extraction is skipped/partial with non-zero skip counters

Article chat:

- `app/api/article-chat/route.ts` loads `extracted_content`, `full_content`, `extraction_status`; builds `primaryBody` = extracted → full → raw; sets `extractionPending` when only snippet is available and extraction is not complete
- `lib/services/ai/prompts.ts` — `articleChatPrompt` prefers extracted text and appends a note when extraction is still pending

Migration:

- `supabase/migrations/010_article_extractions.sql`

### Pool snapshot

File:

- `lib/services/news/pool-snapshot.ts`

Behavior:

- tracks 24-hour pool size and latest published timestamp
- used in refresh route and analysis metadata

## Analysis Logic

Main file:

- `lib/services/analysis.ts`

Key constants:

- `ANALYSIS_NEWS_POOL_LIMIT = 500`
- `ANALYSIS_RELEVANCE_MIN = 60`

Core behavior:

- creates/updates `analysis_runs`
- reclaims stale active runs before creating a new run
- relies on a DB uniqueness constraint so only one active run per portfolio can exist
- reads holdings for the selected portfolio
- reads the user's `watchlist_items` (resolved via `portfolio.user_id`)
- reads newest 500 `news_items` from the last 24 hours
- performs dual matching: checks articles against both portfolio holdings and watchlist symbols
- persists `feed_items` only when relevance is high enough
- writes `portfolio_insights`
- persists `match_sources` (array of `"portfolio"`, `"watchlist"`, or both) on each `feed_item`
- marks the run `degraded` instead of `complete` when AI failures are high enough to make output unreliable
- keeps only the newest 3 analysis runs per portfolio and purges `feed_items` older than 14 days on successful/degraded completion

Important match behavior:

- portfolio direct match: `held_ticker_tag`, `held_ticker_impact`
- watchlist direct match: `watchlist_ticker_tag`, `watchlist_ticker_impact`
- if both portfolio and watchlist match, reason codes and match sources are merged
- watchlist-only matches get a fixed relevance of 75 (no AI assessment)
- portfolio-only indirect matches still use AI portfolio match assessment
- `match_sources` column tracks which asset set triggered each feed item

Important guardrails:

- generic "why it matters" text is sanitized away
- sector-only matches require stronger evidence
- no generic fallback feed exists anymore
- when the user has no holdings but has watchlist items, AI assessment is skipped and only direct watchlist matching runs

Implication:

- personal feed can include stories matched through watchlist only, portfolio only, or both
- latest usable feed/page data includes both `complete` and `degraded` runs
- personal feed can still be empty even when the global news pool is not

## AI Layer

Main files:

- `lib/services/ai/index.ts`
- `lib/services/ai/provider.ts`
- `lib/services/ai/prompts.ts`
- `lib/services/ai/stub-provider.ts`
- `lib/services/ai/openrouter-provider.ts`
- `lib/services/ai/openai-provider.ts`
- `lib/services/ai/anthropic-provider.ts`
- `lib/services/ai/azure-openai-provider.ts`
- `lib/services/ai/mistral-provider.ts`
- `lib/services/ai/portfolio-match.ts`
- `lib/services/ai/holding-name-utils.ts`

`AIProviderId` union type: `"azure" | "anthropic" | "openai" | "openrouter" | "mistral"`

Provider selection in `lib/services/ai/index.ts`:

- `AI_PROVIDER=azure` -> Azure OpenAI provider
- `AI_PROVIDER=mistral` -> Mistral provider
- `AI_PROVIDER=anthropic` -> Anthropic provider
- `AI_PROVIDER=openai` -> public OpenAI provider
- `AI_PROVIDER=openrouter` -> OpenRouter provider
- unset/unknown -> public OpenAI provider

Stub fallback:

- if required provider credentials are missing, `stubAIProvider` is used

Prompt families implemented:

- article enrichment / classification
- summary
- sentiment
- numeric relevance
- portfolio match assessment
- why-it-matters
- portfolio insights
- article chat
- portfolio copilot

## Current AI Provider Setup

### OpenRouter / StepFun

Files:

- `lib/services/ai/openrouter-provider.ts`
- `scripts/test-openrouter.mjs`

Current default OpenRouter model:

- `stepfun/step-3.5-flash:free`

Notes:

- OpenRouter path remains intact by request
- it remains available for switching, but is no longer the active runtime path in `.env`

### Public OpenAI

File:

- `lib/services/ai/openai-provider.ts`

Current state:

- still points at the public OpenAI Chat Completions endpoint
- model is hardcoded to `gpt-4o-mini`
- this is separate from Azure support

### Anthropic

File:

- `lib/services/ai/anthropic-provider.ts`

Current state:

- adapter exists
- used only when `AI_PROVIDER=anthropic`

### Azure OpenAI

Files:

- `lib/services/ai/azure-openai-provider.ts`
- `lib/services/ai/ai-chat-errors.ts`
- `scripts/test-azure-openai.mjs`

Behavior:

- uses Azure OpenAI Responses API
- normalizes base URL to `/openai/v1/`
- uses `AZURE_OPENAI_MODEL` or `AZURE_OPENAI_DEPLOYMENT` as deployment name
- supports `AZURE_OPENAI_REASONING_EFFORT`
- on creation, runs `validateAzureConfig()` from `lib/env.ts`; if config is invalid (missing key, placeholder key, wrong host, missing model), returns a provider that:
  - uses stub for non-chat methods (enrichment, scoring, etc.)
  - **throws `AIChatError("provider_auth", ...)`** for `answerArticleQuestion` and `answerPortfolioQuestion`
  - logs the specific config issues server-side
- on HTTP errors from Azure, the `respond()` helper includes the Azure error `code` and `message` in the thrown error for accurate classification by `toArticleChatError`
- article chat uses `ARTICLE_CHAT_MAX_TOKENS = 2000` from `lib/services/ai/constants.ts`
- `answerArticleQuestion()` no longer falls back to the stub in production; it throws on provider/config failures so the route can return a truthful error instead of a canned answer
- the route logs provider failure code, provider id, and deployment label before returning `503`

Expected environment:

- `AI_PROVIDER=azure`
- `AZURE_OPENAI_API_KEY` — must be a real Azure API key, not a placeholder
- `AZURE_OPENAI_BASE_URL` — must be `https://YOUR-RESOURCE.openai.azure.com` (not AI Foundry)
- `AZURE_OPENAI_MODEL` — must match the Azure deployment name

Important caveat:

- `AZURE_OPENAI_MODEL` must be the Azure deployment name, not just the family label
- if article chat returns "Article chat is temporarily unavailable. Please try again later.", the route is surfacing a real AI-provider/config/runtime failure rather than inventing a stub response

Smoke test:

- `scripts/test-azure-openai.mjs` runs two checks: basic completion and article-chat simulation
- validates config before making any HTTP calls (detects placeholder keys, wrong hosts)
- run: `node --env-file=.env scripts/test-azure-openai.mjs`
- run chat only: `node --env-file=.env scripts/test-azure-openai.mjs --chat-only`

### Azure endpoint mismatch warning

The user showed published Foundry agent endpoints like:

- `https://...services.ai.azure.com/api/projects/...`

Those are Azure AI Foundry Agent Service endpoints.

The current app integration does not use those endpoints.

The Azure provider in this repo expects Azure OpenAI endpoints like:

- `https://YOUR-RESOURCE.openai.azure.com`
- or `https://YOUR-RESOURCE.openai.azure.com/openai/v1/`

If a future task wants to call the published agent directly, that is a separate integration path and should not be confused with the current `azure-openai-provider.ts` implementation.

### Mistral

File:

- `lib/services/ai/mistral-provider.ts`

Behavior:

- full `IAIProvider` implementation using `https://api.mistral.ai/v1/chat/completions`
- config validated via `validateMistralConfig()` from `lib/env.ts`
- on invalid config (missing key, placeholder key): stubs non-chat methods, **throws `AIChatError("provider_auth", ...)`** for `answerArticleQuestion` and `answerPortfolioQuestion`
- implements all provider methods: enrichment, scoring, article chat, portfolio copilot
- uses `ARTICLE_CHAT_MAX_TOKENS` from `lib/services/ai/constants.ts`

Expected environment:

- `AI_PROVIDER=mistral`
- `MISTRAL_API_KEY` — must be a real Mistral API key
- `MISTRAL_MODEL` — optional, defaults to `mistral-large-latest`

### Tiered AI Model Selection (Billing-Driven)

The billing system drives a tiered AI provider model:

- free plan users -> OpenRouter (StepFun `step-3.5-flash:free`)
- premium plan users -> Mistral (`mistral-large-latest`)
- ultimate plan users -> Azure OpenAI (`gpt-5.2`)

Key files:

- `lib/billing/plans.ts` - `providerIdForTier()`, `allowedModelTiersForPlan()`, `isTierAllowedForPlan()`
- `lib/billing/subscriptions.ts` - `assertUserCanUseModelTier()` throws `BillingAccessError` if tier is gated
- `lib/security/ai-access.ts` - `assertUserCanUseAI()` layers model-tier entitlement, durable burst limits, and quota consumption
- `lib/types.ts` - `ArticleChatModelTier = "free" | "premium" | "ultimate"`

## Recommended Portfolio-News System Prompt

Provided in this session for agent/assistant setup:

```text
You are a portfolio news copilot. Analyze each article for market relevance, affected tickers, sentiment, portfolio impact, and what the investor should watch next. Be factual, concise, and cautious. Separate article facts from inference. Do not assume real-time data unless provided. Prefer clear structured output and valid JSON when requested. This is not personalized financial advice.
```

## Database Schema

Source of truth:

- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_holdings_position_fields.sql`
- `supabase/migrations/003_portfolio_source_csv.sql`
- `supabase/migrations/004_news_classification.sql`
- `supabase/migrations/005_news_source_fields.sql`
- `supabase/migrations/006_article_chat.sql`
- `supabase/migrations/007_feed_match_reason_codes.sql`
- `supabase/migrations/008_extracted_content.sql`
- `supabase/migrations/008_news_full_content.sql`
- `supabase/migrations/009_watchlist_items.sql`
- `supabase/migrations/010_article_extractions.sql`
- `supabase/migrations/011_community.sql`
- `supabase/migrations/012_user_profile_names.sql`
- `supabase/migrations/013_feed_match_sources.sql`
- `supabase/migrations/014_billing.sql`
- `supabase/migrations/015_billing_events_rls.sql`
- `supabase/migrations/016_billing_private_rls.sql`
- `supabase/migrations/017_redact_billing_payloads.sql`
- `supabase/migrations/018_lock_down_news_item_writes.sql`
- `supabase/migrations/019_news_detail_open_count.sql`
- `supabase/migrations/019_user_accepted_terms.sql`
- `supabase/migrations/020_durable_ai_usage_limits.sql`
- `supabase/migrations/021_phase2_security_and_concurrency.sql`
- `supabase/migrations/022_stale_recovery_backfill.sql`
- `supabase/migrations/023_analysis_run_heartbeat.sql`
- `supabase/migrations/024_daily_digest_notifications.sql`
- `supabase/migrations/024_ticker_earnings_reports.sql`

### Core enums from initial schema

- `source_type`
- `sync_status`
- `analysis_status`
- `sentiment_type`
- `impact_level`

Later enum value:

- `analysis_status` includes `degraded` after migration `021_phase2_security_and_concurrency.sql`

### `portfolios`

Purpose:

- one portfolio per user entry

Key columns:

- `id`
- `user_id`
- `name`
- `source_type`
- `sync_status`
- `last_synced_at`
- timestamps

### `holdings`

Purpose:

- positions inside a portfolio

Originally included:

- symbol/company/sector/market/source/price/daily_change/allocation/thesis

Later schema expanded with position fields:

- quantity
- average_cost
- cost basis and current value style fields
- quote metadata
- import source

### `analysis_runs`

Purpose:

- pipeline execution tracking per portfolio

Key fields:

- `status`
- `progress`
- `started_at`
- `completed_at`
- `updated_at` heartbeat/staleness timestamp

### `news_items`

Purpose:

- global news pool

Initial fields:

- `headline`
- `source`
- `url`
- `published_at`
- `angle`
- `raw_content`

Later fields:

- `category`
- `stock_tags`
- `global_summary`
- `overall_effect`
- `ticker_impacts`
- `source_type`
- `external_id`
- `category_hint`
- `metadata`
- `detail_open_count`
- extraction fields: `extracted_content`, `extraction_status`, `extraction_error`, `extracted_at`, `extraction_cache_key`

Important indexing:

- `published_at`
- GIN on `stock_tags`
- unique dedupe index on `(source_type, external_id)` when `external_id` is present

### `feed_items`

Purpose:

- portfolio-specific scored article rows

Core fields:

- `analysis_run_id`
- `news_item_id`
- `portfolio_id`
- `relevance_score`
- `sentiment`
- `impact`
- `holdings`
- `sectors`
- `ai_summary`
- `why_it_matters`

Later fields:

- `matched_stock_tags`
- `display_effect`
- `source_confidence`
- `match_reason_codes`
- `match_sources` (added by migration 013: array of `"portfolio"`, `"watchlist"`, or both)

### `portfolio_insights`

Purpose:

- AI-generated summary cards per analysis run

Fields:

- `title`
- `value`
- `detail`

### `article_chat_threads`

Purpose:

- persistent per-user per-portfolio per-article chat thread

Important uniqueness:

- `(user_id, portfolio_id, news_item_id)`

### `article_chat_messages`

Purpose:

- ordered user/assistant messages for a thread

Roles:

- `user`
- `assistant`

Current article chat behavior:

- on successful AI generation, the assistant reply is inserted normally
- on AI provider failure, the user message may be stored but no assistant stub reply is inserted
- article chat now prefers `extracted_content`, then `full_content`, then `raw_content` when building prompt context

### `watchlist_items`

Purpose:

- per-user watchlist of tracked symbols

Key columns:

- `id` UUID
- `user_id` FK to `auth.users`, cascade delete
- `symbol`, `company`, `exchange`
- `price`, `day_change` (snapshot from last Finnhub fetch)
- `currency` (default `USD`)
- timestamps

Constraints:

- unique on `(user_id, symbol)` to prevent duplicates
- RLS ownership policy mirrors `portfolios`
- reuses `set_updated_at()` trigger

Migration: `009_watchlist_items.sql`

### `user_profiles`

Purpose:

- optional but now actively used identity/profile metadata for authenticated users

Key fields:

- `user_id`
- `first_name`
- `last_name`
- `display_name`
- `avatar_url`
- `handle`
- `accepted_terms_at`

Notes:

- `handle` remains the unique username field
- `display_name` is now written as `first_name + last_name`
- `first_name` and `last_name` were added in `012_user_profile_names.sql`
- `accepted_terms_at` is written by the first-login Terms acceptance flow

### `billing_customers`

Purpose:

- maps app users to Stripe customer IDs

Key columns:

- `user_id` UUID, PK, FK to `auth.users`
- `stripe_customer_id` TEXT, UNIQUE
- timestamps

Migration: `014_billing.sql`

### `subscriptions`

Purpose:

- tracks Stripe subscription state per user

Key columns:

- `id` UUID
- `user_id` FK to `auth.users`
- `stripe_subscription_id` TEXT, UNIQUE
- `stripe_customer_id`, `stripe_price_id`, `stripe_product_id`
- `plan_key` TEXT CHECK (`free`, `premium`, `ultimate`)
- `status` TEXT (mirrors Stripe: `trialing`, `active`, `past_due`, `canceled`, etc.)
- `current_period_start`, `current_period_end`
- `cancel_at_period_end`, `canceled_at`
- `trial_start`, `trial_end`
- `raw` JSONB (redacted audit snapshot)
- timestamps

Indexes: `user_id`, `stripe_customer_id`, `status`

Migration: `014_billing.sql`

Current constraint:

- `021_phase2_security_and_concurrency.sql` dedupes legacy rows and adds a unique index on `subscriptions(user_id)`, so `upsertSubscriptionRow` now upserts on `user_id`

### `billing_events`

Purpose:

- idempotency + audit log for processed Stripe webhook events

Key columns:

- `id` UUID
- `stripe_event_id` TEXT, UNIQUE
- `event_type` TEXT
- `payload` JSONB (redacted audit projection)
- `processed_at`
- `processing_state` (`processing`, `processed`, `failed`)
- `last_error`

RLS: no user-facing policies; internal audit table accessed only via service-role.

Migrations: `014_billing.sql`, `015_billing_events_rls.sql`, `016_billing_private_rls.sql`, `021_phase2_security_and_concurrency.sql`

### `ai_usage_counters` / `rate_limit_events`

Purpose:

- durable AI quota and burst/rate-limit backing store

Key behavior:

- RPCs in `020_durable_ai_usage_limits.sql` enforce AI usage and route/action throttles
- Phase 2 migration sets RPC search paths and adds `consume_ai_quota_for_user`
- quotas are shared across article chat and portfolio copilot

### `user_notification_preferences`

Purpose:

- per-user opt-in settings for morning digest delivery

Key fields:

- `user_id`
- `email_digest_enabled`
- `sms_digest_enabled`
- `phone_number`

Notes:

- phone numbers must be E.164 when present
- users can manage only their own row through RLS

### `notification_digests`

Purpose:

- stored, owner-readable daily digest snapshots

Key fields:

- `user_id`
- `digest_date`
- `time_zone`
- `window_start`, `window_end`
- `source_mode` (`portfolio` or `watchlist`)
- optional `portfolio_id`, `portfolio_name`
- `summary_line`, `bullish_symbols`, `bearish_symbols`
- `top_stories` JSONB array

Important uniqueness:

- `(user_id, digest_date)`

### `notification_deliveries`

Purpose:

- per-channel delivery state for each digest

Key fields:

- `digest_id`
- `channel` (`email` or `sms`)
- `status` (`pending`, `sent`, `skipped`, `failed`, `uncertain`)
- `provider_message_id`
- `error_text`
- `sent_at`

Important uniqueness:

- `(digest_id, channel)`

### `ticker_earnings_reports`

Purpose:

- latest earnings-report link lookup for tracked holdings/watchlist symbols

Key fields:

- `symbol`
- `preferred_url`
- `url_source` (`company` or `sec`)
- `company_url`
- `sec_url`
- `report_date`
- `filing_form`
- `title`
- `is_active`
- `last_checked_at`
- `error`

Notes:

- authenticated users can read active report metadata
- writes are service-role only through the earnings-report cron/service path

### Billing RLS Evolution

- `014_billing.sql` created user-facing SELECT policies on `billing_customers` and `subscriptions`
- `016_billing_private_rls.sql` **drops** those policies — billing data is now server-only; users receive a derived `BillingSummary` from the app, never raw Stripe identifiers

### Billing Payload Redaction

- `017_redact_billing_payloads.sql` is a one-time data migration that strips full Stripe objects from `subscriptions.raw` and `billing_events.payload`, keeping only minimal audit projections with `redacted: true`

## Marketing & Interaction Components

These components represent the "Visual Excellence" layer of the public-facing surfaces.

### `hero.tsx`

Located in `components/marketing/`. Uses GSAP for high-performance floating physics on decorative elements (Strategy, Signal, Risk nodes). Features an "Available on GitHub" banner and a glass-morphic primary CTA.

### `use-cases.tsx`

Located in `components/marketing/`. An interactive bento-grid section that uses motion-tracking on glass cards. Features:
- Interactive state-driven grid (Strategy, Guardrails, Macro, Alpha)
- GLSL-inspired animated noise backgrounds
- Responsive layout transition between high-density desktop grid and mobile stacks

### `how-it-works.tsx`

Located in `components/marketing/`. "How It Works" section with 3 workflow step cards sourced from `lib/mock-data.ts`. Uses `Panel` and `SectionHeading` base components.

### `site-header.tsx`

Located in `components/marketing/`. Sticky site header with "Pulsefolio" branding, nav links (Product, Use cases, How it works, FAQ), "View demo" ghost link to `/demo`, and primary CTA "Get started" to `/onboarding`.

### `demo-workspace.tsx`

Located in `components/marketing/`. Public interactive demo workspace used by `/demo`. It simulates real use cases across daily brief, article impact + story chat, AI advisor, and guardrails with longer answer examples.

### Global Performance Styles

Global animations and utility tokens are stored in `app/globals.css`, including:
- `floating` keyframes with varying offsets
- `glass-shimmer` hover effects
- Bento grid spacing and transition tokens

## App Components (Undocumented Detail)

These components support the portfolio, onboarding, and billing surfaces:

### Portfolio Components

- `components/app/active-portfolio-value-card.tsx` — client card displaying portfolio total value, day change %, and trending indicator; includes inline refresh button with state management
- `components/app/portfolio-value-card.tsx` — compact card showing total portfolio value, day change %, and sync timestamp with embedded refresh button and local state management
- `components/app/portfolio-snapshot-panel.tsx` — styled Panel displaying portfolio metrics (value, day change, 30-day move, coverage, last sync) with metric grid layout
- `components/app/portfolio-pricing-section.tsx` — orchestrator managing holdings display, performance chart, holdings table, manual add form, and CSV import; auto-refreshes on mount
- `components/app/portfolio-performance-chart.tsx` — Recharts AreaChart using stored hourly portfolio value snapshots when available, otherwise deriving a live fallback from holdings, current quotes, cost basis, and previous close; supports 1D, 1W, 1M, ALL time range buttons
- `components/app/inline-refresh-prices-button.tsx` — reusable client button triggering portfolio price sync; shows loading state and color-coded feedback (green=updated, amber=no_quotes, red=error)
- `components/app/add-position-form.tsx` — form for manually adding a single holding; validates symbol, quantity, average cost; calls `addPortfolioPosition` server action

### Onboarding Components

- `components/app/onboarding-page-client.tsx` — top-level onboarding orchestrator supporting CSV import or manual entry methods across method/intake/review steps
- `components/app/portfolio-csv-import-flow.tsx` — multi-step CSV import handling file upload, column mapping, holdings review, and save with configurable replace/merge modes

### Billing Components

- `components/app/billing-action-button.tsx` — button triggering Stripe checkout (purchase plan) or portal (manage subscription); handles auth redirects and error states with loading feedback
- `components/app/billing-settings-panel.tsx` — displays current plan, allowed model tiers, renewal/trial end date, and manage/upgrade CTAs sourced from `BillingSummary`
- `components/app/provider-card.tsx` — card rendering a provider with status badge (Preview/Demo), gradient background per provider ID, and optional onSelect callback

### Notification / Preferences Components

- `components/app/notification-settings-panel.tsx` - settings card for email/SMS morning digest opt-in and E.164 phone entry
- `components/app/preferences-panel.tsx` - settings card for light/dark theme selection
- `components/providers/preferences-provider.tsx` - root provider, hydration script, cookie/localStorage sync, and translator hook
- `components/preferences/theme-toggle.tsx` and `components/preferences/locale-select.tsx` - preference controls kept for app-wide preference UX

### App Shell / Navigation

- `components/app/app-shell-layout.tsx` — layout wrapper with collapsible sidebar; main nav (Home, Onboarding, Analysis, Feed) + Portfolio/Watchlist subnav as expandable "Overview" section; sidebar collapse state persisted to localStorage

## UI Primitives

Reusable base components in `components/ui/`:

- `panel.tsx` — base wrapper applying glass morphism styling (rounded border, semi-transparent bg, backdrop blur) with optional glow shadow effect
- `badge.tsx` — badge with tone prop (brand/success/warning/danger/neutral) for status/label display with corresponding border/background colors
- `section-heading.tsx` — marketing heading with eyebrow (uppercase label), title (h2), description, and left/center alignment option
- `button.tsx` — exports `buttonStyles()` function and `Button` component; supports variant (primary/secondary/ghost) and size (md/lg) with consistent focus/hover states

## Server Modules

### Feed Server (`lib/server/feed.ts`)

Provides:

- `FeedResponsePayload` type for API feed responses
- 24-hour max age cap enforcement
- pagination parsing
- mode-specific sort parsing (`match`, `recent`, `hot`, `oldest`)
- detail-open-count-aware hot sorting with recent fallback notice
- `resolveFeedPayload()` helper for building feed responses

### Page Loaders (`lib/server/page-loaders.ts`)

Provides:

- `PortfolioSummary`, `HoldingRow`, `AuthenticatedPageContext` types
- server-only loaders for authenticated page contexts
- shared data fetching for portfolio pages
- attaches latest earnings-report fields to portfolio holdings when active report rows exist

## News Service Modules (Additional)

### Direct Match (`lib/services/news/direct-match.ts`)

Provides:

- `resolveDirectStockMatch()` — compares article `stock_tags` / `ticker_impacts` against holding symbols
- returns matched symbols and reason codes for feed item classification

### Seed Provider (`lib/services/news/seed-provider.ts`)

Provides:

- demo `INewsProvider` implementation returning hardcoded seed stories
- used for testing/demo purposes with various market angles and tickers

### MarketAux Provider (`lib/services/news/marketaux-provider.ts`)

Provides:

- optional Node-side MarketAux news provider (not used by Python worker)
- fetches and parses MarketAux API with entity ticker extraction
- requires `MARKETAUX_API_KEY` (currently unused in active flow)

### News Types (`lib/services/news/types.ts`)

Provides:

- `RawNewsItem`, `INewsProvider`, `FetchNewsOptions` interfaces
- `NewsSourceType` and `NewsProviderId` enums
- shared type contracts for all news provider implementations

## Central Types (`lib/types.ts`)

Key types and enums exported:

- `Sentiment`, `ImpactLevel`, `NewsCategory` — shared domain enums
- `TickerImpact`, `MatchReasonCode`, `MatchSource`, `FeedSort` — feed/analysis types
- `LatestEarningsReportFields`, `LatestEarningsReportSource` - report-link fields attached to holdings/watchlist detail data
- `Provider` — AI provider display type with id, name, model, status, and tier badge
- `FAQItem` — marketing FAQ entry type
- `Holding`, `HoldingDraft` — portfolio position types
- `PortfolioPricingRefreshResult`, `PortfolioPricingRefreshStatus` — types for the price sync flow (status values: `updated`, `skipped`, `no_quotes`, `error`)
- `ArticleChatModelTier` — `"free" | "premium" | "ultimate"` for billing-driven AI model selection

## RLS Model

High-level:

- portfolio-owned data is user-scoped via `portfolios.user_id`
- `watchlist_items` are user-scoped via `watchlist_items.user_id`
- `news_items` are readable by authenticated users; authenticated direct writes were removed
- article chat is user-scoped
- notification preferences/digests are user-scoped
- `ticker_earnings_reports` is authenticated-readable and service-written

Important implication:

- service-role key is required for ingestion/upserts that bypass normal user ownership constraints
- billing tables have RLS enabled but user-facing SELECT policies are dropped; all billing reads go through service-role

## Security Modules

### Rate Limiting

File:

- `lib/security/rate-limit.ts`

Provides:

- durable Supabase-backed route/action rate limiting through `consume_rate_limit`
- `check(key)` returns `Promise<{ allowed, retryAfterMs?, remaining, resetsAt }>`
- default limiters for shared AI burst, analysis run, community post, and community comment surfaces

Current repo state:

- `lib/security/rate-limit.ts` is now a server-only durable limiter backed by the Supabase RPC `consume_rate_limit`
- `check(key)` now returns a `Promise<{ allowed, retryAfterMs?, remaining, resetsAt }>`
- default limiters: shared AI burst `10/60s`, analysis run `5/60s`, community post `10/60s`, community comment `20/60s`
- limiter state survives across Vercel instances/process restarts once `supabase/migrations/020_durable_ai_usage_limits.sql` has been applied

### AI Usage And Entitlements

Files:

- `lib/security/ai-access.ts`
- `lib/billing/ai-usage.ts`
- `supabase/migrations/020_durable_ai_usage_limits.sql`

Provides:

- `assertUserCanUseAI(user, tier, surface)` - server-only gate that checks billing tier access, durable burst rate limits, and durable quota consumption in that order
- shared AI quota policy across article chat and portfolio copilot: Free `100/day`, Premium `5,000/month`, Ultimate `20,000/month`
- Toronto-based quota reset boundaries via `AI_USAGE_TIME_ZONE = "America/Toronto"`
- structured denial metadata for `plan_upgrade_required`, `rate_limited`, and `quota_exceeded` responses

### Redirect Validation

File:

- `lib/security/redirect.ts`

Provides:

- `isValidInternalRedirect(path)` — blocks `://`, `//`, and paths not in the allowed prefix list
- `sanitizeRedirect(raw, fallback)` — returns safe redirect target, falls back when validation fails
- allowed prefixes: `/portfolio`, `/analysis`, `/feed`, `/home`, `/watchlist`, `/settings`, `/complete-profile`, `/onboarding`, `/pricing`, `/demo`, `/digest`
- used by middleware and auth callback to prevent open-redirect attacks

### Timing-Safe Comparison

File:

- `lib/security/timing.ts`

Provides:

- `isTimingSafeEqual(a, b)` — constant-time string comparison using Node's `crypto.timingSafeEqual`
- used by all `CRON_SECRET` checks to prevent timing attacks

## Bot Protection (Cloudflare Turnstile)

Files:

- `lib/security/turnstile.ts` - server-side Siteverify verification helper
- `components/security/turnstile-widget.tsx` - reusable client widget + `useTurnstile` hook
- `lib/security/chat-turnstile-grant.ts` - signed, HttpOnly, 15-minute chat grant cookies

Protected surfaces:

- `POST /api/article-chat` — AI chat generation (expensive, spammable)
- `POST /api/portfolio-copilot` — AI portfolio Q&A (expensive, spammable)
- `createPost()` server action — community post creation
- `createComment()` server action — community comment creation

Unprotected by design:

- `POST /api/news/cron` — machine-to-machine, secured by `CRON_SECRET`
- `POST /api/news/refresh`, `POST /api/news/ingest` — deprecated admin routes
- `POST /api/analysis/run` — authenticated, low abuse risk
- All GET/read-only routes
- Portfolio import/save, profile completion — authenticated one-off workflows

How it works:

- client renders `<TurnstileWidget>` which loads Cloudflare's challenge script
- on challenge completion, client receives a single-use token
- client includes `turnstileToken` in the POST body (API routes) or as an argument (server actions)
- server calls `verifyTurnstileToken()` before executing any side-effects
- chat routes first check for a valid 15-minute portfolio-wide grant cookie; if one exists, the route skips a fresh challenge for that portfolio in that browser
- successful chat verification mints a grant cookie scoped by user + portfolio; story/general/copilot surfaces still validate auth, ownership, quota, and story IDs per request
- on failure: returns 403 (routes) or `{ ok: false, error }` (actions) without executing the action
- tokens expire quickly and are single-use; the widget is reset after each submission
- grant cookies are signed with `TURNSTILE_SECRET_KEY`, HttpOnly, SameSite=Lax, Secure in production, and `Max-Age=900`

Environment:

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — client widget
- `TURNSTILE_SECRET_KEY` — server Siteverify
- if secret is missing, verification fails closed (action blocked)
- for local dev use Cloudflare always-pass test keys (see `.env.example`)

Tests:

- `tests/turnstile-verify.test.ts` — 17 tests for the verification helper
- `tests/turnstile-protected-routes.test.ts` — 8 tests proving protected routes/actions reject without valid token

## Billing System (Stripe)

Main files:

- `lib/billing/plans.ts`
- `lib/billing/store.ts`
- `lib/billing/stripe.ts`
- `lib/billing/subscriptions.ts`
- `lib/billing/sync.ts`

### Plans (`lib/billing/plans.ts`)

Provides:

- `PlanKey` type: `"free" | "premium" | "ultimate"`
- `PLAN_KEYS`, `PAID_PLAN_KEYS` constants
- `MODEL_TIERS_BY_PLAN` — maps each plan to its allowed `ArticleChatModelTier` array
- `parsePlanKey(value)`, `parseModelTier(value)` — safe parsers
- `providerIdForTier(tier)` - free -> `"openrouter"`, premium -> `"mistral"`, ultimate -> `"azure"`
- `allowedModelTiersForPlan(planKey)`, `isTierAllowedForPlan(planKey, tier)`
- `defaultModelTierForPlan(planKey)` — returns highest tier the plan allows
- `requiredPlanForTier(tier)` — inverse lookup

### Store (`lib/billing/store.ts`)

Provides:

- Supabase CRUD layer for `billing_customers`, `subscriptions`, `billing_events`
- `loadBillingCustomerByUserId`, `loadBillingCustomerByStripeCustomerId`, `upsertBillingCustomer`
- `loadSubscriptionsForUser`, `upsertSubscriptionRow`
- `claimStripeEvent`, `markStripeEventProcessed`, `markStripeEventFailed` - idempotency and stale/failed webhook recovery helpers

### Stripe SDK (`lib/billing/stripe.ts`)

Provides:

- `getStripe()` — singleton Stripe client (API version `2026-03-25.dahlia`)
- `requireStripeWebhookSecret()`, `getStripePriceIdForPlan(planKey)`
- `planFromStripePriceId(priceId)` — reverse lookup from Stripe price ID to plan key
- `getAppBaseUrl(request?)` — resolves app origin for Stripe redirect URLs

### Subscriptions (`lib/billing/subscriptions.ts`)

Provides:

- `BillingSummary` type — safe client-facing projection (no Stripe identifiers)
- `BillingState` type — `BillingSummary` + internal Stripe IDs for server use
- `BillingAccessError` class — thrown when a user tries to access a gated model tier (code `plan_upgrade_required`)
- `buildBillingState(input)` — derives entitlement from subscription rows
- `getBillingStateForUser(userId)`, `getBillingSummaryForUser(userId)`, `getCurrentUserBillingSummary()`
- `assertUserCanUseModelTier(userId, tier)` — throws `BillingAccessError` if tier is not allowed
- `deriveStripeCustomerName(user)` — extracts display name from Supabase auth metadata
- entitlement logic: `trialing` and `active` are entitled; `past_due` is entitled only while `current_period_end` is in the future
- billing summaries include `hasAdminModelAccess`, allowed/default model tiers, and AI quota usage/limit/window/reset fields

### Sync (`lib/billing/sync.ts`)

Provides:

- `getOrCreateStripeCustomerForUser(user)` — creates Stripe customer if none exists, stores mapping
- `syncStripeCustomerRecord(userId, stripeCustomerId)` — upserts `billing_customers`
- `syncSubscriptionFromStripeSubscription(subscription)` — resolves user, normalizes Stripe subscription, upserts `subscriptions` row
- `syncSubscriptionById(subscriptionId)` — retrieves subscription from Stripe API and syncs
- builds minimal `buildSubscriptionSnapshot` for the `raw` JSONB column (not the full Stripe object)

## Python Worker

Location:

- `workers/news_ingestion/`

Main files:

- `workers/news_ingestion/main.py`
- `workers/news_ingestion/cron_runner.py`
- `workers/news_ingestion/cron_runner_v2.py`
- `workers/news_ingestion/bootstrap.py`
- `workers/news_ingestion/schema.py`
- `workers/news_ingestion/upsert.py`
- `workers/news_ingestion/fetchers/edgar_fetcher.py`
- `workers/news_ingestion/fetchers/newsapi_fetcher.py`
- `workers/news_ingestion/fetchers/newsapi_ai_fetcher.py`
- `workers/news_ingestion/fetchers/gnews_fetcher.py`
- `workers/news_ingestion/fetchers/newscatcher_fetcher.py`
- `workers/news_ingestion/fetchers/result.py`
- `workers/news_ingestion/extract_full_text.py`

What it does:

- fetches EDGAR filings for a ticker universe
- fetches NewsAPI market/business headlines
- fetches GNews top and targeted queries
- candidate path can also fetch NewsAPI.ai / Event Registry articles and NewsCatcher v3 articles
- normalizes results into shared schema
- upserts into Supabase

Current worker shape:

- `main.py` supports `providerSet=current|candidate`
- current path = EDGAR + NewsAPI + GNews (+ Finnhub targeted refresh in the TypeScript route layer)
- candidate path = EDGAR + NewsAPI.ai + GNews + NewsCatcher (best-effort for cron/preflight; NewsCatcher degradation warns but does not block candidate cron on its own)
- `cron_runner.py` builds the current GitHub Actions payload
- `cron_runner_v2.py` builds the manual candidate GitHub Actions payload
- `extract_full_text.py` performs background full-text extraction for newly inserted articles

Troubleshooting doc:

- `workers/news_ingestion/TROUBLESHOOTING.md`

Preflight:

```bash
python -m workers.news_ingestion.main --check
```

Common requirements:

- `python` or `python3` on PATH
- `pip install -r requirements.txt`
- `EDGAR_IDENTITY`
- `NEWSAPI_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- writable `EDGAR_LOCAL_DATA_DIR` or default `.edgar_data`

## Environment Variables

### Required for app auth/data

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Ingestion

- `EDGAR_IDENTITY`
- `NEWSAPI_KEY`
- `FINNHUB_API_KEY` (required for watchlist search/quotes, also used by news refresh)
- `TWELVE_DATA_API_KEY` (watchlist detail dashboard)
- `CRON_SECRET`
- `CRON_ENDPOINT` (GitHub Actions secret, full deployed `/api/news/cron` URL)
- `EDGAR_LOCAL_DATA_DIR`

### Candidate Ingestion (Phase 1)

- `NEWSAPI_AI_API_KEY` (EventRegistry / NewsAPI.ai)
- `NEWSCATCHER_API_KEY` (NewsCatcher v3; best-effort warning-only for candidate cron probes/preflight)
- `NEWS_V2_CRON_SECRET` (bearer token for `/api/news/cron/v2`)
- `NEWS_V2_CRON_ENDPOINT` (deployed URL for candidate cron finalize)

Important:

- `NEWS_V2_CRON_SECRET` must match between GitHub Actions and the deployed app runtime that serves `/api/news/cron/v2`
- `CRON_SECRET` is still required for the shared enrich and analysis endpoints used by `.github/workflows/news-cron-v2.yml`
- `NEWSCATCHER_API_KEY` is optional for candidate workflow probes and `--check`; missing or invalid NewsCatcher config now warns but does not block the `v2` cron run

### Admin allowlist

- `ADMIN_USER_IDS`
- `ADMIN_USER_EMAILS`

### AI

- `AI_PROVIDER`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `OPENROUTER_HTTP_REFERER`
- `OPENROUTER_APP_NAME`
- `NEXT_PUBLIC_SITE_URL`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_BASE_URL`
- `AZURE_OPENAI_MODEL`
- `AZURE_OPENAI_REASONING_EFFORT`
- `MISTRAL_API_KEY`
- `MISTRAL_MODEL` (optional, defaults to `mistral-large-latest`)

### Stripe / Billing

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PREMIUM_PRICE_ID`
- `STRIPE_ULTIMATE_PRICE_ID`
- `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID` (optional)

### Daily Digest Notifications

- `DIGEST_CRON_SECRET` (deployed app runtime and GitHub Actions secret)
- `DIGEST_CRON_ENDPOINT` (GitHub Actions secret, full deployed `/api/notifications/daily-digest/cron` URL)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (optional; defaults to `Pulsefolio <onboarding@resend.dev>`)
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `APP_BASE_URL` (preferred canonical origin for email/SMS links; production should be `https://pulsefolio.app`)
- `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_SITE_URL` (lower-priority fallbacks for canonical links)

### Portfolio Value Snapshots

- `CRON_ENDPOINT` (GitHub Actions secret, must end with `/api/news/cron`; snapshot workflow derives the base URL from it)
- `CRON_SECRET` (shared bearer token for the deployed route when `PORTFOLIO_SNAPSHOT_CRON_SECRET` is absent)
- `PORTFOLIO_SNAPSHOT_CRON_SECRET` (optional separate deployed app runtime secret for `/api/portfolio/value-snapshots/cron`)

### Earnings Reports

- `EARNINGS_REPORTS_CRON_ENDPOINT` (GitHub Actions secret, full deployed `/api/earnings-reports/cron` URL)
- `CRON_SECRET` (shared bearer token for the deployed route)
- `EDGAR_IDENTITY` (SEC requests)

### Legacy / currently unused in app flow

- `NEWS_PROVIDER`
- `MARKETAUX_API_KEY`

### Bot protection (Cloudflare Turnstile)

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — widget site key, client-side only
- `TURNSTILE_SECRET_KEY` — Siteverify secret, server-side only

For local dev / testing use Cloudflare's always-pass test keys:

- site key: `1x00000000000000000000AA`
- secret: `1x0000000000000000000000000000000AA`

Reference:

- `.env.example` documents core local envs and AI/provider setup
- `README.md` and `PRE_LAUNCH_CHECKLIST.md` document the additional GitHub Actions scheduler secrets for news, daily digest, portfolio value snapshots, and earnings-report jobs

Security note:

- do not echo `.env` secrets back into chat or new docs

## Tests

Test directory:

- `tests/`

Current top-level test files:

- `active-portfolio-value-card.test.tsx`
- `admin-access.test.ts`
- `ai-access.test.ts`
- `ai-chat-errors.test.ts`
- `ai-prompts.test.ts`
- `analysis-constants.test.ts`
- `analysis-cron-route.test.ts`
- `analysis-run-heartbeat-migration.test.ts`
- `analysis-run-trigger.test.tsx`
- `analysis-service.test.ts`
- `app-shell-layout.test.tsx`
- `article-chat-grant.test.ts`
- `article-chat-panel.test.tsx`
- `article-chat-panel-grant.test.tsx`
- `article-chat-route.test.ts`
- `article-chat-token-budget.test.ts`
- `article-cta.test.tsx`
- `auth-callback-route.test.ts`
- `billing-store.test.ts`
- `billing-stripe-base-url.test.ts`
- `billing-subscriptions.test.ts`
- `cache.test.ts`
- `candidate-source-registration.test.ts`
- `chat-turnstile-grant.test.ts`
- `community-actions.test.ts`
- `community-post-card.test.tsx`
- `community-types.test.ts`
- `complete-profile-page.test.ts`
- `cron-route.test.ts`
- `cron-v2-route.test.ts`
- `daily-digest-builder.test.ts`
- `daily-digest-cron-route.test.ts`
- `daily-digest-migration.test.ts`
- `delivery-adapters.test.ts`
- `digest-page.test.tsx`
- `durable-ai-usage-migration.test.ts`
- `earnings-report-migration.test.ts`
- `earnings-reports-cron-route.test.ts`
- `earnings-reports-service.test.ts`
- `enrich-cron-route.test.ts`
- `env-validation.test.ts`
- `external-url.test.ts`
- `extraction-uuid-validation.test.ts`
- `feed-open-route.test.ts`
- `feed-page-counts.test.ts`
- `feed-query.test.ts`
- `feed-route.test.ts`
- `feed-view.test.tsx`
- `finnhub-errors.test.ts`
- `finnhub-refresh.test.ts`
- `gnews-targeting.test.ts`
- `handle-hardening.test.ts`
- `ingest-detail.test.ts`
- `ingest-route.test.ts`
- `logger.test.ts`
- `login-language-hidden.test.tsx`
- `middleware.test.ts`
- `mistral-provider.test.ts`
- `news-health-route.test.ts`
- `notification-preferences.test.ts`
- `notification-settings-panel.test.tsx`
- `onboarding-page.test.tsx`
- `phase2-migration.test.ts`
- `portfolio-copilot-grant.test.ts`
- `portfolio-copilot-panel-grant.test.tsx`
- `portfolio-copilot-route.test.ts`
- `portfolio-copilot-token-budget.test.ts`
- `portfolio-csv-import-flow.test.tsx`
- `portfolio-holdings-table.test.tsx`
- `portfolio-match-parser.test.ts`
- `portfolio-performance-chart.test.tsx`
- `portfolio-price-sync.test.ts`
- `portfolio-pricing-section.test.tsx`
- `portfolio-queries.test.ts`
- `portfolio-refresh-loaders.test.ts`
- `portfolio-snapshot-panel.test.tsx`
- `portfolio-sync-prices-route.test.ts`
- `portfolio-value-card.test.tsx`
- `portfolio-value-snapshots-cron-route.test.ts`
- `preferences-panel.test.tsx`
- `preferences-provider.test.tsx`
- `profile-form-legal-links.test.tsx`
- `profile-utils.test.ts`
- `publisher-extract.test.ts`
- `publisher-url.test.ts`
- `rate-limit.test.ts`
- `redirect-validation.test.ts`
- `refresh-route.test.ts`
- `refresh-v2-route.test.ts`
- `root-layout.test.tsx`
- `site-header-language-hidden.test.tsx`
- `source-config-candidate.test.ts`
- `stale-recovery-migration.test.ts`
- `streamed-price-refresh-pages.test.tsx`
- `stripe-webhook-route.test.ts`
- `timing-safe.test.ts`
- `turnstile-protected-routes.test.ts`
- `turnstile-verify.test.ts`
- `turnstile-widget.test.ts`
- `twelvedata-detail.test.ts`
- `user-menu.test.tsx`
- `watchlist-detail-dashboard.test.tsx`
- `watchlist-items.test.tsx`
- `watchlist-page.test.tsx`

Support files:

- `tests/setup.ts`
- `tests/helpers/mock-service-supabase.ts`
- `tests/stubs/server-only.ts`

Coverage themes:

- prompt shape
- analysis constants and gating behavior
- analysis trigger UI state (status-only, no refresh button)
- feed route: personal mode with matchSources/matchReasonCodes, market mode with isWatchlistMatch, watchlist-only fallback
- feed route/page counts, pagination, hot sort, detail-open tracking, and `/api/feed/open`
- cron route: full pipeline with Finnhub, analysis-for-all, cooldown skipping
- candidate cron route: separate secret, candidate source payload validation, same-table writes
- refresh route orchestration (deprecated but tested)
- refresh-v2 route orchestration for the candidate provider set
- Finnhub targeted ingest
- Finnhub provider error classification (missing key, 401/403, 429, timeout, bad payload, no match, valid search)
- GNews query building
- provider-agnostic candidate query building
- article CTA behavior
- parser behavior
- server-side cache (TTL expiry, fetch-through, hit/miss)
- structured logger (info/warn/error, scoped, data serialization)
- env validation (require/missing, hasKey)
- profile validation/completeness helpers, callback redirect gating, and avatar dropdown behavior
- Turnstile server-side verification (success, failure, timeout/duplicate, network error, missing token/secret, action/hostname mismatch, idempotency key, client IP extraction)
- Turnstile route/action protection gating (article-chat, portfolio-copilot, community post/comment reject without valid token)
- chat Turnstile grant cookies and client panel grant behavior for article chat and portfolio copilot
- article chat token budget assertion (2000 tokens across all four providers)
- portfolio copilot token budget assertion
- billing entitlement logic (buildBillingState, trialing/active/past_due, tier gating, admin override via `hasAdminModelAccess`)
- billing store/webhook idempotency, stale processing recovery, canonical base URL resolution, and one-subscription-per-user migration
- Mistral provider creation, config validation, chat/enrichment methods
- analysis cron route (GET eligibility, POST single-portfolio run, cooldown, CRON_SECRET)
- enrichment cron route (batch enrichment, max batch size, CRON_SECRET)
- admin news health / refresh route gating
- middleware redirect behavior with sanitizeRedirect
- app shell layout collapse/expand, localStorage persistence, navigation structure
- community actions (createPost, createComment, getHomeFeed, ticker extraction)
- community types (extractTickers, body validation)
- extraction UUID validation
- handle hardening (format, uniqueness)
- onboarding page (method selection, CSV/manual flows)
- portfolio copilot route (auth, AI call, error handling)
- portfolio CSV import flow (upload, mapping, review, save modes)
- portfolio pricing section (orchestration, auto-refresh)
- portfolio performance chart and pricing section use historical snapshots when available with live fallback behavior
- portfolio snapshot panel (metric display)
- portfolio sync prices route (auth, freshness, overview merge)
- portfolio value card (display, refresh state)
- active portfolio value card (value, change, trending)
- rate limit (sliding window, cleanup, edge cases)
- redirect validation (safe/unsafe paths, sanitization)
- portfolio price sync (stale-skip, refresh, auth, dedup)
- portfolio refresh loaders (dedupe, cached in-flight promise)
- portfolio value snapshot cron route and migration
- analysis run heartbeat and stale-run migrations
- daily digest builder, digest cron route, digest page, notification preferences/settings panel, delivery adapters, and digest migration
- earnings report service, cron route, migration, portfolio holdings report links, and watchlist detail report links
- root preferences provider/panel and theme persistence

Known testing limitation:

- there is no integrated full-stack test proving:
  - Supabase migrations applied
  - Python worker execution
  - live AI provider
  - real UI workflow

## Current Documentation State

Current docs in repo:

- `README.md`
  - recently updated away from generic create-next-app boilerplate
  - now documents local run, AI provider setup, news scheduler, daily digest scheduler, and related production setup
- `analysis.txt`
  - longer repo analysis
- `CLAUDE.md`
  - this handoff
- `PRE_LAUNCH_CHECKLIST.md`
  - deployment checklist covering env vars, migrations through `025`, API quotas, scheduler secrets, smoke tests, rollback
- `.github/workflows/news-cron.yml`
  - schedules GitHub Actions every 20 minutes, runs `python -m workers.news_ingestion.cron_runner`, and `POST`s the payload to the deployed `/api/news/cron` route
- `.github/workflows/news-cron-v2.yml`
  - manual `workflow_dispatch` candidate workflow that runs `python -m workers.news_ingestion.cron_runner_v2`, posts to `/api/news/cron/v2`, then reuses the shared enrich and analysis endpoints
- `.github/workflows/daily-digest.yml`
  - scheduled/manual workflow that posts to `/api/notifications/daily-digest/cron`; the route gates to the actual 9 AM Eastern hour
- `.github/workflows/portfolio-value-snapshots.yml`
  - hourly workflow that posts to `/api/portfolio/value-snapshots/cron` to store portfolio value history
- `.github/workflows/earnings-report-sync.yml`
  - scheduled/manual workflow that posts to `/api/earnings-reports/cron` to refresh tracked symbol report links
- `supabase/README.md`
  - migration application basics
- `workers/news_ingestion/TROUBLESHOOTING.md`
  - worker ops help

## Production Readiness Status

Completed workstreams:

1. Portfolio performance chart now uses stored hourly value snapshots when available and a live holdings-derived fallback instead of simulated data
2. Render performance: `/portfolio/full` no longer blocks on live quote sync; overview uses stored DB values
3. Provider hardening: Finnhub throws typed `FinnhubError`; watchlist actions map each code to user-facing messages with retry hints; Twelve Data degrades gracefully on partial endpoint failure
4. Caching: Twelve Data — quote (1 min), time_series (5 min), profile/statistics (30 min), earnings/financials (60 min) — cached server-side via `lib/services/cache.ts`
5. Env validation: `lib/env.ts` provides lazy `require*` functions; `checkOptionalProviders` warns on startup
6. Observability: `lib/logger.ts` structured logging in Finnhub, Twelve Data, and watchlist actions
7. Tests: `finnhub-errors.test.ts`, `cache.test.ts`, `logger.test.ts`, `env-validation.test.ts`, `twelvedata-detail.test.ts` — covering provider error classification, cache TTL, structured logging, env validation, and Twelve Data aggregator partial/full/failure scenarios
8. UX polish: watchlist dashboard catches unhandled promise rejections; `PRE_LAUNCH_CHECKLIST.md` covers env, migrations, API quotas, smoke tests, rollback
9. Bot verification: article chat/general Ask AI/portfolio copilot now use Turnstile with 15-minute portfolio-wide grant cookies
10. Scheduler expansion: GitHub Actions now cover production news, candidate news, daily digest, portfolio value snapshots, and earnings-report sync jobs
11. Billing/analysis hardening: Stripe webhook reclaim, unique active analysis runs, degraded analysis status, and heartbeat-based stale-run recovery are implemented in migrations/services

## Known Caveats And Rough Edges

- monthly change is hardcoded to 0 in portfolio overview
- some portfolio/strategy surfaces contain heuristic presentation logic
- marketing pages are more polished than some backend guarantees
- article chat depends on migration `006_article_chat.sql` being present in the live DB
- daily digest depends on migration `024_daily_digest_notifications.sql`, `DIGEST_CRON_SECRET`, `APP_BASE_URL`, Resend, and Twilio configuration
- portfolio value snapshots depend on migration `025_portfolio_value_snapshots.sql`, `CRON_SECRET` or `PORTFOLIO_SNAPSHOT_CRON_SECRET`, GitHub `CRON_ENDPOINT`, and quote-provider availability
- earnings report links depend on migration `024_ticker_earnings_reports.sql`, `CRON_SECRET`, GitHub `EARNINGS_REPORTS_CRON_ENDPOINT`, and SEC/company-site availability
- durable quotas/concurrency depend on migrations `020` through `023` being applied in each environment
- the public OpenAI provider is still hardcoded to `gpt-4o-mini`
- article chat output budget is now 2000 tokens, so longer answers are possible but provider-side truncation is still possible on very long prompts
- latest local quality gate is green: `npm run typecheck`, `npm run lint` (warnings only), `npm run test` (`104` files / `595` tests), and `npm run build`
- personal feed emptiness is valid and expected if nothing scores above threshold
- personal feed can now include watchlist-only matches (relevance 75, no AI assessment)
- newly added watchlist symbols affect the feed on the next cron cycle, not immediately
- newly added holdings/watchlist symbols affect latest earnings-report links after the next earnings-report sync job
- the `/api/news/refresh` and `/api/news/ingest` routes are deprecated but still functional for admin use
- the "Refresh news & analysis" button has been removed from the analysis page UI
- generated Python `__pycache__` files are present and should usually be ignored

## Community Social Home (`/home`)

The `/home` route is a Blossom-inspired social market hub, not a portfolio dashboard. It provides a global community feed where authenticated users can post short-form market commentary with optional `$TICKER` tags, view and participate in comment threads, and discover trending tickers and active discussions.

### Schema

Migration: `supabase/migrations/011_community.sql`

Tables:

- `user_profiles` — optional display name, avatar, handle; keyed on `auth.users.id`
- `community_posts` — `id`, `user_id`, `body` (1–2000 chars), timestamps
- `community_post_tickers` — `(post_id, ticker)` composite PK; ticker stored uppercase without `$`
- `community_comments` — `id`, `post_id`, `user_id`, `body` (1–1000 chars), timestamps

All tables have RLS:
- authenticated users can read everything
- users can only insert/update/delete their own rows
- ticker insert/delete policies check post ownership via subquery

Auto-update triggers set `updated_at` on row changes.

### Types

`lib/community/types.ts` defines:

- `CommunityPost`, `CommunityComment`, `CommunityAuthor`, `CommunityTickerTag`
- `TrendingTicker`, `ActiveDiscussion`
- `CreatePostResult`, `CreateCommentResult`
- `extractTickers(body)` — pulls `$TICKER` patterns, dedupes, caps at 5
- `validatePostBody(body)` / `validateCommentBody(body)` — length validation

### Server Actions

`lib/actions/community.ts` — all actions require auth via `supabase.auth.getUser()`:

- `getHomeFeed(cursor?)` — newest-first paginated feed (20 per page), joins tickers + comment count + author profile
- `createPost(body)` — validates, inserts post + ticker rows, returns optimistic `CommunityPost`
- `getPostComments(postId)` — ordered ascending, joins author profiles
- `createComment(postId, body)` — validates, inserts, returns optimistic `CommunityComment`
- `getTrendingTickers()` — aggregates ticker mentions from posts in the last 24h, top 10
- `getActiveDiscussions()` — top 5 posts with most comments (from latest 50)

Author identity falls back: `user_profiles.display_name` → `user_metadata.full_name` → `user_metadata.name` → email prefix → "User"

### UI Components

Page: `app/home/page.tsx` — server component wrapping `AppShell` + `HomeFeedClient`

Client components:
- `components/app/home-feed.tsx` — main 3-column layout orchestrator:
  - left rail: quick links (watchlist, news feed) + trending tickers
  - center: section heading, post composer, paginated feed, inline comments view
  - right rail: active discussions
  - refresh button re-fetches feed + sidebar data
  - "Load more" cursor-based pagination
  - clicking a post's comment button swaps center to comments panel
- `components/app/post-composer.tsx` — textarea with live `$TICKER` extraction, char counter, optimistic submit
- `components/app/community-post-card.tsx` — displays author avatar/initials, time-ago, body with clickable ticker links, ticker pills, comment count button
- `components/app/post-comments-panel.tsx` — loads comments per post, inline composer with Enter-to-submit
- `components/app/trending-tickers-card.tsx` — ranked ticker mentions linking to `/watchlist?symbol=`
- `components/app/active-discussions-card.tsx` — top commented posts with preview text

### Navigation

`/home` is added to `mainNav` in `components/app/app-shell-layout.tsx` as the first item, using the `Home` icon from `lucide-react`.

### Design Decisions

- No likes, follows, reposts, or DMs in v1
- Author identity starts from Supabase auth metadata; `user_profiles` is opt-in for custom display names
- Ticker tags link to `/watchlist?symbol=X` for cross-surface discovery
- Feed is global (no follow graph filtering) in v1
- No separate API routes — all data flows through server actions
- Mobile: left and right rails are hidden; center feed is full-width

## Daily Digest Notifications

The daily digest feature stores and delivers a top-10 overnight portfolio/watchlist snapshot at 9 AM Eastern.

Schema:

- `supabase/migrations/024_daily_digest_notifications.sql`
- `user_notification_preferences`
- `notification_digests`
- `notification_deliveries`

Core files:

- `lib/notifications/daily-digest.ts`
- `lib/notifications/delivery.ts`
- `lib/notifications/preferences.ts`
- `lib/notifications/timezone.ts`
- `emails/daily-digest-email.tsx`
- `app/api/notifications/daily-digest/cron/route.ts`
- `app/digest/[digestId]/page.tsx`
- `components/app/notification-settings-panel.tsx`
- `.github/workflows/daily-digest.yml`

Behavior:

- digest source is the latest completed/degraded portfolio analysis when a user has portfolios
- watchlist-only users get direct watchlist matches from `news_items`
- one digest per user/date is enforced by a unique constraint
- delivery rows are keyed by digest/channel
- email uses Resend and includes the full digest
- email story titles and SMS lead-story links open `/feed?story=<newsItemId>` so the feed selects that article
- the email "View in Pulsefolio" CTA and SMS fallback link open `/feed`
- SMS uses Twilio and sends a short leader summary plus feed link
- stale pending SMS deliveries become `uncertain` instead of being resent automatically

## Portfolio Value Snapshots

The portfolio value snapshot feature records each user's current portfolio value once per UTC hour for a more useful `/portfolio/full` chart.

Schema:

- `supabase/migrations/025_portfolio_value_snapshots.sql`
- `portfolio_value_snapshots`

Core files:

- `lib/services/portfolio-value-snapshots.ts`
- `app/api/portfolio/value-snapshots/cron/route.ts`
- `.github/workflows/portfolio-value-snapshots.yml`
- `lib/server/page-loaders.ts`
- `components/app/portfolio-performance-chart.tsx`
- `components/app/portfolio-pricing-section.tsx`

Behavior:

- one row per `(portfolio_id, bucket_start)` is upserted per UTC hour
- the service uses service-role access, refreshes Yahoo quotes, updates current holding quote fields, and writes aggregate value/day-change metadata
- the GitHub workflow runs hourly at minute 5 and derives the snapshot endpoint from `CRON_ENDPOINT`
- `/portfolio/full` loads recent snapshots and the chart uses them when at least two valid points exist
- if no snapshot history exists yet, the chart falls back to live holdings/current-quote/cost-basis-derived points

## Latest Earnings Reports

The earnings-report feature resolves a latest report link for tracked symbols and surfaces it in portfolio/watchlist UI.

Schema:

- `supabase/migrations/024_ticker_earnings_reports.sql`
- `ticker_earnings_reports`

Core files:

- `lib/services/earnings-reports.ts`
- `app/api/earnings-reports/cron/route.ts`
- `.github/workflows/earnings-report-sync.yml`
- `lib/server/page-loaders.ts`
- `components/app/portfolio-holdings-table.tsx`
- `components/app/watchlist-detail-dashboard.tsx`

Behavior:

- tracked universe = unique symbols from `holdings` + `watchlist_items`
- company-site discovery scans investor/news/media pages for earnings/result/release links
- SEC fallback uses company tickers and submissions APIs, preferring recent eligible 10-K/10-Q/20-F/8-K/6-K filings with earnings markers
- preferred company links win over SEC links
- rows for no-longer-tracked symbols are marked inactive
- public URLs are validated with existing publisher URL safety checks before fetch/render

## Recommended Read Order By Task

### If changing onboarding/import

Read:

1. `CLAUDE.md`
2. `app/onboarding/page.tsx`
3. `lib/actions/portfolio.ts`
4. `lib/services/csv-parser.ts`
5. `lib/services/yahoo-finance.ts`

### If changing feed/article UI

Read:

1. `CLAUDE.md`
2. `app/feed/page.tsx`
3. `components/app/feed-view.tsx`
4. `components/app/news-feed-card.tsx`
5. `app/api/feed/route.ts`
6. `app/api/article-chat/route.ts`

### If changing analysis logic

Read:

1. `CLAUDE.md`
2. `lib/services/analysis.ts`
3. `lib/services/ai/*`
4. `tests/analysis-service.test.ts`
5. `tests/analysis-constants.test.ts`

### If changing ingestion

Read:

1. `CLAUDE.md`
2. `app/api/news/refresh/route.ts`
3. `app/api/news/ingest/route.ts`
4. `app/api/news/cron/route.ts`
5. `lib/services/news/*`
6. `workers/news_ingestion/*`
7. `workers/news_ingestion/TROUBLESHOOTING.md`

### If changing watchlist

Read:

1. `CLAUDE.md`
2. `app/watchlist/page.tsx`
3. `components/app/watchlist-page-client.tsx`
4. `components/app/watchlist-items.tsx`
5. `components/app/watchlist-search-panel.tsx`
6. `components/app/watchlist-detail-dashboard.tsx`
7. `lib/actions/watchlist.ts`
8. `lib/watchlist/watchlist-data.ts`
9. `lib/services/finnhub.ts`
10. `lib/services/twelvedata.ts`
11. `supabase/migrations/009_watchlist_items.sql`

### If changing community/home

Read:

1. `CLAUDE.md`
2. `supabase/migrations/011_community.sql`
3. `lib/community/types.ts`
4. `lib/actions/community.ts`
5. `components/app/home-feed.tsx`
6. `components/app/post-composer.tsx`
7. `components/app/community-post-card.tsx`
8. `components/app/post-comments-panel.tsx`
9. `components/app/trending-tickers-card.tsx`
10. `components/app/active-discussions-card.tsx`
11. `app/home/page.tsx`

### If changing auth/session handling

Read:

1. `CLAUDE.md`
2. `middleware.ts`
3. `lib/supabase/server.ts`
4. `lib/supabase/client.ts`
5. `app/(auth)/login/page.tsx`
6. `app/auth/callback/route.ts`

### If changing AI provider wiring

Read:

1. `CLAUDE.md`
2. `lib/services/ai/index.ts`
3. relevant provider file
4. `.env.example`
5. `scripts/test-openrouter.mjs`
6. `scripts/test-azure-openai.mjs`

### If changing billing/subscriptions

Read:

1. `CLAUDE.md`
2. `lib/billing/plans.ts`
3. `lib/billing/subscriptions.ts`
4. `lib/billing/store.ts`
5. `lib/billing/stripe.ts`
6. `lib/billing/sync.ts`
7. `app/api/billing/checkout/route.ts`
8. `app/api/billing/portal/route.ts`
9. `app/api/stripe/webhook/route.ts`
10. `components/app/billing-settings-panel.tsx`
11. `components/app/billing-action-button.tsx`
12. `supabase/migrations/014_billing.sql`
13. `tests/billing-subscriptions.test.ts`

### If changing daily digest notifications

Read:

1. `CLAUDE.md`
2. `supabase/migrations/024_daily_digest_notifications.sql`
3. `lib/notifications/types.ts`
4. `lib/notifications/timezone.ts`
5. `lib/notifications/preferences.ts`
6. `lib/notifications/daily-digest.ts`
7. `lib/notifications/delivery.ts`
8. `emails/daily-digest-email.tsx`
9. `app/api/notifications/daily-digest/cron/route.ts`
10. `app/digest/[digestId]/page.tsx`
11. `components/app/notification-settings-panel.tsx`
12. `.github/workflows/daily-digest.yml`

### If changing earnings report links

Read:

1. `CLAUDE.md`
2. `supabase/migrations/024_ticker_earnings_reports.sql`
3. `lib/services/earnings-reports.ts`
4. `app/api/earnings-reports/cron/route.ts`
5. `.github/workflows/earnings-report-sync.yml`
6. `lib/server/page-loaders.ts`
7. `components/app/portfolio-holdings-table.tsx`
8. `components/app/watchlist-detail-dashboard.tsx`
9. `lib/security/publisher-url.ts`

### If changing preferences/theme

Read:

1. `CLAUDE.md`
2. `app/layout.tsx`
3. `lib/preferences.ts`
4. `components/providers/preferences-provider.tsx`
5. `components/app/preferences-panel.tsx`
6. `lib/i18n/dictionaries.ts`

## Useful Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run test -- tests/daily-digest-builder.test.ts tests/daily-digest-cron-route.test.ts tests/earnings-reports-service.test.ts tests/earnings-reports-cron-route.test.ts
node --env-file=.env scripts/test-openrouter.mjs
node --env-file=.env scripts/test-azure-openai.mjs
python -m workers.news_ingestion.main --check
```

## Final Guidance For Future Agents

- trust migrations and current route/service code more than marketing copy
- read only the task-relevant files after this handoff, not the whole repo
- do not confuse Azure AI Foundry agent endpoints with Azure OpenAI endpoints
- preserve the StepFun/OpenRouter path unless explicitly asked to remove it
- assume the user may have ongoing local changes in modified files
- avoid destructive git commands
