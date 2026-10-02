# Pulsefolio audit remediation ledger

Branch: `fix/fixing-frontand-backend` (from `main` @ `0334ee3`).
Audit baseline: `c466f0b`. Current HEAD differs from the audit commit **only** in `package.json` / `package-lock.json`
(`next` 16.3.4 → 16.3.6, `vitest` 4.1.0 → 4.1.11). Every application source file, migration and workflow is byte-identical
to the audited commit (`git diff --quiet c466f0b HEAD -- . ':!package.json' ':!package-lock.json'` → identical), so audit
line references remain exact.

## Phase 0 baseline (HEAD 0334ee3, before any remediation edit)

| Check | Result |
|---|---|
| `npm ci --ignore-scripts` | pass, 0 vulnerabilities reported by install |
| `npm run test` | 105 files, **575 passed**, 0 failed |
| Python tests (`workers/news_ingestion/tests`) | **NOT RUN — no Python interpreter on this machine** (only the Windows Store alias) |
| `npm run typecheck` | pass |
| `npm run lint` | 0 errors, 20 warnings (same as audit) |
| `npm run build` | pass |
| `npm audit --omit=dev` | 0 advisories (critical/high/moderate/low = 0) |
| Audit repros (JS, against HEAD) | all 5 still reproduce the faulty outcome (see below) |
| Audit repro J1 (Python) | not runnable — no Python |

Repro re-run on HEAD: B1 replace leaves 0 holdings / merge returns success with qty 10≠99; B3 allocations 100+50=150%;
B4 15≠20; B5 70%≠25% and snapshot 4%≠0%; B2 100 USD + 100 CAD = 200 "USD"; B6 dated positions → empty drafts;
S1 `[::ffff:7f00:1]`, `[::ffff:a9fe:a9fe]`, `[fe90::1]` accepted and earnings fetch attempted mapped loopback;
S2 forged `user_metadata.email_verified` → admin (allowlisted email only); B7 `new_B active` → `old_A canceled`;
J2 both inserts rejected yet `complete`, `feedItemsCreated:1`; J3 retry `enriched:0`, 1 provider call;
J4 keys `portfolio-1:feed-1` vs `portfolio-1:feed-2`; J5 both claims `send`, `failed` → `skip`;
J6 URL/date overwritten with null, `missing:1`.

## Status legend

SP = STILL PRESENT · PF = PARTIALLY FIXED · AF = ALREADY FIXED · NLA = NO LONGER APPLICABLE ·
EXT = REQUIRES EXTERNAL / PRODUCT DECISION · STG = REQUIRES STAGING / DEPLOYED VERIFICATION

Implementation status: `todo` · `in progress` · `fixed (evidence)` · `blocked (reason)`

## Backend findings

| ID | Pri | Status @HEAD | Evidence | Affected files | Deps | Proposed repair | Regression test | Risk | Staging | Impl |
|---|---|---|---|---|---|---|---|---|---|---|
| B1 | P1 | SP | repro: replace→0 holdings; merge false success | `lib/actions/portfolio.ts:307-441` | new migration | Runtime-validate bounded input; new `save_portfolio_holdings` SECURITY INVOKER/ownership-checked plpgsql RPC doing replace/merge in one transaction; quotes enrichment stays separate after commit | failed insert, mid-merge failure, malformed, duplicate symbol, invalid ranges, retry, happy path | Medium (new RPC must be applied before deploy) | Yes – RPC + RLS in staging | todo |
| B2 | P1 | SP + EXT | repro: 100 USD+100 CAD=200 USD; no base-currency/FX policy exists in repo | `lib/services/portfolio.ts`, `lib/server/page-loaders.ts`, `lib/services/portfolio-value-snapshots.ts`, `lib/utils.ts` | product decision | **Interim (no decision needed):** detect mixed quote currencies and refuse to present a single unconverted total (per-currency totals / explicit "mixed currency" state); snapshot currency not order-dependent. **Full FX:** blocked on base-currency + FX provider/timestamp policy | USD-only, CAD-only, mixed, ordering | Medium | – | todo (interim) / blocked (FX) |
| B3 | P1 | SP | repro: 150% allocation | `lib/actions/portfolio.ts:395-425, 928-965` | B2 interim, H9 | Whole-portfolio valuation from all positions using last-known price where fresh quote missing; return fresh/stale/unavailable + failed symbols; don't stamp `last_synced_at` as full sync when partial | missing quote, provider outage, recovery, rejected row update | Low-Med | – | todo |
| B4 | P2 | SP | repro: 15≠20 | `lib/actions/portfolio.ts:602-699` | B1 migration pattern | Atomic RPC with `SELECT … FOR UPDATE`; idempotency key per client operation; oversell rejected in DB | add/add, add/sell, double submit, retry, sell-all, oversell | Medium | Yes | todo |
| B5 | P2 | SP | repro: 70% vs 25%; snapshot 4% vs 0% | `lib/services/portfolio.ts:40-46`, `lib/server/page-loaders.ts:945-956`, `lib/services/portfolio-value-snapshots.ts:255-288` | H9 | One canonical `computeDayChange` = (Σcurrent − Σprevious)/Σprevious; used by all three | ±20% equal, unequal weights, missing/zero prior close | Low | – | todo |
| B6 | P2 | SP | repro: dated positions → [] | `lib/services/csv-parser.ts:113-119, 196-214` | – | Transaction mode requires a side/action column; nonempty→empty is an explicit error with skip reasons | dated positions, buy/sell history, ambiguous | Low | – | todo |
| B7 | P2 | SP | repro: new_B active → old_A canceled | `lib/billing/store.ts:109-120`, `lib/billing/sync.ts:174-188`, `app/api/stripe/webhook/route.ts` | migration (one-row-per-user unique index from 021) | Before overwriting the per-user row, refuse to replace an entitled row of a different subscription ID with a non-entitled/older one (or reconcile customer's subscriptions from Stripe); deterministic entitlement selection | A cancel after B active, both orders, duplicates | Medium | Yes – Stripe sandbox | todo |
| S1 | P1 | SP | repro: mapped/link-local IPv6 accepted; earnings fetch attempted | `lib/security/publisher-url.ts`, `lib/services/earnings-reports.ts:301-345`, `workers/news_ingestion/extract_full_text.py:99-160` | – | Canonical IP classification (node `net.BlockList`/parsing incl. mapped/NAT64/6to4), DNS answers validated, per-redirect validation, port/protocol limits, response size/time limits, DNS pinning via custom `lookup` on actual transport | fake-transport matrix | Medium | Egress controls in deploy | todo |
| S2 | P2 | SP (conditional) | repro: forged metadata→admin for allowlisted email only | `lib/security/admin.ts:25-48` | – | Drop `user_metadata.email_verified`; only server-owned `email_confirmed_at` / user IDs | forged metadata denied | Low | Verify each OAuth provider sets `email_confirmed_at` | todo |
| S3 | P2 | **AF** | `next@16.3.6` locked (PR #9, 821779b); `npm audit --omit=dev` = 0 | `package.json`, lock | – | Remaining: `eslint-config-next` is 16.2.6 vs next 16.3.6 (align); add advisory scan to CI (H6) | CI audit step | Low | – | partially remaining (alignment) |

## Job / notification findings

| ID | Pri | Status @HEAD | Evidence | Affected files | Deps | Proposed repair | Regression test | Risk | Staging | Impl |
|---|---|---|---|---|---|---|---|---|---|---|
| J1 | P1 | SP | source identical; Python repro not runnable locally | `workers/news_ingestion/upsert.py:94-113`, `app/api/news/cron/route.ts:81-83`, `.github/workflows/news-cron.yml`, `lib/services/news/ingest.ts` | J3 (shared enrichment state) | Enrichment selects durable backlog (pending/transient-failed, attempts<max, backoff elapsed) independent of inserted IDs; finalize/workflow enrich+analyze run regardless of new inserts; per-portfolio loop continues on error | crash after insert; identical rerun; failing portfolio mid-loop | Medium (workflow change) | Workflow run in staging | todo |
| J2 | P1 | SP | repro: rejected writes → `complete` | `lib/services/analysis.ts:413-424, 547-556, 700-749` | – | Check every insert/update error; count only persisted rows; mark run `failed` on persistence failure so readers keep last-good completed run; final status write failure surfaced | inject insight insert / feed insert / final update failure | Low-Med | – | todo |
| J3 | P2 | SP | repro: retry enriched:0 | `lib/services/news/ingest.ts:31-107`, `lib/services/analysis.ts:565-576` | J1 migration | Add `enrichment_status/attempts/next_attempt_at/last_error`; failure leaves article retryable, fallback not written into success predicate | fail once then succeed | Medium | – | todo |
| J4 | P2 | SP | repro: keys differ per run | `lib/notifications/smart-alerts.ts:262-287` | – | Dedupe key `${portfolio}:news:${newsItemId}`; upsert ignoreDuplicates preserves read state. Existing unread duplicates **not** backfilled without approval | same article analyzed twice → 1 alert, read state kept | Low (changes key format → one extra alert per active story on deploy) | – | todo |
| J5 | P2 | SP | repro: both `send`; failed→skip | `lib/notifications/daily-digest.ts:629-728`, `lib/notifications/delivery.ts:130-175` | migration (claim RPC/conditional insert) | Insert-if-absent claim returning lease token only to winner; outcome update conditional on token; distinguish `failed` (confirmed non-acceptance → retryable) vs `uncertain` (never auto-resent) | concurrent claims → 1 provider call; 429 then recovery; timeout→uncertain no resend | Medium | Twilio test creds only | todo |
| J6 | P2 | SP | repro: URL/date → null | `lib/services/earnings-reports.ts:799-915`, `app/api/earnings-reports/cron/route.ts` | – | Load last-good report; on discovery error keep report fields, write only `last_checked_at`/`error`; "no report found" distinct from provider error; route reports partial failure | fail both sources keeps report; recovery replaces | Low | – | todo |

## Frontend findings

| ID | Pri | Status @HEAD | Evidence (source identical to audit) | Affected files | Proposed repair | Test | Staging/browser | Impl |
|---|---|---|---|---|---|---|---|---|
| F01 | P1 | SP | `feed-view.tsx:766` single column < xl, detail after feed | `components/app/feed-view.tsx` | Detail in accessible sheet below xl; focus moves to it | RTL + browser 375/768/1024/1188/1280 | Yes | todo |
| F02 | P1 | SP | `app/portfolio/full/page.tsx:342-343` overflow-hidden + no min-w-0 | page + `portfolio-pricing-section.tsx` | grid `minmax(0,1fr)`, stack rail until wide; table owns overflow | browser widths | Yes | todo |
| F03 | P1 | SP | `globals.css:131` blanket `text-white` override | `app/globals.css`, full page hero, thesis tracker selects | semantic inverse token pair for fixed-dark surfaces; remove blanket hack scope | contrast check both themes | Yes | todo |
| F04 | P1 | SP + STG | raw PostgREST message surfaced; migration 030/031 exist in repo | `lib/server/page-loaders.ts:730-754`, thesis UI | Map missing-relation/schema errors to "feature unavailable" state and disable save; never show DB text | unit for error mapping | **Apply 030/031 in prod; staging round-trip** | todo |
| F05 | P1 | SP | `feed-view.tsx:648-667` resolves only within visible page | feed-view, `/api/feed` or new by-id route | Fetch requested story by ID (auth'd, `news_items` readable) independent of window; explicit not-found state | RTL + route test | Yes | todo |
| F06 | P2 | SP | `href="/feed"` hardcoded | `app/portfolio/page.tsx:191`, `today-dashboard.tsx:620` | `/feed?story=<newsItemId>` (after F05) | RTL | – | todo |
| F07 | P2 | SP | 100 vs 50 page size | `lib/server/feed.ts:17`, `feed-view.tsx:84` | single shared constant | route/page test no overlap | – | todo |
| F08 | P2 | SP | `feed-view.tsx:1008` | feed-view | separate filtered-empty vs source-empty, always offer Clear filters | RTL | – | todo |
| F09 | P2 | SP | `news-feed-card.tsx:190 slice(0,3)` | news-feed-card | full ticker pills | RTL | – | todo |
| F10 | P1 | SP | snapshots not updated after refresh | `portfolio-pricing-section.tsx`, `portfolio-performance-chart.tsx:382-419` | Day change from live overview with as-of label; chart change labelled as snapshot period | RTL | Yes | todo |
| F11 | P2 | SP | `Math.abs`, "Gain" label | `portfolio-performance-chart.tsx:406-415` | neutral "Day change", signed amount | RTL | – | todo |
| F12 | P2 | SP | collapsed aside focusable | `app-shell-layout.tsx:151-166` | `inert` on collapsed subtree + focus management | RTL | keyboard | todo |
| F13 | P2 | SP | dialog lacks focus mgmt/Escape | `feed-view.tsx:1330-1375` | shared accessible dialog hook: initial focus, trap, Escape, restore | RTL | keyboard/SR | todo |
| F14 | P2 | SP | close destroys draft | `feed-view.tsx:610-616` | preserve draft per context | RTL | – | todo |
| F15 | P2 | SP | inconsistent thresholds/timezones | `lib/services/portfolio-health.ts:265-285` + Home | shared freshness + timestamp/timezone formatter; label preview counts | unit | Yes | todo |
| F16 | P1 launch | SP + **EXT** | placeholders in `lib/legal/constants.ts:4-10` | constants | **Needs operator/legal values.** Can add build check rejecting `[INSERT` markers (would fail build until values exist) | build check | – | blocked (legal info) |
| F17 | P2 | SP | hero "Link a brokerage account"; "Signal Emerald custody account" | `components/marketing/hero.tsx:37`, `app/portfolio/full/page.tsx:336` | accurate copy (manual/CSV, broker support = future) | – | – | todo (Phase 4) |
| F18 | P2 | EXT | GitHub repo homepage setting points to unrelated app | GitHub repo "About" (not in source) | Owner updates repo homepage to https://pulsefolio.app | – | manual | blocked (repo settings) |
| F19 | P1 | SP | `totalValue \|\| 17900`, `"2 mins ago"` | `components/app/portfolio-value-card.tsx:32,45` | nullish handling; explicit unknown state | RTL | – | todo |
| F20 | P2 | SP | icon links unnamed < sm | `app-shell-layout.tsx:314-344` | `aria-label` | RTL | 375px/200% | todo |
| F21 | P2 | SP | no account menu on mobile | `app-shell-layout.tsx:290-357` | render UserMenu in mobile header | RTL | 375px | todo |
| F22 | P2 | SP | labels/errors not associated | `add-position-form.tsx` + icon buttons | htmlFor/ids, aria-invalid/describedby, focus first invalid, aria-labels | RTL | – | todo |
| F23 | P3 | SP | 28%+21%≠56% | `lib/mock-data.ts:111-125` | derive text from values | unit | – | todo (Phase 4) |

## Hardening items

| ID | Pri | Status @HEAD | Notes | Impl |
|---|---|---|---|---|
| H1 | P2 | SP | unpaginated global scans (digest, smart-alert prefs, analysis cron, snapshots, earnings universe, `cron_runner.py`) → keyset pagination helper | todo |
| H2 | P2 | SP + **EXT** | no SMS possession verification; needs product decision on opt-in/verification UX | blocked (decision) |
| H3 | P2 | SP | AI provider fetches have no deadline → AbortSignal timeout + error classification | todo |
| H4 | P2 | SP | chat routes `.trim()` on unvalidated JSON → runtime validation, deliberate 4xx/503 | todo |
| H5 | P2 | SP + **EXT** | quota consumed before generation; no documented failed-request policy | blocked (decision) |
| H6 | P2 | SP | no PR CI gate → add `ci.yml` (test, typecheck, lint, build, audit, python tests) | todo |
| H7 | P2 | SP + STG | duplicate prefixes 008/019/024; do **not** rename applied migrations; add validation + docs | todo / staging |
| H8 | P2 | SP | job-health signals → extend `/api/news/health` style admin status | todo (Phase 3/4) |
| H9 | P3 | SP | consolidate valuation (delivered as part of B2/B3/B5) | todo |
| H10 | P3 | SP | `lib/services/cache.ts` unbounded, no in-flight dedupe | todo |
| H11 | P3 | SP | `requirements.txt` lower bounds only → constraints file needs a Python env to generate/test | blocked (no Python locally) |
| H12 | P3 | SP + EXT | `SECURITY.md` template; needs a real reporting contact | blocked (contact) |

## Design recommendations (not defects)

D01–D15: STILL PRESENT as recommendations (source unchanged). Handled in Phase 4 only; D05 (hash-derived momentum bars),
D10 (unverified testimonials) and D15 (relevance classification investigation) flagged as trust-relevant.
D08 (OAuth branding) and D12 are configuration/product items.

## Open decisions / external blockers

1. **B2** – portfolio base currency, FX provider, FX timestamp/staleness policy, mixed-currency display policy.
2. **F16 / H12** – legal entity, jurisdiction, refund/cancellation terms, privacy contact & request channel, postal address, security contact.
3. **H2** – SMS opt-in / possession verification policy.
4. **H5** – whether failed AI requests consume quota.
5. **F18** – GitHub repository homepage setting (owner action).
6. **Tooling** – Python 3 interpreter (Python tests, J1 repro, H11); local Postgres (Docker image) to validate new migrations/RPCs and clean rebuild (H7).

## Phase 1 checkpoint (2026-10-02)

Decisions recorded from the user: **B2 = USD base currency with timestamped Yahoo FX**; local SQL validation in a
disposable Supabase Postgres container; Python tests in a `python:3.11-slim` container (the version CI pins).

| ID | Result | Implementation | Regression evidence |
|---|---|---|---|
| B1 | **fixed** | `032_atomic_holdings_save.sql` (`save_portfolio_holdings` RPC: validation, ownership + row lock, replace/merge, portfolio creation in one transaction); `lib/services/holdings-validation.ts`; `saveHoldings` returns the existing portfolio id + a non-success message on any failure; quote enrichment runs after commit | `supabase/tests/032_atomic_holdings_save.test.sql` (failed replace keeps holdings byte-for-byte, failed merge no partial apply, 10 malformed payloads, duplicates, idempotent retry, orphan-free create, cross-user ID substitution, anon denied); `tests/portfolio-save-holdings.test.ts` |
| B2 | **fixed (USD + FX policy)** | `lib/services/valuation.ts`, `lib/services/fx.ts` (Yahoo `XXXUSD=X`, minor units GBp/ZAc/ILA), `033_holding_valuation_contract.sql` (`fx_rate_to_usd`, `fx_as_of`, `previous_close`); positions without a rate are reported unavailable, never summed in local currency; snapshot currency is always USD | `tests/valuation.test.ts` (USD/CAD both orders, CAD-only, missing FX, cost basis); upgrade seed shows CAD rows are not assumed 1:1 |
| B3 | **fixed** | `lib/services/holding-pricing.ts` (whole-portfolio plan, last-known prices, fresh/stale/unavailable); `apply_holding_price_updates` RPC applies prices + allocations + sync stamp atomically; partial refresh → `status: partial`, `sync_status = stale`, `last_synced_at` unchanged | `tests/valuation.test.ts`, `tests/portfolio-price-sync.test.ts`, `033_holding_valuation_contract.test.sql` |
| B5 | **fixed (done with B2/B3)** | canonical aggregate previous-close return used by overview service, page loaders, snapshots | `tests/valuation.test.ts` (±20% → 0%, audit +25% case, unequal weights, missing/zero prior close) |
| J1 | **fixed (code); STG for workflow** | `034_news_enrichment_state.sql`; enrichment selects the durable backlog; enrich route backlog mode with `remaining`; analysis eligibility = no usable run or articles enriched since the last one; workflow steps run regardless of inserts and one failing portfolio no longer stops the rest; extraction also drains `--queued` | `tests/news-enrichment-retry.test.ts`, `tests/analysis-cron-route.test.ts`, `tests/enrich-cron-route.test.ts`, `034_news_enrichment_state.test.sql` (+ upgrade seed). Workflow verified only by YAML parse — needs a staging run |
| J3 | **fixed (shared with J1)** | AI failure → `retrying` with attempts/backoff (5 min doubling, 6 h cap, 5 attempts), terminal `failed` keeps fallback text but is never `succeeded`; analysis treats only `succeeded` as precomputed; compare-and-set on attempt count | `tests/news-enrichment-retry.test.ts`; audit `finance-jobs-repro` defect assertion now fails |
| J2 | **fixed** | every insight/feed/publish write checked; feed rows inserted in one statement; run published only if the status update affected that row; otherwise marked failed so the last good run stays visible | `tests/analysis-service.test.ts` (3 injected failures + count test); audit `finance-analysis-write-repro` defect assertion now fails |
| S1 | **fixed (code); STG for egress** | `lib/security/publisher-url.ts` canonical classification (IPv6 must be global unicast), default ports only, single-label hosts blocked; `lib/security/safe-fetch.ts` binds the check to the connection (connect-time lookup, no redirects followed, size/time caps); earnings company pages use it; Python `url_safety.public_network_only()` guards `getaddrinfo` during the single validated fetch, newspaper parses that HTML (no second request) | `tests/outbound-url-guard.test.ts` (IPv4/IPv6/mapped/NAT64/6to4/Teredo/fe90/decimal/octal/hex, rebinding, size, timeout, redirect, earnings repro); `workers/news_ingestion/tests/test_url_safety.py` |
| S3 | **already fixed** | next 16.3.6 (PR #9) | `npm audit --omit=dev` = 0 |
| F01 | **fixed (unit); STG browser** | `components/ui/modal-dialog.tsx`; below xl the selected story opens in an "Article details" dialog; floating Ask AI button | `tests/feed-view.test.tsx` (375/768/1024/1188) |
| F02 | **fixed (code); STG browser** | grid `minmax(0,1fr)` + rail stacks below xl; no `overflow-hidden`; `min-w-0` on content | not unit-testable (layout) — needs browser check |
| F03 | **partially fixed** | semantic `surface-input` / `surface-panel` tokens + `.theme-inverse` pair; fixed-dark product surfaces moved to tokens; light remaps skip inverse subtrees | contrast must be measured in a browser; the broader blanket-remap approach remains (D04) |
| F04 | **fixed (code); STG** | thesis actions map storage errors to safe text; missing table → feature unavailable, Save/Clear disabled | `tests/thesis-storage-errors.test.ts`. Migrations 030/031 must still be confirmed in production |
| F05 | **fixed** | `loadDeepLinkedStory` resolves news/feed item IDs with no recency window; pinned story survives feed refresh; explicit "no longer available" notice | `tests/feed-deeplink.test.ts`, `tests/feed-view.test.tsx` |
| F10 | **fixed** | hero total and "Today" both from the live valuation with an "As of" time; snapshot change shown separately as "Since <date>"; current point appended to history | covered by chart/pricing tests; visual check pending |
| F11 | **fixed** | neutral "Day change" label, signed amounts (U+2212), active card no longer uses `total×pct` / `Math.abs` | `tests/value-display.test.ts` |
| F19 | **fixed** | no `|| 17900`, no "2 mins ago"/"21 hours ago" fallbacks; 30-day move shown as unknown (never computed) | `tests/value-display.test.ts`, updated card tests |
| F13/F14 | **fixed early (shared dialog work)** | focus in/trap/Escape/inert/restore; drafts kept per conversation | `tests/modal-dialog.test.tsx`, `tests/feed-view.test.tsx` |
| F17 | partially fixed | "custody account" copy replaced on /portfolio/full; hero "Link a brokerage account" still pending | — |
| F22 | partially fixed | article-detail close button named | — |
| F16 | **blocked** | needs legal entity, contact/privacy channel, address, jurisdiction, refund terms | — |

Additional defect found and fixed: `holdings.unrealized_gain_percent` was `DECIMAL(8,4)` and overflowed for gains
above 9,999%, which would fail every price write for that holding (now `NUMERIC(14,4)` in 033).

Gate results on the Phase 1 tree: Vitest 113 files / 709 tests passed (baseline 105 / 575); typecheck pass; lint 0
errors / 20 warnings (identical set to baseline); build pass; SQL: clean rebuild of all 34 migrations + upgrade seeds +
3 SQL suites pass; Python 80/80 (baseline 73 + 7). `test_preflight` fails only when run from the working copy that
contains local untracked env files — it passes from a clean copy (test-isolation caveat, pre-existing).

## Decisions and Phase 2 progress (2026-10-02)

User decisions: **F16** operator = Ghaith Alali, contact/privacy channel = ghaith.alali1996@gmail.com, no refunds
and cancel any time (mailing address and governing jurisdiction still not provided). **H5** failed AI requests
must not count against quota.

| ID | Result | Implementation | Evidence | Commit |
|---|---|---|---|---|
| F16 | **partially fixed** | operator, contact, privacy contact/channel, refund notice filled; Last Updated → Oct 2, 2026 | `tests/legal-placeholders.test.ts` fails on any new placeholder; pending: `LEGAL_MAILING_ADDRESS`, `LEGAL_GOVERNING_JURISDICTION` | 7ed06ef / 13841a9 |
| H5 | **fixed (TS); SQL unvalidated** | `035_ai_quota_release.sql` `release_ai_quota` refunds the exact charged bucket; routes keep the unit only when an answer is delivered; burst limit still counts. Also revoked EXECUTE on all quota/rate-limit functions from anon/authenticated (they accept arbitrary user ids) | route tests (refund on 503, kept on success); `supabase/tests/035_ai_quota_release.test.sql` written — **not yet run (Docker down)** | 13841a9 |
| B6 | **fixed** | side column required for transaction mode (parser + manual mapper); skipped rows reported with reasons; non-empty → empty is an explicit error that opens the mapping step | `tests/csv-parser-b6.test.ts` (audit repro case now imports) | 933fb79 |
| J4 | **fixed** | dedupe key `portfolio:news:<newsItemId>`; articles already alerted under any key are skipped (covers legacy keys, no transition duplicates) | `tests/smart-alerts-dedupe.test.ts` (unique-enforcing fake; read state preserved) | 933fb79 |
| J6 | **fixed** | cached report kept on failure/no-result; only `last_checked_at`/`error` written; no null-writing fallback on persistence errors; `failed`/`stale` stats; route 502 when every lookup failed; tracked-symbol scan paginated (H1) | `tests/earnings-reports-service.test.ts` (audit scenario + recovery), cron route test | 933fb79 |
| B7 | **fixed (code); STG Stripe sandbox** | different-subscription events reconcile via `subscriptions.list` + deterministic `selectAuthoritativeSubscription`; Stripe-unreachable fallback never downgrades entitled access | `tests/billing-subscription-reconcile.test.ts` (both orders, duplicates, outage) | 8ab54cf |
| B4 | todo — needs Docker (atomic position RPC + ledger) | | | |
| J5 | todo — needs Docker (atomic delivery claim) | | | |

Gate after 8ab54cf: Vitest 117 files / 732 tests; typecheck pass; lint 0 errors / 20 warnings (baseline set).
Caveat: under heavy machine load a few UI tests can exceed Vitest's 5 s default timeout and pass on rerun.
