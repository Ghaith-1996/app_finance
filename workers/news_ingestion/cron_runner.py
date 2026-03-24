"""GitHub Actions cron runner for raw news ingest and payload generation."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv

    env_path = Path(__file__).parent.parent.parent / ".env"
    load_dotenv(dotenv_path=env_path, override=False)
except ImportError:
    pass

from supabase import create_client

from .main import run as run_worker
from .schema import NormalizedArticle
from .upsert import upsert_articles

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
    return sorted({str(value).strip().upper() for value in values if str(value).strip()})


def resolve_global_tickers(client) -> list[str]:
    holdings = client.table("holdings").select("symbol").execute().data or []
    watchlist = client.table("watchlist_items").select("symbol").execute().data or []
    return _unique_upper(
        [row.get("symbol") for row in holdings] + [row.get("symbol") for row in watchlist]
    )


def resolve_finnhub_targets(client) -> list[dict]:
    holdings = client.table("holdings").select("symbol, company").execute().data or []
    watchlist = client.table("watchlist_items").select("symbol, company").execute().data or []
    merged = {}
    for row in holdings + watchlist:
        symbol = str(row.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        merged[symbol] = {
            "symbol": symbol,
            "company": (row.get("company") or None),
        }
    return list(merged.values())


def _normalize_whitespace(value):
    return " ".join(str(value or "").split()).strip()


def _normalize_url(value):
    raw = _normalize_whitespace(value)
    return raw or None


def _dedupe_key(headline: str, url: str | None) -> str:
    if url:
        return f"url:{url.lower()}"
    return f"headline:{headline.lower()}"


def _finnhub_category_hint(category: str | None) -> str:
    normalized = _normalize_whitespace(category).lower()
    if not normalized:
        return "other"
    if "merger" in normalized or "acquisition" in normalized:
        return "deals"
    if "earnings" in normalized:
        return "earnings"
    if "regulation" in normalized:
        return "regulation"
    if "forex" in normalized or "macro" in normalized:
        return "macro"
    return "other"


def _related_tickers(related: str | None, fallback_symbol: str) -> list[str]:
    parsed = []
    for item in str(related or "").split(","):
        ticker = item.strip().upper()
        if ticker and len(ticker) <= 10:
            parsed.append(ticker)
    return _unique_upper([fallback_symbol, *parsed])


def fetch_finnhub_company_news(symbol: str, from_date: str, to_date: str, api_key: str):
    import requests

    response = requests.get(
        "https://finnhub.io/api/v1/company-news",
        params={
            "symbol": symbol,
            "from": from_date,
            "to": to_date,
            "token": api_key,
        },
        timeout=15,
        headers={"Accept": "application/json"},
    )
    response.raise_for_status()
    data = response.json()
    return data if isinstance(data, list) else []


def ingest_finnhub(targets: list[dict], lookback_hours: int, max_articles: int) -> dict:
    api_key = os.getenv("FINNHUB_API_KEY", "").strip()
    row = {
        "fetched": 0,
        "inserted": 0,
        "skipped": 0,
        "failed": 0,
        "inserted_ids": [],
        "fetch_outcome": "skipped",
        "fetch_error": None,
        "fetch_warnings": [],
    }
    if not api_key or not targets:
        return row

    client = _get_supabase_client()
    now = datetime.now(timezone.utc)
    from_date = (now - timedelta(hours=lookback_hours)).date().isoformat()
    to_date = now.date().isoformat()

    merged: dict[str, NormalizedArticle] = {}

    for target in targets[:25]:
        symbol = target["symbol"]
        try:
            articles = fetch_finnhub_company_news(symbol, from_date, to_date, api_key)
            row["fetched"] += len(articles)
        except Exception as exc:  # noqa: BLE001
            row["failed"] += 1
            row["fetch_error"] = row["fetch_error"] or str(exc)
            continue

        for article in articles:
            headline = _normalize_whitespace(article.get("headline"))
            published_at = article.get("datetime")
            if not headline or not isinstance(published_at, (int, float)):
                continue

            url = _normalize_url(article.get("url"))
            key = _dedupe_key(headline, url)
            stock_tags = _related_tickers(article.get("related"), symbol)
            external_id = (
                f"finnhub_{article['id']}"
                if article.get("id") is not None
                else f"finnhub_{symbol}_{abs(hash(key))}"
            )

            normalized = NormalizedArticle(
                source_type="finnhub",
                external_id=external_id,
                headline=headline,
                url=url,
                published_at=datetime.fromtimestamp(published_at, tz=timezone.utc),
                source=_normalize_whitespace(article.get("source")) or "Finnhub",
                stock_tags=stock_tags,
                category_hint=_finnhub_category_hint(article.get("category")),
                raw_content=_normalize_whitespace(article.get("summary")) or None,
                metadata={
                    "finnhub": {
                        "category": _normalize_whitespace(article.get("category")) or None,
                        "image": _normalize_whitespace(article.get("image")) or None,
                        "targetSymbols": [symbol],
                        "relatedSymbols": stock_tags,
                        "articleIds": [str(article.get("id") or external_id)],
                    }
                },
            )

            existing = merged.get(key)
            if existing:
                existing.stock_tags = _unique_upper([*existing.stock_tags, *stock_tags])
                continue
            merged[key] = normalized

    prepared = sorted(merged.values(), key=lambda item: item.published_at, reverse=True)[:max_articles]
    if row["fetched"] == 0 and row["failed"] == 0:
        row["fetch_outcome"] = "empty_window"
        return row

    stats = upsert_articles(prepared, source_label="finnhub")
    row.update(stats.to_dict())
    row["fetch_outcome"] = "failed" if row["failed"] and not prepared else ("success" if row["inserted"] > 0 else "empty_window")
    return row


def main():
    lookback_hours = int(os.getenv("NEWS_CRON_LOOKBACK_HOURS", "24"))
    max_articles = int(os.getenv("NEWS_CRON_MAX_ARTICLES", "50"))

    client = _get_supabase_client()
    tickers = resolve_global_tickers(client)
    finnhub_targets = resolve_finnhub_targets(client)

    worker_result = run_worker(
        tickers,
        lookback_hours=lookback_hours,
        max_articles_per_source=max_articles,
    )
    finnhub_row = ingest_finnhub(finnhub_targets, lookback_hours, max_articles)

    inserted_ids = []
    for key in ("edgar", "newsapi", "gnews"):
        ids = worker_result.get(key, {}).get("inserted_ids", [])
        if isinstance(ids, list):
            inserted_ids.extend(ids)
    inserted_ids.extend(finnhub_row.get("inserted_ids", []))

    payload = {
        "tickers": tickers,
        "lookbackHours": lookback_hours,
        "maxArticles": max_articles,
        "ingest_status": worker_result.get("ingest_status"),
        "ingest_detail": worker_result.get("ingest_detail"),
        "edgar": worker_result.get("edgar", {}),
        "newsapi": worker_result.get("newsapi", {}),
        "gnews": worker_result.get("gnews", {}),
        "finnhub": finnhub_row,
        "total_inserted": int(worker_result.get("total_inserted", 0)) + int(finnhub_row.get("inserted", 0)),
        "inserted_article_ids": sorted({str(item) for item in inserted_ids if str(item).strip()}),
    }

    print(json.dumps(payload), flush=True)


if __name__ == "__main__":
    main()
