# Pulsefolio audit remediation report

Branch `fix/fixing-frontand-backend` (from `main`), final commit `335b31e`, 2026-10-02.
Nothing was pushed, merged or opened as a PR. Unique ledger constraints are consolidated below.

Status vocabulary: **fixed** (code + regression evidence), **fixed – staging check open** (code verified locally;
an external system must still confirm), **partially fixed**, **already fixed** (before this work),
**blocked** (needs an owner action or decision), **recommendation** (design item; not a defect),
**investigated – decision needed**.

## Product decisions recorded

| Topic | Decision (from the user) |
|---|---|
| B2 base currency | USD base; Yahoo FX rate stored with each quote; positions without a rate are unavailable, never summed in local currency |
| F16 legal | Operator Ghaith Alali; contact/privacy channel ghaith.alali1996@gmail.com; no refunds, cancel any time; H4N 1P8, Quebec; Quebec law |
| H5 AI quota | Failed AI requests do not count against quota |
| H2 SMS | Users must prove possession of the number (one-time code) before SMS digests |
| H12 security contact | ghaith.alali1996@gmail.com |

## Backend, security and jobs

| ID | Status | Implementation | Commit | Regression coverage | Manual / staging verification | Remaining caveat |
|---|---|---|---|---|---|---|
| B1 | fixed | `save_portfolio_holdings` RPC (032): validation, ownership, replace/merge in one transaction | 7ed06ef | `032_atomic_holdings_save.test.sql`, `tests/portfolio-save-holdings.test.ts` | apply 032 before deploy | — |
| B2 | fixed | USD valuation contract (`lib/services/valuation.ts`, `fx.ts`, migration 033) | 7ed06ef | `tests/valuation.test.ts`, 033 SQL test + upgrade seed | — | FX moves are not attributed separately in day change (documented) |
| B3 | fixed | whole-portfolio pricing plan, fresh/stale/unavailable, atomic `apply_holding_price_updates` | 7ed06ef | `tests/valuation.test.ts`, `tests/portfolio-price-sync.test.ts`, 033 SQL test | — | — |
| B4 | fixed | `holding_transactions` ledger + `apply_holding_transaction` (036), operation-id idempotency | 92625b4 | 036 SQL test races two real sessions (dblink); `tests/portfolio-position-changes.test.ts` | apply 036 | — |
| B5 | fixed | one aggregate previous-close day return for overview, loaders, snapshots | 7ed06ef | `tests/valuation.test.ts` | — | — |
| B6 | fixed | transaction mode needs a side column; skipped rows reported; non-empty→empty is an error | 933fb79 | `tests/csv-parser-b6.test.ts` | — | — |
| B7 | fixed – staging check open | different-subscription events reconciled from Stripe; outages never downgrade entitled access | 8ab54cf | `tests/billing-subscription-reconcile.test.ts` | Stripe sandbox run of both event orders | — |
| S1 | fixed – staging check open | canonical IP classification, connection-bound DNS check, no redirects, size/time caps (TS + Python) | 7ed06ef | `tests/outbound-url-guard.test.ts`, `test_url_safety.py` | confirm deploy egress controls | — |
| S2 | fixed | admin email allowlist trusts only `email_confirmed_at` | ee9882b | `tests/admin-verification-s2.test.ts` | confirm each OAuth provider sets `email_confirmed_at` | — |
| S3 | already fixed | next 16.3.6 (PR #9) | 821779b | CI `npm audit --omit=dev --audit-level=high` | — | `eslint-config-next` is ^16.2.6 vs next ^16.3.6 (dev-only alignment not done) |
| J1 | fixed – staging check open | durable enrichment backlog (034); workflow steps run regardless of inserts; one failing portfolio no longer stops the rest | 7ed06ef | `tests/news-enrichment-retry.test.ts`, cron/enrich route tests, 034 SQL test | one real GitHub Actions run against staging | — |
| J2 | fixed | every analysis write checked; run published only if its row updated | 7ed06ef | `tests/analysis-service.test.ts` | — | — |
| J3 | fixed | retrying/failed enrichment states with backoff; only `succeeded` is precomputed | 7ed06ef | `tests/news-enrichment-retry.test.ts` | — | — |
| J4 | fixed | alert dedupe by `portfolio:news:<id>`; legacy keys skipped | 933fb79 | `tests/smart-alerts-dedupe.test.ts` | — | existing duplicate unread alerts not backfilled (needs approval) |
| J5 | fixed | `claim_notification_delivery` / token-checked completion (037); Twilio 5xx = uncertain, never replayed | ea0d36d | 037 SQL test (two sessions), `tests/digest-delivery-claims.test.ts`, `tests/twilio-response-classification.test.ts` | Twilio test credentials only | — |
| J6 | fixed | earnings last-known-good kept on failure; 502 when every lookup fails | 933fb79 | `tests/earnings-reports-service.test.ts` | — | — |

## Hardening

| ID | Status | Implementation | Commit | Regression coverage | Remaining caveat |
|---|---|---|---|---|---|
| H1 | fixed | `fetchAllRows` (offset advances by rows returned) for digest, alerts, analysis cron, snapshots, earnings; Python `pagination.py` | 535a21f | `tests/pagination-h1.test.ts`, `test_pagination.py` (run in Docker) | — |
| H2 | fixed | migration 038: hashed one-time codes (10 min, 5 guesses, 60 s cooldown, 5 sends/h, all atomic in SQL); verified numbers in a server-only table; digest texts only the saved number that equals the verified one; settings UI to send/confirm | e9712a3 | `038_sms_phone_verification.test.sql`, `tests/phone-verification-h2.test.ts`, `tests/notification-settings-panel-h2.test.tsx` | **existing SMS subscribers stop receiving SMS until they verify** (intended); no CAPTCHA on code requests (per-user caps only) |
| H3 | fixed | `AbortSignal.timeout` on every provider call; legacy copilots no longer return stub text | 8e2573f | `tests/ai-request-deadline.test.ts` | — |
| H4 | fixed | runtime chat body validation (400); quota infrastructure errors 503 | ef11e81 | `tests/chat-request-validation.test.ts` | — |
| H5 | fixed | `release_ai_quota` (035) refunds the charged bucket on failure; quota RPCs service-role only | 13841a9 | route tests, `035_ai_quota_release.test.sql` | burst limit still counts failed requests (by design) |
| H6 | fixed – first run open | `.github/workflows/ci.yml`: typecheck, lint, tests, build, npm audit, Python tests (locked deps), migration validation | 535a21f, 5a34a62 | — | first PR run is the evidence; making it a required check is a repo setting |
| H7 | fixed – staging check open | deploy table 032–038, duplicate-prefix (008/019/024) guidance, no renames; `scripts/db/validate-migrations.sh` | 79ba524 | validator: 38 migrations + 7 SQL suites | compare `supabase_migrations` in each environment |
| H8 | fixed | `lib/services/job-health.ts` + admin `GET /api/admin/job-health` from durable state; failed health query ⇒ degraded | 79ba524 | `tests/job-health.test.ts` | billing reconciliation drift and per-portfolio analysis age not yet in the report |
| H9 | fixed | holdings table, sector cards, health concentration and chart fallback all read `valueHoldings` (USD, same exclusions); prices shown in their own currency | 7bfa468 | `tests/valuation-consistency-h9.test.tsx` (fails on pre-fix code), `tests/portfolio-health.test.ts` | — |
| H10 | fixed | cache capped at 500 entries (LRU), in-flight misses shared, failures not cached | 320dac1 | `tests/cache-h10.test.ts` | per-instance cache (not shared across serverless instances) |
| H11 | fixed | hash-pinned `requirements.lock` (pip-tools, Py 3.11/Linux) used by CI and both news workflows | 5a34a62 | 70/70 worker tests on a clean `--require-hashes` install; pip-audit clean | lock must be regenerated when `requirements.txt` changes (documented) |
| H12 | fixed | real `SECURITY.md`; `server-only` on service client and env module; boundary test | 1d5f0ed, f4eed85 | `tests/security-policy-h12.test.ts`, `tests/server-boundaries-h12.test.ts`; build proves no client import | — |

## Frontend

| ID | Status | Implementation | Commit | Regression coverage | Manual / browser | Remaining caveat |
|---|---|---|---|---|---|---|
| F01 | fixed – browser check open | article details dialog below xl; floating Ask AI | 7ed06ef | `tests/feed-view.test.tsx` (375/768/1024/1188) | authenticated feed not browsable locally (no env) | — |
| F02 | fixed – browser check open | `minmax(0,1fr)` grid, rail stacks below xl, `min-w-0` | 7ed06ef | layout only | needs authenticated browser check | — |
| F03 | partially fixed | semantic surface tokens + `.theme-inverse`; D04 cascade-layer fix restores utility colours/borders | 7ed06ef, 2d04b86 | `tests/css-cascade-layers-d04.test.ts` | authenticated pages not measured | full measured contrast pass of app pages still owed |
| F04 | fixed – staging check open | thesis storage errors mapped to safe text; missing table ⇒ feature unavailable | 7ed06ef | `tests/thesis-storage-errors.test.ts` | confirm migrations 030/031 in production | — |
| F05 | fixed | deep-linked story resolved without recency window; pinned across refresh | 7ed06ef | `tests/feed-deeplink.test.ts` | — | — |
| F06 | fixed | `/feed?story=<id>` links | 5ce5e70 | `tests/feed-phase3.test.tsx` | — | — |
| F07 | fixed | single `FEED_PAGE_SIZE`; client follows server page size | 5ce5e70 | `tests/feed-phase3.test.tsx`, `tests/feed-route.test.ts` | — | — |
| F08 | fixed | filtered-empty vs source-empty; Clear filters | 5ce5e70 | `tests/feed-phase3.test.tsx` | — | — |
| F09 | fixed | all ticker pills | 5ce5e70 | `tests/feed-phase3.test.tsx` | — | — |
| F10 | fixed | hero/Today from live valuation with As-of; snapshot change shown separately | 7ed06ef | chart/pricing tests | visual check open | — |
| F11 | fixed | neutral Day change label, signed amounts | 7ed06ef | `tests/value-display.test.ts` | — | — |
| F12 | fixed | collapsed nav `inert` | d687f08 | `tests/app-shell-a11y.test.tsx` | — | — |
| F13 | fixed | `ModalDialog` focus trap/Escape/restore | 7ed06ef | `tests/modal-dialog.test.tsx` | — | — |
| F14 | fixed | drafts kept per conversation | 7ed06ef | `tests/feed-view.test.tsx` | — | — |
| F15 | fixed | `lib/time/format.ts`: one relative formatter, Eastern absolute times with zone label (also chart "As of", 7bfa468) | de1d73e | `tests/time-format-f15.test.ts` | — | — |
| F16 | fixed | legal constants complete; legal test aligned | 0a96266, 335b31e | `tests/legal-placeholders.test.ts` | — | mailing address is a postal code + province only (as provided) |
| F17 | fixed | hero, features, workflow, onboarding note, sample holdings: CSV/manual, no live broker claims; onboarding no longer claims local parsing | fee843a | `tests/public-claims-f17-f23.test.ts` (regex proven against old copy) | landing verified in browser | named publishers in `sourceTags` (Reuters, NYT, Fed) arrive via aggregators — wording not changed |
| F18 | blocked | repository About/homepage must point to https://pulsefolio.app | — | — | owner action in GitHub settings | — |
| F19 | fixed | no 17,900 / invented recency fallbacks | 7ed06ef | `tests/value-display.test.ts` | — | — |
| F20 | fixed | named icon links | d687f08 | `tests/app-shell-a11y.test.tsx` | — | — |
| F21 | fixed | account menu in mobile header | d687f08 | `tests/app-shell-a11y.test.tsx` | — | — |
| F22 | fixed | add-position labels/errors/focus; article close, watchlist search close, community back, saved search all named | 7ed06ef, d687f08 | `tests/add-position-form-a11y.test.tsx` | — | — |
| F23 | fixed | "Most exposed theme" and story-chat weights derived from sample allocations (now 49%) | fee843a | `tests/public-claims-f17-f23.test.ts` | verified in browser | — |

## Design recommendations

| ID | Status | What was done / why not | Commit | Coverage |
|---|---|---|---|---|
| D01 | fixed (approved 2026-10-04) | three tall summary cards → one compact strip (coverage, last analysis, live value with refresh); filter bar sticky on wide screens | e2d1e3b | `tests/design-recommendations-d01-d12.test.tsx` |
| D02 | fixed (approved) | card shows the score once and one summary sentence with a repeated headline prefix removed; score drivers stay in the story detail panel | e2d1e3b | `tests/design-recommendations-d01-d12.test.tsx`, `tests/article-score-explanation.test.tsx` |
| D03 | addressed by F09 | full ticker pills | 5ce5e70 | `tests/feed-phase3.test.tsx` |
| D04 | partially addressed | measured pass found an objective defect: unlayered `a`/`*`/`img` rules overrode utilities (primary link-buttons ≈2.1:1 in dark theme, border utilities erased) — fixed; public pages re-measured | 2d04b86 | `tests/css-cascade-layers-d04.test.ts` |
| D05 | fixed | hash-derived "Most exposed theme" bar and label-parsed "Analysis pulse" bar removed | cf9dfce | `tests/design-trust-d05-d10.test.ts` |
| D06 | fixed (approved) | Home = summary + "Do next" (≤3 timely actions) + top 3 stories; health factors, readiness, risk, earnings, freshness, activity, alerts, digest in a collapsed "More portfolio detail"; duplicate changelog/timeline shown once; Community moved to its own protected `/community` route and nav item | e2d1e3b | `tests/design-recommendations-d01-d12.test.tsx`, `tests/today-dashboard.test.tsx` |
| D07 | partially addressed | As-of times and zone labels (F10/F15/B3); watchlist row vs detail quote still use separate provider snapshots | de1d73e | — |
| D08 | recommendation (external) | Google OAuth consent branding / custom auth domain — Supabase/Google configuration | — | — |
| D09 | fixed (approved) | plan cards describe models, limits and what is included instead of vendors; burst limit, failed-request policy, billing currency/interval from Stripe, trial conversion and refund notice stated; CTAs aligned on one baseline | e2d1e3b | `tests/design-recommendations-d01-d12.test.tsx` |
| D10 | fixed | testimonials presented as "Illustrative scenario" without invented names; build-note copy removed; site description no longer "frontend MVP" | cf9dfce, e42e65f | `tests/design-trust-d05-d10.test.ts` |
| D11 | fixed | footer: Pricing, Sign in, Terms, Privacy, Contact | e42e65f | `tests/design-navigation-d11-d13-d14.test.tsx` |
| D12 | fixed (approved) | `planCardState`: current plan, "Included in your plan", "Included in your account access" (no implementation wording), portal for upgrades, checkout only when it adds access | e2d1e3b | `tests/design-recommendations-d01-d12.test.tsx` |
| D13 | fixed | comments view shows the original post and a visible "Back to community" | e42e65f | `tests/design-navigation-d11-d13-d14.test.tsx` |
| D14 | fixed | `%s - Pulsefolio` template; every route has a title (verified in browser for public pages) | e42e65f | `tests/design-navigation-d11-d13-d14.test.tsx` |
| D15 | investigated – decision needed | see below | — | — |

### D15 investigation (no thresholds changed)

- `lib/services/analysis.ts` `directMatchRelevance`: any article whose extracted tags/impacts contain a held ticker gets
  a **fixed** 96/92/88/80 regardless of content, so "96% match" means "ticker named and an impact was extracted",
  not relevance.
- Impact is derived from that number (`≥ 80 ⇒ High`), so every direct match is "High impact" even when the
  article's own ticker effect is `neutral`. `why_it_matters` for direct matches is a template.
- `lib/notifications/smart-alerts.ts` `isCriticalNews` matches substrings such as "risk"/"pressure" anywhere in
  headline + AI text, and severity is `high` when relevance ≥ 85 — i.e. every direct match.

Options (need a product decision): (a) derive impact from the article's effect and magnitude, keep relevance as
match confidence; (b) relabel the score as "Direct mention" instead of a percentage; (c) require a non-neutral effect
and word-boundary matching for critical alerts. A labelled sample of real articles is recommended before choosing.

## Final gates (committed tree `335b31e`, clean checkout)

| Gate | Result |
|---|---|
| Vitest | **140 files / 867 tests passed** after e2d1e3b (139 / 854 at 335b31e) (working copy with another session's local test deletions: 120 / 692 passed) |
| Typecheck | pass |
| Lint | 0 errors, 20 warnings (identical to the pre-remediation baseline set) |
| Build (`next build`) | pass, with **no** environment file present |
| Dependency scan | `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities; `pip-audit` on `requirements.lock`: no known vulnerabilities |
| Python worker | 70/70 on a clean `pip install --require-hashes -r requirements.lock` (Python 3.11, Docker) |
| Migration validation | clean rebuild of 38 migrations + upgrade seeds + 7 SQL suites on Supabase Postgres 17 (Docker) |
| Browser matrix | public pages `/`, `/demo`, `/terms`, `/privacy` at 1280 px and 375 px, dark and light: titles correct, no horizontal overflow, footer/claims/demo math verified, primary CTA contrast fixed. `/pricing`, `/login` and all authenticated pages **not rendered**: the workspace has no `.env` (Supabase URL/key), and credentials were not invented |

## Unresolved product decisions

1. D15 relevance/impact/critical-alert semantics (options above).
2. ~~D01/D02/D06/D09/D12 design and pricing copy~~ — approved and implemented in e2d1e3b.
3. Whether to backfill duplicate unread alerts created before J4 (not done without approval).
4. Whether code requests (H2) should also require Turnstile in addition to per-user caps.

## Provenance and constraints retained from the ledger

This report describes the October 2 remediation and October 4 approved design work, not validation of the current refactor checkout.
The initial remediation baseline was `0334ee3` (audit `c466f0b`); it had 575 passing Vitest cases and reproduced the portfolio/security/job defects.
The later audit snapshot `11e4162` and final planning snapshot `88d8e1` are separate states; no earlier count proves either checkout.
The final gates above mix explicitly identified `335b31e`, `e2d1e3b` and concurrent working-copy results; they are historical evidence only.
Regression filenames in these historical tables may have since been removed or consolidated; consult TEST_AUDIT and the current tree.

- Atomic holdings save locks ownership and commits replace/merge together; quote enrichment happens after the save commit.
- USD FX conversion handles minor units (GBp/ZAc/ILA); missing FX is unavailable. Wider NUMERIC in 033 prevents very large gains from aborting price writes.
- A partial refresh remains stale and leaves the successful-sync timestamp unchanged; last-known-good prices are not a complete fresh quote set.
- Position operation IDs denote identical retries only; migration 039 additionally binds them to the requested holding/add price.
- Enrichment retries use bounded backoff and compare-and-set attempt ownership; fallback text on terminal failure is never treated as succeeded enrichment.
- Publish succeeds only when the run status update affected its row; prior successful analysis remains visible on failure.
- Delivery claims use attempt tokens: stale email can be reclaimed; stale/ambiguous SMS is uncertain and is never automatically replayed.
- Twilio 5xx/ambiguous failures are uncertain; definite 4xx failures remain retryable within the claim attempt cap. Mocks do not establish real provider delivery.
- Failed AI answers refund the exact charged quota bucket, including reset boundaries, with a zero floor; burst counts remain by design.
- Runtime body validation is a deliberate 400; quota infrastructure failure is 503. Trusted admin email confirmation excludes user-writable metadata.
- SSRF defenses bind DNS checks to connection and cap time/size; Python parses already-fetched HTML, avoiding an unchecked second fetch.
- Per-user pagination must advance by actual rows returned despite PostgREST caps. Hash-pinned Python dependencies are the supported reproducible environment.

### Current-code qualifications (source review, October 4, 2026)

The historical H2 row describes the original 038 deployment. The current code retains possession verification and adds 040:
definitely-unsent codes release their send/cooldown; uncertain delivery keeps the pending code so a possibly received code stays valid.
Current implementation also uses 039 for transaction retry identity and 041 to exclude pre-versioned valuation snapshots.
These source observations do not prove the migrations were applied to any environment or that a real SMS was sent.
Legal values remain canonical in `lib/legal/constants.ts` and the public legal pages; SECURITY.md remains the reporting policy.
The provided mailing address is still a postal code/province, as recorded; this consolidation does not decide new legal obligations.
D15, legacy duplicate-alert backfill and CAPTCHA on SMS code requests remain undecided; approved D01/D02/D06/D09/D12 retain their dated provenance above.

## Production / staging verification still required

The operational acceptance criteria are consolidated in [README.md](../../README.md#staging-checks-still-requiring-evidence).
Follow [supabase/README.md](../../supabase/README.md) for deployment dependencies through 041, ledger collisions and real isolation/RPC checks.
OAuth, deployed egress, signed-in/browser contrast, scheduled GitHub runs, Stripe sandbox ordering and authorized Twilio verification remain external checks.
CI required-check settings and the GitHub homepage are owner-controlled configuration. No check is closed by this document edit.
