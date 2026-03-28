"""GitHub Actions cron runner for the candidate provider set (Phase 1).

Mirrors the current cron_runner.py but:
  - passes ``provider_set="candidate"`` to the worker
  - skips Finnhub targeted company news (not in candidate set)
  - forwards portfolio-derived queries via ``--queries-json``
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    env_path = Path(__file__).parent.parent.parent / ".env"
    load_dotenv(dotenv_path=env_path, override=False)
except ImportError:
    pass

from supabase import create_client

from .main import run as run_worker

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)


def _get_supabase_client():
    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL is required.")
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required.")
    return create_client(url, key)


def _unique_upper(values):
    return sorted({str(v).strip().upper() for v in values if str(v).strip()})


def resolve_global_tickers(client) -> list[str]:
    holdings = client.table("holdings").select("symbol").execute().data or []
    watchlist = client.table("watchlist_items").select("symbol").execute().data or []
    return _unique_upper(
        [row.get("symbol") for row in holdings] + [row.get("symbol") for row in watchlist]
    )


def _build_portfolio_queries(client) -> list[str]:
    """Build keyword queries from all holdings (symbol + company name)."""
    holdings = client.table("holdings").select("symbol, company").execute().data or []
    queries: list[str] = []
    seen: set[str] = set()

    items = sorted(holdings, key=lambda r: (r.get("symbol") or "").upper())
    for row in items:
        symbol = (row.get("symbol") or "").strip().upper()
        company = " ".join((row.get("company") or "").split()).strip()

        if symbol and company and company.upper() != symbol:
            q = f'"{company}" {symbol} stock'
        elif company:
            q = f'"{company}" stock'
        elif symbol:
            q = f"{symbol} stock"
        else:
            continue

        if q not in seen:
            seen.add(q)
            queries.append(q)
        if len(queries) >= 8:
            break

    return queries


def main():
    lookback_hours = int(os.getenv("NEWS_CRON_LOOKBACK_HOURS", "24"))
    max_articles = int(os.getenv("NEWS_CRON_MAX_ARTICLES", "50"))

    client = _get_supabase_client()
    tickers = resolve_global_tickers(client)
    queries = _build_portfolio_queries(client)

    worker_result = run_worker(
        tickers,
        lookback_hours=lookback_hours,
        max_articles_per_source=max_articles,
        provider_set="candidate",
        queries=queries or None,
    )

    inserted_ids = []
    for key in ("edgar", "newsapi_ai", "gnews", "newscatcher"):
        ids = worker_result.get(key, {}).get("inserted_ids", [])
        if isinstance(ids, list):
            inserted_ids.extend(ids)

    payload = {
        "tickers": tickers,
        "lookbackHours": lookback_hours,
        "maxArticles": max_articles,
        "providerSet": "candidate",
        "ingest_status": worker_result.get("ingest_status"),
        "ingest_detail": worker_result.get("ingest_detail"),
        "edgar": worker_result.get("edgar", {}),
        "newsapi_ai": worker_result.get("newsapi_ai", {}),
        "gnews": worker_result.get("gnews", {}),
        "newscatcher": worker_result.get("newscatcher", {}),
        "total_inserted": int(worker_result.get("total_inserted", 0)),
        "inserted_article_ids": sorted({str(item) for item in inserted_ids if str(item).strip()}),
    }

    print(json.dumps(payload), flush=True)


if __name__ == "__main__":
    main()
