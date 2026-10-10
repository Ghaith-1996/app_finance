# Supabase migrations

`migrations/` is the schema source of truth. Files are applied in filename order.

## Validate before deploying (local, disposable)

```bash
bash scripts/db/validate-migrations.sh
```

This starts a throwaway Supabase Postgres container, applies every migration from scratch, replays
the legacy-row seeds in `tests/upgrade/before_<prefix>_*.sql` immediately before the matching
migration (so backfills are exercised like an upgrade), then runs `tests/*.test.sql`, including
two-session concurrency races. It never connects to a real project. CI runs the same script
(`.github/workflows/ci.yml`).

## Applying to an environment

1. Check what the environment already has. If migrations were applied with the Supabase CLI:

   ```sql
   select version, name from supabase_migrations.schema_migrations order by version;
   ```

   If they were applied through the SQL editor, there is no ledger; compare the schema instead
   (for example, check that the objects created by the newest migration exist).
2. Apply only the missing files, in filename order, to **staging first**, then production.
3. Run the post-apply checks below.

### Audit remediation migrations (must precede the matching app deploy)

| File | Adds | App code that depends on it |
|---|---|---|
| `032_atomic_holdings_save.sql` | `save_portfolio_holdings` RPC | CSV/manual import (`saveHoldings`) |
| `033_holding_valuation_contract.sql` | `previous_close`, `fx_rate_to_usd`, `fx_as_of`; `apply_holding_price_updates`; wider `unrealized_gain_percent` | price refresh, snapshots, valuation |
| `034_news_enrichment_state.sql` | `enrichment_status` backlog columns | enrichment cron, analysis |
| `035_ai_quota_release.sql` | `release_ai_quota`; quota functions limited to `service_role` | article chat, portfolio copilot |
| `036_atomic_position_changes.sql` | `holding_transactions` ledger; `apply_holding_transaction` | add/sell shares |
| `037_notification_delivery_claims.sql` | delivery claim columns; claim/complete RPCs | daily digest delivery |
| `038_sms_phone_verification.sql` | `phone_verification_challenges`, `verified_phone_numbers`; issue/confirm RPCs (service role only) | settings SMS verification; daily digest SMS (unverified numbers stop receiving SMS until verified) |
| `039_holding_transaction_identity.sql` | `holding_transactions.requested_holding_id`; `apply_holding_transaction` treats an id as a retry only for the same holding and add price | add/sell shares |
| `040_phone_verification_release.sql` | `release_phone_verification` (service role only) | settings SMS verification (unsent codes no longer consume the cooldown) |
| `041_snapshot_valuation_version.sql` | `portfolio_value_snapshots.valuation_version`; pre-041 rows stay NULL and are excluded from history | hourly value snapshots; `/portfolio/full` performance history |
| `042_enrichment_settled_watermark.sql` | backfills `enriched_at` on terminally failed news rows; `news_items_settled_at_idx` | analysis cron eligibility (terminal enrichment failures count as new work) |
| `043_holding_transaction_lock_order.sql` | `apply_holding_transaction` locks the holding row before writing the ledger row (no deadlock between concurrent changes to one holding) | add/sell shares |
| `044_latest_usable_analysis_runs.sql` | `latest_usable_analysis_runs()` (service role only), one newest complete/degraded run per portfolio; `idx_analysis_runs_usable_latest` | analysis cron target discovery; admin job health |

Deploying the app before these migrations breaks the listed features (missing RPCs/columns).

## Duplicate version prefixes (008, 019, 024)

Three prefixes are used twice:

- `008_extracted_content.sql`, `008_news_full_content.sql`
- `019_news_detail_open_count.sql`, `019_user_accepted_terms.sql`
- `024_daily_digest_notifications.sql`, `024_ticker_earnings_reports.sql`

A clean rebuild in filename order works (the validator proves it). The risk is the Supabase CLI
ledger: it keys migrations by the numeric prefix, so two files with the same prefix collide and
`supabase db push` may refuse or skip one. **Do not rename these files blindly**: environments that
already recorded a version would then see "new" migrations and try to re-apply them.

Before choosing a fix, inspect each environment's ledger (query above):

- If no environment uses the CLI ledger, leave the files as they are and keep new prefixes unique.
- If an environment does use it, pick one explicit plan per environment (for example, record the
  second file of each pair under a new version with `supabase migration repair`, after confirming
  its objects already exist) and apply the same renames in the repository in the same change.

New migrations must always use a new, unique prefix.

## Post-apply checks (staging)

- Two-user isolation: as user B, attempt reads/writes of user A's portfolio, holdings, theses and
  alerts by direct id substitution; every attempt must fail or return no rows.
- `select has_function_privilege('anon', 'release_ai_quota(uuid,text,timestamptz,text,text)', 'EXECUTE');`
  must be `false` (same for the other quota and delivery functions).
- Thesis tracker (`030`/`031`): save and reload a thesis with a test account.

## Additional deployment prerequisites

- The validator requires Bash and Docker with a disposable local Supabase Postgres container; never point checks at a real project.
- Check the complete filename-ordered history, including 006 article chat, 020–023 quotas/concurrency/heartbeat,
  024 digest and earnings, 025 snapshots, 027/028 alerts and 030/031 theses; do not rely on an old checklist's maximum prefix.
- Confirm private billing/usage/rate-limit tables are inaccessible through anon/authenticated direct access; review deployed linter findings explicitly.
- Verify persisted CSV/manual import, add/sell retries, FX price updates, delivery claims and SMS verification against the target schema.
- SMS possession checks require 038 and release of definitely-unsent codes requires 040; ambiguous provider outcomes keep the pending code/cooldown.
- Confirm migration 039 retry identity and 041 snapshot valuation exclusions before deploying their consumers.
- Record the applied filenames/schema checks per environment; a local rebuild does not prove that staging or production has them.
