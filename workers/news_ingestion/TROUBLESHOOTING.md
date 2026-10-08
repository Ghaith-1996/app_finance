# News ingestion worker troubleshooting

Scheduled ingestion runs Python on GitHub Actions: `cron_runner` for current, `cron_runner_v2` for candidate.
The runners upsert raw news with service-role access and emit the payload posted to the deployed ingestion route.
Next.js admin/debug refresh/ingest routes can still launch a local Python process; the scheduled cron route consumes the runner payload.
TypeScript enrichment/analysis and Python full-text extraction are later stages. See [the scheduler guide](../../README.md#schedulers).

## Python environment

- From the app root: `python -m pip install --require-hashes -r requirements.lock` (same lock as CI/workflows).
- `requirements.txt` contains editable ranges used to compile the lock; use the lock for installation, including GNews.
- Local Next.js worker launches require `python` or `python3` on the server PATH; GitHub Actions supplies its own interpreter.

## Sources and EDGAR cache

- Current worker set: EDGAR, NewsAPI and GNews; `cron_runner` additionally fetches targeted Finnhub company news.
- Candidate set: EDGAR, NewsAPI.ai, GNews and NewsCatcher; `cron_runner_v2` has no targeted Finnhub stage.
- `EDGAR_IDENTITY` must identify `Full Name email@example.com` for SEC fair access.
- `EDGAR_LOCAL_DATA_DIR` defaults to `<project>/.edgar_data`; configure a writable cache before EDGAR import.
- Current NewsAPI uses `NEWSAPI_KEY`; the market/business `everything` results are filtered by lookback after fetch.
- Candidate NewsAPI.ai uses `NEWSAPI_AI_API_KEY`; `NEWSCATCHER_API_KEY` is optional/warning-only in candidate preflight.
- NewsCatcher degradation is best-effort and does not on its own block candidate cron; inspect its result separately.
- Finnhub needs `FINNHUB_API_KEY`; GNews needs no API key.
- GNews fetches default, 3-hour and 1-hour top stories plus refresh-only targeted holding queries.
- `gnews import failed`: check the interpreter actually used by the runner/server and reinstall the locked dependencies.
- NewsAPI errors: inspect quota, plan and key validity without logging the key. Candidate credentials are separate from current credentials.

## Supabase and pipeline credentials

- `NEXT_PUBLIC_SUPABASE_URL` identifies the project; `SUPABASE_SERVICE_ROLE_KEY` permits privileged writes and stays server/runner-only.
- Current ingestion posts to `/api/news/cron` with `CRON_SECRET`; candidate posts to `/api/news/cron/v2` with `NEWS_V2_CRON_SECRET`.
- Candidate's later enrichment/analysis reuse the current `CRON_ENDPOINT` and `CRON_SECRET`; keep the two ingestion paths distinct.
- Running either cron runner is a remote fetch/write operation, not a harmless preflight.

## Diagnostics JSON

Worker stdout is JSON; diagnostic logs go to stderr. Inspect source `fetch_outcome`, `fetch_error` and article counts.
Source objects depend on the selected set; current runner also reports Finnhub, candidate reports NewsAPI.ai/NewsCatcher.
Keep stderr separate when capturing payloads; workflows check JSON before POSTing it.
Inspect ingestion, full-text extraction, enrichment backlog and analysis status separately; inserted count alone is not end-to-end health.
Do not include secret values, reusable cookies or real user data in diagnostic artifacts.

## Preflight (from repository root)

```bash
python -m workers.news_ingestion.main --check
python -m workers.news_ingestion.main --check --provider-set candidate
```

These check imports, environment and writable EDGAR paths, not remote source availability, ingestion writes or deployed cron authorization.
A warning-only candidate NewsCatcher check can coexist with an overall successful preflight.
For regressions use `python -B -m unittest discover -s workers/news_ingestion/tests -t .`; this does not execute a real ingestion pipeline.
