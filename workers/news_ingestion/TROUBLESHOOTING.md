# News ingestion worker troubleshooting

The worker lives at `workers/news_ingestion/` and is spawned by Next.js routes (`/api/news/refresh`, `/api/news/cron`, `/api/news/ingest`). It writes to `news_items` using the Supabase **service role** key.

## Python environment

- Install deps: `pip install -r requirements.txt` (from the app repo root).
- Ensure `python` or `python3` is on `PATH` when the Next.js server runs.

## EDGAR / edgartools

- Set **`EDGAR_IDENTITY`** to `Full Name email@example.com` (SEC fair-access policy).
- **`EDGAR_LOCAL_DATA_DIR`** defaults to `<project>/.edgar_data` and must be writable.

## NewsAPI

- Set **`NEWSAPI_KEY`** (from [newsapi.org](https://newsapi.org)).
- Global headlines use the `everything` endpoint with a market/business-oriented query; articles are filtered to the configured lookback window after fetch.
- If you see `NewsAPI error` in logs, check quota, plan limits, and that the key is valid.

## GNews

- Install the **`gnews`** package via `pip install -r requirements.txt`.
- No API key is required. The worker uses the package to read Google News feeds.
- The source fetches default top stories, 3-hour top stories, 1-hour top stories, and refresh-only targeted holding queries.
- If you see `gnews import failed`, verify the Python environment used by Next.js has the package installed.

## Supabase

- **`SUPABASE_SERVICE_ROLE_KEY`** is required so inserts bypass RLS.
- **`NEXT_PUBLIC_SUPABASE_URL`** must match your project.

## Diagnostics JSON

Successful runs print JSON on stdout with `edgar`, `newsapi`, and `gnews` objects including `fetch_outcome`, `fetch_error`, and article counts. Logs go to stderr.

## Preflight

Run:

```bash
python -m workers.news_ingestion.main --check
```

This validates imports, env vars, and writable EDGAR paths.
