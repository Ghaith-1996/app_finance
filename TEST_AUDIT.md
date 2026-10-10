# Test signal audit

Audited on October 2, 2026 after the request to remove unit tests without distinct regression value. Three parallel subagents reviewed UI, auth/AI/billing, and background pipelines; the coordinating agent reviewed portfolio calculations, shared utilities, and Python workers.

## Périmètre de cette campagne

Les décisions par cas ci-dessous appartiennent à la campagne datée en introduction.
Cette campagne ne revendiquait aucune couverture E2E de remplacement.
Le cas publisher-url est remplacé par outbound-url-guard pour les risques de schéma, IP, DNS, rebinding, redirects et limites réseau.
La politique actuelle et les commandes de vérification sont dans AGENTS.md et README.md.

- Campagne du 2 octobre : intake 732 Vitest/80 Python ; retrait 162/12 cas, 174 au total ; concurrence ajouta 13 cas et porta le run final à 583 Vitest/68 Python.
- Résultats datés : 583/583 et 68/68 réussis ; ils ne valident pas le HEAD du présent refactor. Le défaut de timing SaveArticleButton fut corrigé en gardant son interaction.
- Les mocks ne prouvaient pas locking/rollback/RLS/atomicité SQL ; les SQL et fixtures conservés ne furent pas exécutés par cette campagne.
## Remplacement frontend du 10 octobre 2026 (PR #11)

Les 17 cas ajoutés après l'implémentation dans cette PR sont retirés seulement après qualification de leur remplacement dans `tests/e2e/frontend-polish.spec.ts` : six parcours Chromium, plus le gate foundation existant. Ce remplacement est distinct de la campagne historique ci-dessous.

| Cas retirés | Protection de remplacement vérifiée |
|---|---|
| `reduced-motion.test.tsx` : 2 helpers de mouvement | Préférence OS réelle et scroll natif via le feed authentifié ; API `matchMedia` absente injectée après hydratation pour vérifier le fallback réel de pagination. |
| Même fichier : 4 assertions CSS et 1 markup Hero | Styles calculés : délais nuls, durée/itérations/transitions réduites, spinner actif, mesh statique ou animé selon largeur/préférence, couleurs des deux thèmes et `aria-hidden`. |
| Même fichier : 5 cas UseCases avec faux observer/timers | Vrai IntersectionObserver, intervalle natif, sélection au pointeur, focus clavier, hover sans sélection, absence de cycle en mouvement réduit et contenu visible sans JavaScript. |
| `analysis-step-status.test.ts` : 5 statuts | Sessions Auth et lectures de la base réelles : idle, mapping, complete, degraded, failed ; les cinq étapes affichées sont vérifiées pour chaque état. Queued et accès inter-utilisateurs sont aussi couverts. |

Commande reproductible et prérequis : `npm run test:e2e -- --frontend`, voir README.md. Qualification locale réussie : namespace `pf-e2e-532e8fc8-721`, HEAD `3dcf7b0f554489a97a219cf8fb6b62c98b642746` avec patch fingerprint `8bff74719a3d0818f839480a202b781452986ad3fe70704f6507bd2aa8e10f74` ; le manifest des sources et les assertions sont dans `runner.json` et `assertions.jsonl`. La CI complète rejoue ces parcours sur le commit publié et exporte sa propre preuve.

Les fixtures créent uniquement comptes, portefeuille, articles et statuts d'analyse jetables. CSS, observer, timers, scroll, application compilée, Auth, PostgREST et RLS sont réels. HTTP fournisseurs et widget Turnstile sont simulés par le runner existant. L'absence d'API navigateur est une injection limitée, pas une qualification des anciens navigateurs. La livraison realtime est désactivée dans ce stack ; la présentation des statuts ne prouve pas une génération AI ou une livraison realtime réussie. Les captures exportées concernent uniquement les pages publiques.

### Suivi : focus avant le démarrage du cycle

Le nouveau commentaire de revue est reproduit par un septième parcours : focus natif sur la première carte encore hors viewport avec `preventScroll`, puis révélation par le vrai IntersectionObserver et attente d'un intervalle natif complet. Avant correction, la sélection devient `false` malgré le focus (namespace rouge `pf-e2e-424228a1-f3e`). `stopAutoAdvance` marque désormais le cycle comme déjà traité avant son retour lorsque le timer est absent ; le garde existant empêche son démarrage ultérieur.

La même commande qualifie les sept parcours après correction (namespace vert `pf-e2e-b8979f42-25c`, HEAD `c39e9363c7a2e041a5b465433916bb94f47e60af` avec patch fingerprint `ae55aa0546db07bb3b5922d76ad2fc90b03d6864b2922131094195a4361c4383`). Le focus est natif, l'ordre est contrôlé avec l'option navigateur `preventScroll` ; observer et timers ne sont pas simulés. Le cas existant continue de vérifier le cycle sans interaction et l'arrêt après révélation. Couches et limites du runner restent celles déclarées ci-dessus ; aucun nouveau cas unitaire n'est ajouté ni retiré.

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

