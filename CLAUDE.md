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

- `portfolio-signal`

What the app does:

- portfolio-aware finance workflow app
- ingests global market/news data
- stores a shared 24-hour news pool
- enriches articles with AI
- runs portfolio-specific matching and scoring
- generates a personalized feed and portfolio insights
- supports article-level chat and portfolio-level copilot chat

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

These decisions were made in the current thread and are reflected in code/doc changes:

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
- `lib/actions/`
  - server actions, mainly portfolio import/edit/read helpers
- `lib/services/`
  - core business logic
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

At the time of writing, the worktree is dirty. Do not assume all local changes are yours.

Tracked modified files visible in `git status`:

- `.env.example`
- `README.md`
- `app/onboarding/page.tsx`
- `components/app/app-shell.tsx`
- `components/app/user-menu.tsx`
- `lib/services/ai/index.ts`
- `lib/services/analysis.ts`
- `middleware.ts`
- `package-lock.json`

Untracked files visible in `git status`:

- `CLAUDE.md`
- `lib/services/ai/azure-openai-provider.ts`
- `scripts/test-azure-openai.mjs`
- multiple Python `__pycache__` files under `workers/`

Implications:

- do not revert unrelated local changes
- do not treat `__pycache__` files as source
- prefer reading the current file contents before editing any of the modified files above

## Runtime Architecture

High-level split:

- browser/client components handle interaction
- server components load authenticated data
- server actions manage portfolio import/edit flows
- Next API routes expose feed, analysis, ingest, health, and chat behaviors
- Python worker fetches and normalizes external news
- TypeScript handles AI enrichment and portfolio scoring

Important conceptual split:

- `news_items` is the global, shared recent news pool
- `feed_items` is the portfolio-specific result of analysis

That split is central to the product and the code.

Ingestion model:

- all ingestion into `news_items` happens via a 20-minute cron job (`POST /api/news/cron`)
- the cron job builds its global ticker universe from all user holdings + all user watchlist symbols
- it runs Python worker (EDGAR + NewsAPI + GNews) + Finnhub targeted news
- after enrichment, it runs analysis for all portfolios automatically
- user-triggered refresh (`/api/news/refresh`) is deprecated and no longer called by the UI
- personal feed selection considers both portfolio holdings and watchlist symbols
- `feed_items.match_sources` tracks whether each story matched via `"portfolio"`, `"watchlist"`, or both

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
- `/complete-profile`

Login flow:

- login page offers Google and GitHub OAuth
- callback route exchanges auth code for session
- after success, users with incomplete profile rows are redirected to `/complete-profile?redirectTo=...`
- profile completion requires first name, last name, and username (`user_profiles.handle`)
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
- clear conversion paths to GitHub and Login

Important caveat:

- product messaging can imply a more complete backend than actually exists

### `/login`

Files:

- `app/(auth)/login/page.tsx`
- `app/(auth)/login/layout.tsx`

Purpose:

- sign in with Google or GitHub via Supabase OAuth

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

- personal feed = latest completed analysis run only
- market feed = direct `news_items` query from the last 24 hours
- client-side filtering exists for holdings, sectors, category, source type, recency
- article detail panel supports article chat

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
- shows `BillingSettingsPanel` with current plan, status, renewal date, allowed model tiers, and manage/upgrade CTAs
- displays `billing=success` badge after Stripe checkout redirect

### `/pricing`

Files:

- `app/pricing/page.tsx`
- `components/app/billing-action-button.tsx`

Purpose:

- public pricing page showing Free, Premium, and Ultimate plan cards

Current behavior:

- fetches live price labels from Stripe (`stripe.prices.retrieve`) for Premium and Ultimate
- shows feature lists per plan and CTA buttons
- Premium CTA and Ultimate CTA create Stripe Checkout sessions
- already-subscribed users on paid plans are rejected (409) by the checkout route
- shows `billing=cancel` feedback when returning from a cancelled checkout

## API Routes

### `POST /api/news/refresh` (deprecated)

File:

- `app/api/news/refresh/route.ts`

**Deprecated**: retained for admin/debug use only. No user-facing UI calls this route anymore. Production ingestion and analysis now run via the 20-minute cron job.

Behavior (unchanged, but no longer user-triggered):

- authenticates user
- resolves selected portfolio or latest one
- requires holdings
- resolves global ticker universe from all holdings in DB
- runs Python worker on global sources
- fetches Finnhub targeted company news for selected portfolio
- enriches newly inserted articles with AI
- runs portfolio analysis
- returns per-stage details plus pool snapshot and analysis metadata

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

Important behavior:

- feed age is capped to 24 hours for both modes
- personal mode joins `feed_items` to `news_items`
- personal mode returns `matchSources` per story (`"portfolio"`, `"watchlist"`, or both)
- watchlist-only fallback: if user has no portfolio but has watchlist items, personal mode performs lightweight on-the-fly matching against `news_items` using watchlist symbols
- market mode reads `news_items` directly
- market mode marks stories as portfolio matches and/or watchlist matches (`isPortfolioMatch`, `isWatchlistMatch`)
- response includes `watchlistSymbols` array alongside existing `portfolioSymbols` and `portfolioSectors`

### `GET /api/article-chat`

File:

- `app/api/article-chat/route.ts`

Behavior:

- authenticated
- requires `portfolioId` and `newsItemId`
- verifies portfolio ownership
- lazily creates or loads article chat thread
- returns messages

### `POST /api/article-chat`

Behavior:

- authenticated
- requires `portfolioId`, `newsItemId`, `message`
- stores user message
- loads article + holdings + latest feed match context
- calls `ai.answerArticleQuestion(...)` (providers do **not** fall back to the stub on failure; empty or failed generations surface as `AIChatError` / `toArticleChatError`)
- on provider failure: returns **503** with `{ error, code }` (`AIChatErrorCode`), logs provider + deployment server-side; **does not** insert an assistant row
- error codes map to distinct user-facing messages: `provider_auth` → credentials/config hint; `provider_timeout` → retry hint; `provider_bad_response` → rephrase hint; `provider_unavailable` → generic retry
- on success: stores assistant reply and returns `{ threadId, messages }`

### `POST /api/portfolio-copilot`

File:

- `app/api/portfolio-copilot/route.ts`

Behavior:

- authenticated
- requires `portfolioId` and `message`
- loads portfolio overview, holdings, latest insights, and latest feed context
- calls `ai.answerPortfolioQuestion(...)`
- returns `{ answer }`

### `POST /api/news/ingest` (deprecated)

File:

- `app/api/news/ingest/route.ts`

**Deprecated**: retained for admin/debug use only. Production ingestion now runs via the 20-minute cron job.

Behavior (unchanged):

- authenticated
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

### `GET /api/news/health`

File:

- `app/api/news/health/route.ts`

Behavior:

- authenticated
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
- idempotent via `hasProcessedStripeEvent` / `insertProcessedStripeEvent`
- stores minimal audit payload (`buildEventAuditPayload`) not the full Stripe object
- syncs customer record and subscription to DB
- returns 200 for all handled events, 204 for unhandled event types

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
- reads latest completed run for `lastAnalyzedAt`
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

## Twelve Data Service

Main file:

- `lib/services/twelvedata.ts`

Used for:

- watchlist detail dashboard (quote, profile, price chart, stats, earnings, financials)

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

Current headline-style source types:

- `newsapi`
- `gnews`
- `finnhub`
- `marketaux`

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

- `ANALYSIS_NEWS_POOL_LIMIT = 100`
- `ANALYSIS_RELEVANCE_MIN = 60`

Core behavior:

- creates/updates `analysis_runs`
- reads holdings for the selected portfolio
- reads the user's `watchlist_items` (resolved via `portfolio.user_id`)
- reads newest 100 `news_items` from the last 24 hours
- performs dual matching: checks articles against both portfolio holdings and watchlist symbols
- persists `feed_items` only when relevance is high enough
- writes `portfolio_insights`
- persists `match_sources` (array of `"portfolio"`, `"watchlist"`, or both) on each `feed_item`

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
- anything else -> OpenRouter provider

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

- free plan users → OpenRouter (StepFun `step-3.5-flash:free`)
- premium plan users → Mistral (`mistral-large-latest`)
- ultimate plan users → Azure OpenAI (`gpt-5.2`)

Key files:

- `lib/billing/plans.ts` — `providerIdForTier()`, `allowedModelTiersForPlan()`, `isTierAllowedForPlan()`
- `lib/billing/subscriptions.ts` — `assertUserCanUseModelTier()` throws `BillingAccessError` if tier is gated
- `lib/types.ts` — `ArticleChatModelTier = "free" | "premium" | "ultimate"`

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

### Core enums from initial schema

- `source_type`
- `sync_status`
- `analysis_status`
- `sentiment_type`
- `impact_level`

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

Notes:

- `handle` remains the unique username field
- `display_name` is now written as `first_name + last_name`
- `first_name` and `last_name` were added in `012_user_profile_names.sql`

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

### `billing_events`

Purpose:

- idempotency + audit log for processed Stripe webhook events

Key columns:

- `id` UUID
- `stripe_event_id` TEXT, UNIQUE
- `event_type` TEXT
- `payload` JSONB (redacted audit projection)
- `processed_at`

RLS: no user-facing policies; internal audit table accessed only via service-role.

Migrations: `014_billing.sql`, `015_billing_events_rls.sql`, `016_billing_private_rls.sql`

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

Located in `components/marketing/`. Sticky site header with "Pulsefolio" branding, nav links (Product, Use cases, How it works, FAQ), "View demo" ghost link to `/feed`, and primary CTA "Get started" to `/onboarding`.

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
- `components/app/portfolio-performance-chart.tsx` — Recharts AreaChart rendering simulated portfolio performance data; supports 1D, 1W, 1M, ALL time range buttons with range-based data generation
- `components/app/inline-refresh-prices-button.tsx` — reusable client button triggering portfolio price sync; shows loading state and color-coded feedback (green=updated, amber=no_quotes, red=error)
- `components/app/add-position-form.tsx` — form for manually adding a single holding; validates symbol, quantity, average cost; calls `addPortfolioPosition` server action

### Onboarding Components

- `components/app/onboarding-page-client.tsx` — top-level onboarding orchestrator supporting CSV import or manual entry methods across method/intake/review steps
- `components/app/portfolio-csv-import-flow.tsx` — multi-step CSV import handling file upload, column mapping, holdings review, and save with configurable replace/merge modes

### Billing Components

- `components/app/billing-action-button.tsx` — button triggering Stripe checkout (purchase plan) or portal (manage subscription); handles auth redirects and error states with loading feedback
- `components/app/billing-settings-panel.tsx` — displays current plan, allowed model tiers, renewal/trial end date, and manage/upgrade CTAs sourced from `BillingSummary`
- `components/app/provider-card.tsx` — card rendering a provider with status badge (Preview/Demo), gradient background per provider ID, and optional onSelect callback

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
- `resolveFeedPayload()` helper for building feed responses

### Page Loaders (`lib/server/page-loaders.ts`)

Provides:

- `PortfolioSummary`, `HoldingRow`, `AuthenticatedPageContext` types
- server-only loaders for authenticated page contexts
- shared data fetching for portfolio pages

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
- `TickerImpact`, `MatchReasonCode`, `MatchSource` — feed/analysis types
- `Provider` — AI provider display type with id, name, model, status, and tier badge
- `FAQItem` — marketing FAQ entry type
- `Holding`, `HoldingDraft` — portfolio position types
- `PortfolioPricingRefreshResult`, `PortfolioPricingRefreshStatus` — types for the price sync flow (status values: `updated`, `skipped`, `no_quotes`, `error`)
- `ArticleChatModelTier` — `"free" | "premium" | "ultimate"` for billing-driven AI model selection

## RLS Model

High-level:

- portfolio-owned data is user-scoped via `portfolios.user_id`
- `watchlist_items` are user-scoped via `watchlist_items.user_id`
- `news_items` are readable by authenticated users
- article chat is user-scoped

Important implication:

- service-role key is required for ingestion/upserts that bypass normal user ownership constraints
- billing tables have RLS enabled but user-facing SELECT policies are dropped; all billing reads go through service-role

## Security Modules

### Rate Limiting

File:

- `lib/security/rate-limit.ts`

Provides:

- `createRateLimiter({ windowMs, maxRequests })` — in-memory sliding-window rate limiter
- `check(key)` returns `{ allowed, retryAfterMs?, remaining }`
- auto-cleans expired entries every 60 seconds
- suitable for single-instance deployments; replace backing store with Upstash Redis for horizontal scaling

### Redirect Validation

File:

- `lib/security/redirect.ts`

Provides:

- `isValidInternalRedirect(path)` — blocks `://`, `//`, and paths not in the allowed prefix list
- `sanitizeRedirect(raw, fallback)` — returns safe redirect target, falls back when validation fails
- allowed prefixes: `/portfolio`, `/analysis`, `/feed`, `/home`, `/watchlist`, `/settings`, `/complete-profile`, `/onboarding`, `/pricing`
- used by middleware and auth callback to prevent open-redirect attacks

### Timing-Safe Comparison

File:

- `lib/security/timing.ts`

Provides:

- `isTimingSafeEqual(a, b)` — constant-time string comparison using Node's `crypto.timingSafeEqual`
- used by all `CRON_SECRET` checks to prevent timing attacks

## Bot Protection (Cloudflare Turnstile)

Files:

- `lib/security/turnstile.ts` — server-side Siteverify verification helper
- `components/security/turnstile-widget.tsx` — reusable client widget + `useTurnstile` hook

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
- on failure: returns 403 (routes) or `{ ok: false, error }` (actions) without executing the action
- tokens expire quickly and are single-use; the widget is reset after each submission

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
- `providerIdForTier(tier)` — free→`"openrouter"`, premium→`"mistral"`, ultimate→`"azure"`
- `allowedModelTiersForPlan(planKey)`, `isTierAllowedForPlan(planKey, tier)`
- `defaultModelTierForPlan(planKey)` — returns highest tier the plan allows
- `requiredPlanForTier(tier)` — inverse lookup

### Store (`lib/billing/store.ts`)

Provides:

- Supabase CRUD layer for `billing_customers`, `subscriptions`, `billing_events`
- `loadBillingCustomerByUserId`, `loadBillingCustomerByStripeCustomerId`, `upsertBillingCustomer`
- `loadSubscriptionsForUser`, `upsertSubscriptionRow`
- `hasProcessedStripeEvent`, `insertProcessedStripeEvent` — idempotency helpers

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
- `workers/news_ingestion/bootstrap.py`
- `workers/news_ingestion/schema.py`
- `workers/news_ingestion/upsert.py`
- `workers/news_ingestion/fetchers/edgar_fetcher.py`
- `workers/news_ingestion/fetchers/newsapi_fetcher.py`
- `workers/news_ingestion/fetchers/gnews_fetcher.py`
- `workers/news_ingestion/fetchers/result.py`

What it does:

- fetches EDGAR filings for a ticker universe
- fetches NewsAPI market/business headlines
- fetches GNews top and targeted queries
- normalizes results into shared schema
- upserts into Supabase

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
- `EDGAR_LOCAL_DATA_DIR`

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

- `.env.example` is the current documented env template

Security note:

- do not echo `.env` secrets back into chat or new docs

## Tests

Test directory:

- `tests/`

Current files:

- `ai-chat-errors.test.ts`
- `ai-prompts.test.ts`
- `analysis-constants.test.ts`
- `analysis-run-trigger.test.tsx`
- `analysis-service.test.ts`
- `article-chat-panel.test.tsx`
- `article-chat-route.test.ts`
- `article-cta.test.tsx`
- `cache.test.ts`
- `cron-route.test.ts`
- `env-validation.test.ts`
- `feed-query.test.ts`
- `feed-route.test.ts`
- `feed-view.test.tsx`
- `finnhub-errors.test.ts`
- `finnhub-refresh.test.ts`
- `gnews-targeting.test.ts`
- `ingest-detail.test.ts`
- `logger.test.ts`
- `portfolio-match-parser.test.ts`
- `refresh-route.test.ts`
- `profile-utils.test.ts`
- `auth-callback-route.test.ts`
- `user-menu.test.tsx`
- `turnstile-verify.test.ts`
- `turnstile-protected-routes.test.ts`
- `article-chat-token-budget.test.ts`
- `active-portfolio-value-card.test.tsx`
- `analysis-cron-route.test.ts`
- `app-shell-layout.test.tsx`
- `billing-subscriptions.test.ts`
- `community-actions.test.ts`
- `community-types.test.ts`
- `enrich-cron-route.test.ts`
- `extraction-uuid-validation.test.ts`
- `handle-hardening.test.ts`
- `middleware.test.ts`
- `mistral-provider.test.ts`
- `onboarding-page.test.tsx`
- `portfolio-copilot-route.test.ts`
- `portfolio-csv-import-flow.test.tsx`
- `portfolio-pricing-section.test.tsx`
- `portfolio-snapshot-panel.test.tsx`
- `portfolio-sync-prices-route.test.ts`
- `portfolio-value-card.test.tsx`
- `portfolio-price-sync.test.ts`
- `portfolio-refresh-loaders.test.ts`
- `rate-limit.test.ts`
- `redirect-validation.test.ts`
- `streamed-price-refresh-pages.test.tsx` (if present)

Coverage themes:

- prompt shape
- analysis constants and gating behavior
- analysis trigger UI state (status-only, no refresh button)
- feed route: personal mode with matchSources/matchReasonCodes, market mode with isWatchlistMatch, watchlist-only fallback
- cron route: full pipeline with Finnhub, analysis-for-all, cooldown skipping
- refresh route orchestration (deprecated but tested)
- Finnhub targeted ingest
- Finnhub provider error classification (missing key, 401/403, 429, timeout, bad payload, no match, valid search)
- GNews query building
- article CTA behavior
- parser behavior
- server-side cache (TTL expiry, fetch-through, hit/miss)
- structured logger (info/warn/error, scoped, data serialization)
- env validation (require/missing, hasKey)
- profile validation/completeness helpers, callback redirect gating, and avatar dropdown behavior
- Turnstile server-side verification (success, failure, timeout/duplicate, network error, missing token/secret, action/hostname mismatch, idempotency key, client IP extraction)
- Turnstile route/action protection gating (article-chat, portfolio-copilot, community post/comment reject without valid token)
- article chat token budget assertion (2000 tokens across all four providers)
- billing entitlement logic (buildBillingState, trialing/active/past_due, tier gating)
- Mistral provider creation, config validation, chat/enrichment methods
- analysis cron route (GET eligibility, POST single-portfolio run, cooldown, CRON_SECRET)
- enrichment cron route (batch enrichment, max batch size, CRON_SECRET)
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
- portfolio snapshot panel (metric display)
- portfolio sync prices route (auth, freshness, overview merge)
- portfolio value card (display, refresh state)
- active portfolio value card (value, change, trending)
- rate limit (sliding window, cleanup, edge cases)
- redirect validation (safe/unsafe paths, sanitization)
- portfolio price sync (stale-skip, refresh, auth, dedup)
- portfolio refresh loaders (dedupe, cached in-flight promise)

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
  - now documents local run and AI provider setup
- `analysis.txt`
  - longer repo analysis
- `CLAUDE.md`
  - this handoff
- `PRE_LAUNCH_CHECKLIST.md`
  - deployment checklist covering env vars, migrations, API quotas, smoke tests, rollback
- `.github/workflows/news-cron.yml`
  - schedules GitHub Actions every 20 minutes, runs `python -m workers.news_ingestion.cron_runner`, and `POST`s the payload to the deployed `/api/news/cron` route
- `supabase/README.md`
  - migration application basics
- `workers/news_ingestion/TROUBLESHOOTING.md`
  - worker ops help

## Production Readiness Status

Completed workstreams:

1. Mock/misleading data: portfolio chart labeled "Simulated", Y-axis precision fixed
2. Render performance: `/portfolio/full` no longer blocks on live quote sync; overview uses stored DB values
3. Provider hardening: Finnhub throws typed `FinnhubError`; watchlist actions map each code to user-facing messages with retry hints; Twelve Data degrades gracefully on partial endpoint failure
4. Caching: Twelve Data — quote (1 min), time_series (5 min), profile/statistics (30 min), earnings/financials (60 min) — cached server-side via `lib/services/cache.ts`
5. Env validation: `lib/env.ts` provides lazy `require*` functions; `checkOptionalProviders` warns on startup
6. Observability: `lib/logger.ts` structured logging in Finnhub, Twelve Data, and watchlist actions
7. Tests: `finnhub-errors.test.ts`, `cache.test.ts`, `logger.test.ts`, `env-validation.test.ts`, `twelvedata-detail.test.ts` — covering provider error classification, cache TTL, structured logging, env validation, and Twelve Data aggregator partial/full/failure scenarios
8. UX polish: watchlist dashboard catches unhandled promise rejections; `PRE_LAUNCH_CHECKLIST.md` covers env, migrations, API quotas, smoke tests, rollback

## Known Caveats And Rough Edges

- portfolio performance chart shows simulated data (clearly labeled)
- monthly change is hardcoded to 0 in portfolio overview
- some portfolio/strategy surfaces contain heuristic presentation logic
- marketing pages are more polished than some backend guarantees
- article chat depends on migration `006_article_chat.sql` being present in the live DB
- the public OpenAI provider is still hardcoded to `gpt-4o-mini`
- article chat output budget is now 2000 tokens, so longer answers are possible but provider-side truncation is still possible on very long prompts
- local verification of `tests/article-chat-token-budget.test.ts` is currently blocked in this environment by a Vitest startup `spawn EPERM` error after working around PowerShell `npm.ps1` policy restrictions
- local Vitest execution for the new profile tests is blocked by the same `spawn EPERM` startup issue
- personal feed emptiness is valid and expected if nothing scores above threshold
- personal feed can now include watchlist-only matches (relevance 75, no AI assessment)
- newly added watchlist symbols affect the feed on the next cron cycle, not immediately
- the `/api/news/refresh` and `/api/news/ingest` routes are deprecated but still functional for admin use
- the "Refresh news & analysis" button has been removed from the analysis page UI
- generated Python `__pycache__` files are present and should usually be ignored
- some pre-existing tests (`feed-view`, `gnews-targeting`, `analysis-service`) may fail until mocks match current routes

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

## Useful Commands

```bash
npm run dev
npm run typecheck
npm run test
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
