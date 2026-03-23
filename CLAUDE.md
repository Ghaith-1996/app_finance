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

Important runtime note:

- as of this handoff, the workspace `.env` still keeps `AI_PROVIDER=openrouter`
- Azure support is implemented in code, but the runtime was not flipped because Azure credentials/base URL/deployment were not present in the workspace

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase SSR/client SDK
- Yahoo Finance (`yahoo-finance2`)
- Python worker for ingestion
- Vitest + Testing Library

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

Login flow:

- login page offers Google and GitHub OAuth
- callback route exchanges auth code for session
- after success, user is redirected to the requested route or `/portfolio`

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

- marketing/landing page
- built from mock/static content in `lib/mock-data.ts`
- showcases product story, FAQ, proof, feature framing

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

File:

- `app/watchlist/page.tsx`

Current state:

- largely static/demo page
- uses hard-coded watchlist items
- links into `/feed?symbol=...`
- not backed by real persistent watchlist storage yet

## API Routes

### `POST /api/news/refresh`

File:

- `app/api/news/refresh/route.ts`

This is the main authenticated full pipeline route.

Behavior:

- authenticates user
- resolves selected portfolio or latest one
- requires holdings
- resolves global ticker universe from all holdings in DB
- runs Python worker on global sources
- fetches Finnhub targeted company news for selected portfolio
- enriches newly inserted articles with AI
- runs portfolio analysis
- returns per-stage details plus pool snapshot and analysis metadata

Important conceptual behavior:

- ingest is global
- analysis is portfolio-specific

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
- market mode reads `news_items` directly
- market mode marks stories as portfolio matches based on direct tag/impact overlap

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
- calls `ai.answerArticleQuestion(...)`
- stores assistant reply
- returns thread messages

### `POST /api/portfolio-copilot`

File:

- `app/api/portfolio-copilot/route.ts`

Behavior:

- authenticated
- requires `portfolioId` and `message`
- loads portfolio overview, holdings, latest insights, and latest feed context
- calls `ai.answerPortfolioQuestion(...)`
- returns `{ answer }`

### `POST /api/news/ingest`

File:

- `app/api/news/ingest/route.ts`

Behavior:

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
- unattended global ingest
- resolves global tickers
- runs Python worker
- enriches inserted articles
- does not run analysis

### `GET /api/news/health`

File:

- `app/api/news/health/route.ts`

Behavior:

- authenticated
- runs worker preflight using `python -m workers.news_ingestion.main --check`
- verifies Python availability and worker dependencies/config

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

## Global Ticker Resolution

Main file:

- `lib/services/ticker-resolver.ts`

Behavior:

- reads all holdings across all portfolios
- returns sorted unique uppercased symbols

This is used for EDGAR/global ingest, not just one portfolio.

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
- reads newest 100 `news_items` from the last 24 hours
- determines direct portfolio overlap first
- otherwise uses AI portfolio match assessment
- persists `feed_items` only when relevance is high enough
- writes `portfolio_insights`

Important match behavior:

- direct held-ticker matches can bypass AI portfolio-match assessment
- direct match reason codes include:
  - `held_ticker_tag`
  - `held_ticker_impact`
- indirect validation currently uses:
  - `held_company_mention`
  - `sector_exposure_explicit`

Important guardrails:

- generic "why it matters" text is sanitized away
- sector-only matches require stronger evidence
- no generic fallback feed exists anymore

Implication:

- personal feed can legitimately be empty even when the global news pool is not

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
- `lib/services/ai/portfolio-match.ts`
- `lib/services/ai/holding-name-utils.ts`

Provider selection in `lib/services/ai/index.ts`:

- `AI_PROVIDER=azure` -> Azure OpenAI provider
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
- it is the currently active runtime path in `.env`

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

Files added in this session:

- `lib/services/ai/azure-openai-provider.ts`
- `scripts/test-azure-openai.mjs`

Behavior:

- uses Azure OpenAI Responses API
- normalizes base URL to `/openai/v1/`
- uses `AZURE_OPENAI_MODEL` or `AZURE_OPENAI_DEPLOYMENT` as deployment name
- supports `AZURE_OPENAI_REASONING_EFFORT`

Expected environment:

- `AI_PROVIDER=azure`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_BASE_URL`
- `AZURE_OPENAI_MODEL`

Important caveat:

- `AZURE_OPENAI_MODEL` must be the Azure deployment name, not just the family label

### Azure endpoint mismatch warning

The user showed published Foundry agent endpoints like:

- `https://...services.ai.azure.com/api/projects/...`

Those are Azure AI Foundry Agent Service endpoints.

The current app integration does not use those endpoints.

The Azure provider in this repo expects Azure OpenAI endpoints like:

- `https://YOUR-RESOURCE.openai.azure.com`
- or `https://YOUR-RESOURCE.openai.azure.com/openai/v1/`

If a future task wants to call the published agent directly, that is a separate integration path and should not be confused with the current `azure-openai-provider.ts` implementation.

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

## RLS Model

High-level:

- portfolio-owned data is user-scoped via `portfolios.user_id`
- `news_items` are readable by authenticated users
- article chat is user-scoped

Important implication:

- service-role key is required for ingestion/upserts that bypass normal user ownership constraints

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
- `FINNHUB_API_KEY`
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

### Legacy / currently unused in app flow

- `NEWS_PROVIDER`
- `MARKETAUX_API_KEY`

Reference:

- `.env.example` is the current documented env template

Security note:

- do not echo `.env` secrets back into chat or new docs

## Tests

Test directory:

- `tests/`

Current files:

- `ai-prompts.test.ts`
- `analysis-constants.test.ts`
- `analysis-run-trigger.test.tsx`
- `analysis-service.test.ts`
- `article-cta.test.tsx`
- `cron-route.test.ts`
- `feed-query.test.ts`
- `feed-route.test.ts`
- `feed-view.test.tsx`
- `finnhub-refresh.test.ts`
- `gnews-targeting.test.ts`
- `ingest-detail.test.ts`
- `portfolio-match-parser.test.ts`
- `refresh-route.test.ts`

Coverage themes:

- prompt shape
- analysis constants and gating behavior
- analysis trigger UI state
- feed route and feed view behavior
- refresh/cron route orchestration
- Finnhub targeted ingest
- GNews query building
- article CTA behavior
- parser behavior

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
- `supabase/README.md`
  - migration application basics
- `workers/news_ingestion/TROUBLESHOOTING.md`
  - worker ops help

## Known Caveats And Rough Edges

- `watchlist` is demo/static, not persistent
- some portfolio/strategy surfaces contain heuristic presentation logic
- marketing pages are more polished than some backend guarantees
- article chat depends on migration `006_article_chat.sql` being present in the live DB
- the public OpenAI provider is still hardcoded to `gpt-4o-mini`
- Azure support is coded but not active in runtime until env is switched
- personal feed emptiness is valid and expected if nothing scores above threshold
- generated Python `__pycache__` files are present and should usually be ignored

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
