# Local Kubernetes Runner adapter

This directory has a separate **local-only** entrypoint for Pulsefolio Runner:

```sh
python -m workers.news_ingestion.runner_entry discover \
  --sources gnews --max-articles 50 > manifest.json
```

Discovery uses the existing Python fetchers and emits one JSON object to stdout.
It does **not** connect to Supabase. Python logging and any Python-level
third-party printing go to stderr. The manifest is ordered by
`(source_type, external_id)`, deduplicated on those keys, and versioned.
Kubernetes caps ConfigMap data at 1 MiB, so discovery fails (exit 1, empty
stdout) when the UTF-8 manifest exceeds 1,000,000 bytes; lower `--max-articles`.

The Runner's Go CLI stores that JSON in a **per-execution ConfigMap**, then
creates a Kubernetes Indexed Job. Each Pod runs:

```sh
python -m workers.news_ingestion.runner_entry process \
  --manifest /etc/pulsefolio/manifest.json --workers 3
```

Kubernetes sets `JOB_COMPLETION_INDEX=0/1/2`; worker `i` processes the
manifest positions `i, i+N, i+2N, ...`. Only this command writes to Supabase,
and it refuses to run unless all of the following are true:

- `PULSEFOLIO_RUNNER_LOCAL=1`
- `SUPABASE_URL` is an HTTP local/Docker endpoint (never hosted HTTPS); IP hosts
  must be canonical loopback (`127.0.0.0/8`, `::1`) or RFC1918 addresses (integer/hex
  IPv4 forms, link-local/metadata such as `169.254.169.254`, `0.0.0.0` and IPv6 ULA
  are refused), and every address a host name resolves to must be in those ranges; writes then
  connect to the first checked address that accepts a connection (in resolver
  order, e.g. `::1` then `127.0.0.1`), not to a fresh resolution of the name
- `SUPABASE_SERVICE_ROLE_KEY` is a **local** service-role key.

The existing `news_items` partial unique index on `(source_type, external_id)`
prevents duplicates. The Runner uses insert-first, then confirms 23505 conflicts
as existing rows; it does not overwrite existing enrichment results.

**Scope:** This is the raw Python news ingestion stage, not the deployed cron,
Finnhub-specific cron fetch, full-text extraction, or TypeScript AI enrichment.
The existing `cron_runner.py`, `cron_runner_v2.py`, `main.py`, both provider
sets, and production GitHub Actions workflows remain untouched.

This adapter's manifest and partition contract is tested in
`tests/test_runner_entry.py`. Full network/database verification requires a
running local Supabase instance and kind cluster; tests using mocks do not
establish actual database idempotence.

See the separate Pulsefolio Runner repository for the Go CLI, Docker image,
and local kind/Supabase setup guide.
