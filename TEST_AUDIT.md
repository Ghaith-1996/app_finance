# Test signal audit

Audited on October 2, 2026 after the request to remove unit tests without distinct regression value. Three parallel subagents reviewed UI, auth/AI/billing, and background pipelines; the coordinating agent reviewed portfolio calculations, shared utilities, and Python workers.

## Coverage evidence and decision rule

The checkout has no browser E2E suite, E2E runner/configuration, E2E package script, or E2E CI job. The existing AGENTS.md also documents this gap. Provider smoke scripts do not exercise a complete user workflow. No external E2E location was supplied during this audit, so none of these deletions claims an E2E replacement.

Every test in the original 117 Vitest files and eight Python test modules was reviewed. Removed cases pin constants, wording, static markup, source text, mock return values, or duplicate behavior already exercised by a retained case. Cases remain when they demonstrate a concrete application failure, adversarial input, state transition, data calculation, or provider contract with no demonstrated E2E equivalent.

Mocks are not themselves a deletion criterion. A mocked RPC can verify validation, quota accounting, or truthful failure reporting in application code; it cannot prove database locking, rollback, RLS, or SQL atomicity. Existing executable SQL integration tests and upgrade fixtures were preserved and were not run by this cleanup.

One explicit duplicate coverage mapping: publisher-url.test.ts was deleted because outbound-url-guard.test.ts covers the same scheme, credential, literal-IP and DNS checks, plus mixed DNS answers, canonical IP encodings, connection-time rebinding, unsafe redirects, timeouts, and response limits.

## Result

| Suite present at intake | Before | Retained | Removed |
|---|---:|---:|---:|
| Vitest files | 117 | 98 | 19 |
| Vitest cases | 732 | 570 | 162 |
| Python test modules | 8 | 8 | 0 |
| Python cases | 80 | 68 | 12 |

Removed 174 cases in total. Some retained cases also shed constant/copy assertions without changing their case count.

The baseline Vitest run passed 731 of 732 cases. SaveArticleButton matched its label while still disabled by its initial load; the test now waits for the button to be enabled before clicking. Its save interaction was retained.

Concurrent work added 13 cases in digest-delivery-claims.test.ts, portfolio-position-changes.test.ts, and twilio-response-classification.test.ts, and changed notification services and the shared Supabase helper. Those changes were preserved. The final current-tree run therefore includes 101 Vitest files and 583 cases, rather than only the original 98 retained files/570 cases.

## Verification

- Final Vitest: 583/583 pass, zero failures, using two workers.
- Python: 68/68 pass, zero failures or skips. The bundled Python needed requests installed into a temporary folder outside the Git checkout.
- TypeScript: npm run typecheck passes.
- ESLint: npm run lint passes with existing warnings and zero errors.
- git diff --check passes.

The first verification run overlapped unfinished notification service/helper edits and an import timeout while lint and typecheck ran concurrently. Verification was repeated against the completed current tree with fewer Vitest workers; no failing test was removed to make verification pass.

Repeat from the app root:

```powershell
npm run test -- --maxWorkers=2
npm run typecheck
npm run lint
python -B -m unittest discover -s workers/news_ingestion/tests -v
git diff --check
```

For the exact local Python runtime used here:

```powershell
$env:PYTHONPATH = 'C:\Users\ghait\Downloads\pulsefolio\unit-cleanup-python-deps'
& 'C:\Users\ghait\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -B -m unittest discover -s workers/news_ingestion/tests -v
```

The restricted shell could not read the package installed by the dependency download; that Python verification was run with approved access to the same temporary package directory.

## Vitest decisions

Filenames are relative to tests/. Counts compare the intake suite with the retained suite; renamed cases retain their count.

| File | Cases before → after | Decision | Concrete reason |
|---|---:|---|---|
| active-portfolio-value-card.test.tsx | 4 → 3 | Trim | Remove cached-fixture smoke; keep price refresh and preservation on quote/save failure. |
| admin-access.test.ts | 3 → 3 | Keep | Keep ID allowlisting and verified-email enforcement. |
| ai-access.test.ts | 8 → 7 | Trim | Remove duplicate monthly-exhaustion example; keep quota denial, burst limits, admin quotas, and entitlement changes. |
| ai-chat-errors.test.ts | 12 → 8 | Trim | Remove trivial success/identity and duplicate status examples; keep empty output and overlapping error precedence. |
| ai-prompts.test.ts | 12 → 3 | Trim | Remove wording/schema checks; keep history/thesis truncation and supplied thesis context. |
| analysis-constants.test.ts | 1 → 0 | Delete | Delete exported numeric constant pinning. |
| analysis-cron-route.test.ts | 16 → 15 | Trim | Remove mocked eligible-run echo; keep auth, cooldown, durable-work eligibility, pagination, and failures. |
| analysis-run-trigger.test.tsx | 4 → 0 | Delete | Delete static progress/status/copy assertions. |
| analysis-service.test.ts | 16 → 13 | Trim | Remove duplicate successful counting and ticker examples; keep persistence failures, concurrency, heartbeat, and match gating. |
| article-chat-grant.test.ts | 10 → 9 | Trim | Remove redundant same-story GET success; keep cookie reuse, scope sharing, challenge rejection, and provider retry. |
| article-chat-panel-grant.test.tsx | 6 → 5 | Trim | Remove redundant initial widget presence; keep grant transitions, recovery, and scope changes. |
| article-chat-panel.test.tsx | 10 → 4 | Trim | Remove duplicate callbacks/sends covered by retained FeedView workflows; keep tier selection, pending state, story reset, and recovery. |
| article-chat-route.test.ts | 19 → 18 | Trim | Remove duplicate default-provider success; keep routing, authorization, quotas/refunds, persistence failures, and history order. |
| article-chat-token-budget.test.ts | 5 → 5 | Trim | Remove constant comparisons; keep one-copy question/history serialization across provider request formats. |
| article-score-explanation.test.tsx | 3 → 0 | Delete | Delete static supplied explanation and label rendering. |
| auth-callback-route.test.ts | 5 → 4 | Trim | Remove basic redirect duplicated by query-preserving redirect; keep profile/terms gates and session exchange failure. |
| billing-store.test.ts | 5 → 4 | Trim | Remove timestamp-type-only assertion; keep event claiming, stale/failed reclaim, and competing-worker exclusion. |
| billing-stripe-base-url.test.ts | 2 → 2 | Keep | Keep canonical origin precedence and rejection of untrusted origins. |
| billing-subscription-reconcile.test.ts | 5 → 5 | Keep | Keep late/out-of-order events, outage preservation, and authoritative subscription selection. |
| billing-subscriptions.test.ts | 4 → 4 | Keep | Keep Stripe-ID redaction, server-only IDs, admin access, and expired paid access downgrade. |
| cache.test.ts | 5 → 3 | Trim | Remove bare get/set fixtures; keep expiry and fetch-through behavior that prevents repeated provider work. |
| candidate-source-registration.test.ts | 3 → 0 | Delete | Delete static source membership and source-text assertions. |
| chat-turnstile-grant.test.ts | 16 → 12 | Trim | Remove duplicated valid roundtrips/parser examples and prefix pinning; keep tampering, expiry, user/portfolio scope, and secure cookies. |
| community-actions.test.ts | 2 → 2 | Keep | Keep rejection before write and valid-symbol control for community stock hashtags. |
| community-post-card.test.tsx | 1 → 1 | Keep | Keep unsafe avatar URL rejection. |
| community-types.test.ts | 3 → 3 | Keep | Keep ticker/market hashtag separation and cashtag parsing. |
| complete-profile-page.test.ts | 2 → 2 | Keep | Keep external redirect rejection and internal redirect control. |
| cron-route.test.ts | 6 → 4 | Trim | Remove response echo and fixed GET response; keep auth, schema checks, ID normalization, and empty enrichment gate. |
| cron-v2-route.test.ts | 14 → 10 | Trim | Remove response/config/log echoes and fixed GET response; keep auth, bounds, schema, ID normalization, and enrichment gate. |
| csv-parser-b6.test.ts | 6 → 5 | Trim | Remove empty-normalizer fixture; keep dated-position/transaction detection, share/cost calculations, and unusable-row reporting. |
| daily-digest-builder.test.ts | 6 → 6 | Keep | Keep window boundaries, ranking/cap/ties, impact aggregation, fallback, and unsafe URL handling. |
| daily-digest-cron-route.test.ts | 7 → 7 | Keep | Keep DST scheduling, duplicate delivery suppression, origins, auth, and uncertain stale SMS. |
| delivery-adapters.test.ts | 6 → 6 | Keep | Keep payload/link encoding, HTML escaping, contacts, and definite versus uncertain delivery outcomes. |
| digest-page.test.tsx | 2 → 1 | Trim | Remove snapshot/link smoke; keep unsafe source URL rejection. |
| earnings-reports-cron-route.test.ts | 5 → 4 | Trim | Remove fixed GET response; keep auth and provider/storage/partial-error classification. |
| earnings-reports-service.test.ts | 18 → 18 | Keep | Keep symbol normalization, discovery/filing selection, SSRF safety, idempotency, and last-known-good preservation. |
| enrich-cron-route.test.ts | 10 → 9 | Trim | Remove batch delegation echo; keep auth, input bounds, backlog clamping, and provider/storage failures. |
| env-validation.test.ts | 9 → 5 | Trim | Remove simple getters and generic valid-config fixtures; keep missing/placeholder provider credentials and incorrect Azure host rejection. |
| external-url.test.ts | 2 → 2 | Keep | Keep accepted scheme controls and dangerous/malformed URL rejection. |
| extraction-uuid-validation.test.ts | 5 → 4 | Trim | Remove empty-input no-throw fixture; keep UUID validation, injection rejection, and executable fallback failures. |
| feed-deeplink.test.ts | 4 → 4 | Keep | Keep old-story resolution, feed-ID indirection, deleted stories, and malformed IDs. |
| feed-open-route.test.ts | 3 → 2 | Trim | Remove mocked RPC count echo; keep unauthenticated and missing-ID rejection. |
| feed-page-counts.test.ts | 3 → 0 | Delete | Delete query-shaped fixed-count mocks that do not execute counting/filtering semantics. |
| feed-route.test.ts | 16 → 12 | Trim | Remove field passthrough/default fixtures; keep filtering, ordering/ties, pagination, legacy nulls, and thesis/watchlist matching. |
| feed-view.test.tsx | 38 → 23 | Trim | Remove copy/presence smoke, duplicate happy paths, and equivalent viewport rows; keep deep links, recovery, pagination, realtime dedupe, draft preservation, and story-switch guards. |
| finnhub-errors.test.ts | 10 → 10 | Keep | Keep HTTP/payload/timeout classifications and equity filtering/quote normalization. |
| finnhub-refresh.test.ts | 3 → 3 | Keep | Keep provider tag normalization, duplicate merging, and missing-key skip. |
| handle-hardening.test.ts | 4 → 3 | Trim | Remove valid-handle examples duplicated by profile normalization; keep reserved and unusable handle rejection. |
| ingest-detail.test.ts | 12 → 9 | Trim | Remove status/text echoes; keep failure/duplicate/partial classification and multi-source aggregation. |
| ingest-route.test.ts | 3 → 3 | Keep | Keep admin authorization controls. |
| investment-thesis-matching.test.ts | 2 → 2 | Keep | Keep saved-risk detection and neutral ticker-only fallback. |
| investment-thesis-panel.test.tsx | 2 → 2 | Keep | Keep editing/save payload and separate thesis deletion. |
| legal-placeholders.test.ts | 2 → 0 | Delete | Delete assertions pinning constants and the current list of known unresolved placeholders. |
| logger.test.ts | 3 → 0 | Delete | Delete console method, level marker, and message-format pinning. |
| login-language-hidden.test.tsx | 2 → 0 | Delete | Delete selector absence and static legal-link checks. |
| middleware.test.ts | 9 → 8 | Trim | Remove literal matcher-string pinning; keep route protection, profile/terms gates, query handling, and onboarding-loop exemption. |
| mistral-provider.test.ts | 3 → 2 | Trim | Remove stub-summary/insights fixture echo; keep missing-key failure and structured enrichment/ticker normalization. |
| modal-dialog.test.tsx | 1 → 1 | Keep | Keep focus trap, Escape, background inertness, and focus restoration. |
| news-enrichment-retry.test.ts | 6 → 6 | Keep | Keep retry/backoff, backlog recovery, exhaustion, idempotency, and attempt ownership. |
| news-health-route.test.ts | 3 → 3 | Keep | Keep admin authorization controls. |
| notification-preferences.test.ts | 6 → 4 | Trim | Remove separate channel saves duplicated by combined save; keep opt-out defaults, combined fields, invalid phone, and threshold rejection. |
| notification-settings-panel.test.tsx | 2 → 1 | Trim | Remove fixed timing/control copy; keep user-selected channels, phone, and decimal threshold submission. |
| onboarding-page.test.tsx | 2 → 1 | Trim | Remove mocked child-render smoke; keep existing-portfolio redirect. |
| openrouter-provider.test.ts | 2 → 2 | Keep | Keep missing-key failure in the separately implemented article and portfolio chat paths. |
| outbound-url-guard.test.ts | 63 → 63 | Keep | Keep canonical IP classification, unsafe destinations, mixed DNS answers, connection-time rebinding, redirect safety, timeout, and size limits. |
| portfolio-copilot-grant.test.ts | 6 → 6 | Keep | Keep grants, portfolio scope, challenge rejection, and provider failure/retry. |
| portfolio-copilot-panel-grant.test.tsx | 4 → 4 | Keep | Keep challenge-token transmission, verification/failure recovery, and scope reset. |
| portfolio-copilot-route.test.ts | 10 → 10 | Trim | Remove static empty-watchlist copy; keep server-derived watchlist isolation, routing, quotas, and billing denials. |
| portfolio-copilot-token-budget.test.ts | 5 → 5 | Trim | Remove constant comparisons; keep one-copy prior-history serialization across five providers. |
| portfolio-csv-import-flow.test.tsx | 1 → 1 | Keep | Keep merge-mode submission to guard against destructive replacement. |
| portfolio-health.test.ts | 4 → 4 | Keep | Keep market-value precedence and diversified/concentrated/stale portfolio risk classification. |
| portfolio-holdings-table.test.tsx | 3 → 1 | Trim | Remove static earnings actions/labels; keep selected holding's actual price, signed daily change, and value. |
| portfolio-match-parser.test.ts | 4 → 4 | Keep | Keep malformed/empty fail-closed handling, bounded numeric scores, held-symbol filtering, and reason deduplication. |
| portfolio-performance-chart.test.tsx | 2 → 0 | Delete | Delete data-source labels while chart/data calculation is mocked away. |
| portfolio-price-sync.test.ts | 15 → 12 | Trim | Remove revalidation path pinning, mocked overview echo, and simulated SQL timestamp rollback; keep auth, freshness, repeated calls, partial allocation, and RPC failure reporting. |
| portfolio-pricing-section.test.tsx | 3 → 3 | Keep | Keep refreshing state and preserved cached data on failure/manual recovery. |
| portfolio-provider-errors.test.ts | 3 → 3 | Keep | Keep real provider HTTP error propagation instead of canned portfolio answers. |
| portfolio-queries.test.ts | 9 → 8 | Trim | Remove empty-array fixture; keep normalization, fallback, deduplication, and query cap. |
| portfolio-save-holdings.test.ts | 14 → 14 | Keep | Keep validated/normalized atomic-RPC contract, malformed input, ownership/auth denial, and truthful storage/quote failure reporting. |
| portfolio-snapshot-panel.test.tsx | 1 → 1 | Keep | Keep refreshed values and suppression of uncomputed monthly return. |
| portfolio-sync-prices-route.test.ts | 2 → 1 | Trim | Remove mocked freshness/delegation echo; keep required portfolio-ID rejection. |
| portfolio-value-card.test.tsx | 1 → 1 | Keep | Keep refreshed value and signed two-decimal daily return. |
| portfolio-value-snapshots-cron-route.test.ts | 2 → 1 | Trim | Remove mocked snapshot/delegation counts; keep cron authentication. |
| preferences-panel.test.tsx | 1 → 1 | Trim | Remove selector absence/router assertions; keep actual theme-button interaction. |
| preferences-provider.test.tsx | 2 → 1 | Trim | Remove initial fixture/copy smoke; keep DOM and storage persistence after theme/locale actions. |
| profile-form-legal-links.test.tsx | 1 → 0 | Delete | Delete static legal-link targets. |
| profile-utils.test.ts | 5 → 3 | Trim | Remove uncomplicated name/default-handle fixtures; keep normalization, invalid input, and completeness/terms gates. |
| publisher-extract.test.ts | 2 → 2 | Keep | Keep unsafe URL suppression and allowed URL extraction queue transition. |
| publisher-url.test.ts | 6 → 0 | Delete | Delete duplicate validator/DNS cases covered more broadly by outbound-url-guard.test.ts. |
| rate-limit.test.ts | 1 → 1 | Keep | Keep repeated-user requests reaching the durable consumer without caching prior allow decisions. |
| redirect-validation.test.ts | 11 → 11 | Keep | Keep internal allowlist/query controls and adversarial/malformed redirect rejection. |
| refresh-route.test.ts | 6 → 6 | Trim | Remove static delegation/constants; keep combined worker/Finnhub article/count aggregation and failure handling. |
| refresh-v2-route.test.ts | 15 → 9 | Trim | Remove mocked delegation/config/response echoes; keep auth, empty-insert suppression, worker/extraction/enrichment/analysis failures. |
| root-layout.test.tsx | 2 → 0 | Delete | Delete direct element-prop/static layout checks. |
| save-article-button.test.tsx | 1 → 1 | Keep; fix wait | Keep save interaction; fix baseline readiness race by awaiting enabled state before click. |
| score-explanation.test.ts | 2 → 0 | Delete | Delete display-label/copy fixtures that do not exercise ranking/scoring. |
| site-header-language-hidden.test.tsx | 1 → 0 | Delete | Delete static selector absence. |
| smart-alerts-cron-route.test.ts | 4 → 2 | Trim | Remove now-override delegation and fixed GET response; keep auth and per-user error reporting. |
| smart-alerts-dedupe.test.ts | 3 → 3 | Keep | Keep reanalysis identity/read-state preservation, legacy dedupe, and distinct article control. |
| smart-alerts.test.ts | 1 → 1 | Keep | Keep rule/threshold evaluation and resulting alert rows. |
| source-config-candidate.test.ts | 5 → 0 | Delete | Delete exported-array, label, and registration constant pinning. |
| streamed-price-refresh-pages.test.tsx | 4 → 0 | Delete | Delete mocked page-to-child wiring that does not exercise actual streaming. |
| stripe-webhook-route.test.ts | 5 → 5 | Keep | Keep checkout sync, duplicate suppression, competing-worker rejection, failed-processing recovery, and unsupported-event payload omission. |
| thesis-storage-errors.test.ts | 4 → 4 | Keep | Keep missing-schema unavailability and raw database-error redaction. |
| timing-safe.test.ts | 5 → 4 | Trim | Remove empty-equals-empty fixture; keep valid secrets and mismatches including unequal lengths. |
| today-dashboard.test.tsx | 2 → 0 | Delete | Delete broad fixture/copy rendering smoke. |
| turnstile-protected-routes.test.ts | 7 → 4 | Trim | Remove duplicate rejection and permissive success cases accepting downstream failure; keep both chat gates and post/comment rejection. |
| turnstile-verify.test.ts | 17 → 14 | Trim | Remove undefined/null-IP fixtures and duplicate abort classification; keep fail-closed provider behavior, replay, action/hostname, and request contract. |
| turnstile-widget.test.ts | 10 → 5 | Trim | Remove default callback/state fixtures and duplicate reset example; keep event ordering, expiry/reset invalidation, error recovery, and missing-key blocking. |
| twelvedata-detail.test.ts | 5 → 5 | Keep | Keep provider response normalization, partial failures, full failures, and missing financial data. |
| user-menu.test.tsx | 3 → 2 | Trim | Remove static menu/admin-link presence; keep sign-out and unsafe avatar rejection. |
| valuation.test.ts | 17 → 17 | Keep | Keep currency conversion, prior-close weighting, missing FX/prices, zero values, and coherent partial allocations. |
| value-display.test.ts | 6 → 6 | Keep | Keep signed losses, real zero versus unknown money, currency/partial notes, and absence of invented portfolio values. |
| watchlist-detail-dashboard.test.tsx | 2 → 1 | Trim | Remove earnings CTA/copy fixture; keep unsafe company URL rejection. |
| watchlist-intelligence.test.ts | 1 → 0 | Delete | Delete signal-label/copy smoke over one ordinary fixture. |
| watchlist-items.test.tsx | 3 → 3 | Keep | Keep one-time refresh across rerender, price updates, quiet background failure, and manual failure reporting. |
| watchlist-page.test.tsx | 1 → 0 | Delete | Delete mocked server-to-child payload wiring. |

## Python decisions

Filenames are relative to workers/news_ingestion/tests/.

| File | Cases before → after | Decision | Concrete reason |
|---|---:|---|---|
| test_gnews_external_id.py | 3 → 3 | Keep | Same URL with changed date must deduplicate; fallback fields distinguish stories; normalization preserves targeted query provenance. |
| test_newsapi_external_id.py | 2 → 2 | Keep | Stable identity across changed publication timestamps and distinct identity across fallback headlines. |
| test_newsapi_ai_normalization.py | 25 → 21 | Trim | Remove metadata echo, fixed source-type assertion, identical-input determinism, and prefix-only fallback ID checks. Keep ticker filtering/cap, category classification, identity changes, cutoff/malformed data, and body truncation. |
| test_newscatcher_normalization.py | 29 → 25 | Trim | Remove the equivalent four metadata/source-type/determinism/prefix checks. Keep tag filtering, classification, malformed/cutoff inputs, content precedence, and truncation. |
| test_newscatcher_http_errors.py | 3 → 3 | Keep | Provider request headers, rejected/non-JSON errors, and credential non-disclosure. |
| test_preflight.py | 1 → 1 | Keep | GNews package availability without requiring a nonexistent API key. |
| test_provider_set.py | 10 → 6 | Trim | Remove static registry flags and direct unknown-registry identity. Keep execution selecting the appropriate provider set and required/optional credential preflight gates. |
| test_url_safety.py | 7 → 7 | Keep | Public controls, prohibited addresses/URLs, guard scoping, DNS rebinding rejection before socket connection, and literal-destination rejection. |

