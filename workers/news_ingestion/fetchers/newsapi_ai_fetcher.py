"""Fetch market/business articles via NewsAPI.ai (Event Registry)."""

from __future__ import annotations

import hashlib
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from ..schema import NormalizedArticle
from .result import SourceFetchBundle

logger = logging.getLogger(__name__)

# Finance-oriented concept URIs used by Event Registry
_CONCEPT_URIS = [
    "http://en.wikipedia.org/wiki/Stock_market",
    "http://en.wikipedia.org/wiki/Finance",
    "http://en.wikipedia.org/wiki/Economy",
]

# Regex for plausible ticker symbols (1-5 uppercase letters, optional dot suffix)
_TICKER_RE = re.compile(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$")

# Map Event Registry concept labels → app taxonomy category_hint.
# Only the first matching concept wins.  Unlisted concepts are ignored.
_CONCEPT_CATEGORY_MAP: dict[str, str] = {
    "stock market": "financials",
    "stock exchange": "financials",
    "finance": "financials",
    "banking": "financials",
    "interest rate": "macro",
    "inflation": "macro",
    "economy": "macro",
    "gross domestic product": "macro",
    "trade war": "geopolitics",
    "tariff": "geopolitics",
    "trade policy": "geopolitics",
    "sanctions": "geopolitics",
    "geopolitics": "geopolitics",
    "technology": "technology",
    "artificial intelligence": "technology",
    "semiconductor": "technology",
    "software": "technology",
    "cryptocurrency": "technology",
    "bitcoin": "technology",
    "energy": "energy",
    "petroleum": "energy",
    "natural gas": "energy",
    "renewable energy": "energy",
    "mining": "minerals",
    "gold": "minerals",
    "copper": "minerals",
    "healthcare": "healthcare",
    "pharmaceutical": "healthcare",
    "biotechnology": "healthcare",
    "mergers and acquisitions": "deals",
    "initial public offering": "deals",
    "regulation": "regulation",
    "antitrust": "regulation",
    "earnings": "earnings",
    "consumer": "consumer",
    "retail": "consumer",
    "industry": "industrials",
    "manufacturing": "industrials",
}

_BASE_URL = "https://eventregistry.org/api/v1/article/getArticles"


def stable_newsapi_ai_external_id(article: dict[str, Any]) -> str:
    """Stable dedupe key: prefer article URI hash, else URL hash, else title+date."""
    uri = (article.get("uri") or "").strip()
    if uri:
        digest = hashlib.sha256(uri.encode("utf-8")).hexdigest()[:24]
        return f"newsapi_ai_{digest}"

    url = (article.get("url") or "").strip()
    if url:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
        return f"newsapi_ai_{digest}"

    title = (article.get("title") or "").strip()
    pub = (article.get("dateTimePub") or article.get("dateTime") or "").strip()
    source_name = ""
    src = article.get("source")
    if isinstance(src, dict):
        source_name = (src.get("title") or src.get("uri") or "").strip()
    raw = f"{title}|{pub}|{source_name}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]
    return f"newsapi_ai_{digest}"


def _parse_published_at(article: dict[str, Any]) -> datetime | None:
    for field in ("dateTimePub", "dateTime"):
        raw = article.get(field)
        if not raw:
            continue
        try:
            cleaned = str(raw).replace("Z", "+00:00")
            dt = datetime.fromisoformat(cleaned)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            continue
    return None


def _article_to_normalized(
    raw: dict[str, Any],
    *,
    cutoff: datetime,
) -> NormalizedArticle | None:
    title = (raw.get("title") or "").strip()
    if not title:
        return None

    published = _parse_published_at(raw)
    if published is None:
        return None
    if published < cutoff:
        return None

    source_block = raw.get("source") if isinstance(raw.get("source"), dict) else {}
    display_source = (source_block.get("title") or "NewsAPI.ai").strip() or "NewsAPI.ai"
    url = (raw.get("url") or "").strip() or None
    body = (raw.get("body") or "").strip() or None

    # Extract only ticker-like symbols from concept labels.
    # Full concept labels are preserved in metadata for debugging.
    stock_tags: list[str] = []
    concept_labels: list[str] = []
    concepts = raw.get("concepts") or []
    if isinstance(concepts, list):
        for concept in concepts[:10]:
            if isinstance(concept, dict):
                label = (concept.get("label", {}) or {})
                eng = label.get("eng", "") if isinstance(label, dict) else ""
                if eng:
                    concept_labels.append(eng)
                    # Only keep values that look like tickers (e.g. "AAPL", "MSFT")
                    if _TICKER_RE.match(eng):
                        stock_tags.append(eng)

    # Derive category_hint from concept labels
    category_hint = "other"
    for label in concept_labels:
        mapped = _CONCEPT_CATEGORY_MAP.get(label.lower())
        if mapped:
            category_hint = mapped
            break

    return NormalizedArticle(
        source_type="newsapi_ai",
        external_id=stable_newsapi_ai_external_id(raw),
        headline=title,
        url=url,
        published_at=published,
        source=display_source,
        stock_tags=stock_tags[:5],
        category_hint=category_hint,
        raw_content=body[:2000] if body else None,
        metadata={
            "newsapi_ai_uri": raw.get("uri"),
            "newsapi_ai_source_uri": source_block.get("uri"),
            "newsapi_ai_sentiment": raw.get("sentiment"),
            "newsapi_ai_concepts": concept_labels[:10],
        },
    )


def fetch_newsapi_ai_news(
    *,
    lookback_hours: int = 24,
    max_articles: int = 50,
    queries: list[str] | None = None,
) -> SourceFetchBundle:
    """
    Pull English finance articles from the last ``lookback_hours`` via
    NewsAPI.ai (Event Registry) article search. Optionally uses targeted
    ``queries`` for portfolio-specific searches.
    """
    key = os.getenv("NEWSAPI_AI_API_KEY", "").strip()
    if not key:
        return SourceFetchBundle(
            articles=[],
            outcome="failed",
            error="NEWSAPI_AI_API_KEY is not set",
        )

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=lookback_hours)
    date_start = cutoff.strftime("%Y-%m-%dT%H:%M:%S")
    date_end = now.strftime("%Y-%m-%dT%H:%M:%S")

    all_articles: list[NormalizedArticle] = []
    warnings: list[str] = []
    seen_ids: set[str] = set()

    def _dedupe_append(articles: list[NormalizedArticle]) -> None:
        for art in articles:
            if art.external_id not in seen_ids:
                seen_ids.add(art.external_id)
                all_articles.append(art)

    # --- Global finance fetch ---
    try:
        global_articles = _fetch_articles(
            key,
            date_start=date_start,
            date_end=date_end,
            cutoff=cutoff,
            concept_uris=_CONCEPT_URIS,
            count=min(max_articles, 100),
        )
        _dedupe_append(global_articles)
    except Exception as exc:
        logger.exception("NewsAPI.ai global fetch failed")
        warnings.append(f"Global fetch failed: {exc!s}")

    # --- Targeted portfolio queries ---
    if queries:
        for query in queries[:8]:
            try:
                targeted = _fetch_articles(
                    key,
                    date_start=date_start,
                    date_end=date_end,
                    cutoff=cutoff,
                    keyword=query,
                    count=min(max(max_articles // 4, 10), 50),
                )
                _dedupe_append(targeted)
            except Exception as exc:
                warnings.append(f"Targeted query '{query}' failed: {exc!s}")

    if not all_articles and not warnings:
        return SourceFetchBundle(
            articles=[],
            outcome="empty_window",
        )

    if not all_articles and warnings:
        return SourceFetchBundle(
            articles=[],
            outcome="failed",
            error=warnings[0],
            warnings=warnings,
        )

    return SourceFetchBundle(
        articles=all_articles[:max_articles],
        outcome="success",
        warnings=warnings or None,
    )


def _fetch_articles(
    api_key: str,
    *,
    date_start: str,
    date_end: str,
    cutoff: datetime,
    concept_uris: list[str] | None = None,
    keyword: str | None = None,
    count: int = 50,
) -> list[NormalizedArticle]:
    """Execute a single Event Registry article search request."""
    body: dict[str, Any] = {
        "action": "getArticles",
        "resultType": "articles",
        "articlesCount": count,
        "articlesSortBy": "date",
        "articlesSortByAsc": False,
        "lang": "eng",
        "dateStart": date_start,
        "dateEnd": date_end,
        "apiKey": api_key,
    }
    if keyword:
        body["keyword"] = keyword
        body["keywordOper"] = "and"
    if concept_uris:
        body["conceptUri"] = concept_uris

    response = requests.post(_BASE_URL, json=body, timeout=20)
    response.raise_for_status()
    data = response.json()

    results = data.get("articles", {}).get("results", [])
    if not isinstance(results, list):
        return []

    articles: list[NormalizedArticle] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        art = _article_to_normalized(item, cutoff=cutoff)
        if art:
            articles.append(art)

    return articles
