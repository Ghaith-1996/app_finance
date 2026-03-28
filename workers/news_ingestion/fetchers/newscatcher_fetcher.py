"""Fetch market/business articles via NewsCatcher v3 API."""

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

_BASE_URL = "https://v3-api.newscatcherapi.com/api/search"

# Default topic + keyword when no targeted queries are supplied
_DEFAULT_QUERY = "stock market OR earnings OR economy OR finance"

# Regex for plausible ticker symbols (1-5 uppercase letters, optional dot suffix)
_TICKER_RE = re.compile(r"^[A-Z]{1,5}(\.[A-Z]{1,2})?$")

# Map NewsCatcher topic values → app taxonomy category_hint.
_TOPIC_CATEGORY_MAP: dict[str, str] = {
    "business": "financials",
    "economics": "macro",
    "finance": "financials",
    "politics": "geopolitics",
    "world": "geopolitics",
    "tech": "technology",
    "science": "technology",
    "energy": "energy",
    "entertainment": "consumer",
    "food": "consumer",
    "gaming": "consumer",
    "sport": "consumer",
    "travel": "consumer",
    "music": "consumer",
    "news": "other",
    "beauty": "consumer",
}


def stable_newscatcher_external_id(article: dict[str, Any]) -> str:
    """Stable dedupe key: prefer _id hash, then link hash, then headline+date."""
    _id = (article.get("_id") or "").strip()
    if _id:
        digest = hashlib.sha256(_id.encode("utf-8")).hexdigest()[:24]
        return f"newscatcher_{digest}"

    link = (article.get("link") or "").strip()
    if link:
        digest = hashlib.sha256(link.encode("utf-8")).hexdigest()[:24]
        return f"newscatcher_{digest}"

    title = (article.get("title") or "").strip()
    pub = (article.get("published_date") or "").strip()
    source_name = (article.get("name_source") or "").strip()
    raw = f"{title}|{pub}|{source_name}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]
    return f"newscatcher_{digest}"


def _parse_published_at(article: dict[str, Any]) -> datetime | None:
    raw = article.get("published_date")
    if not raw:
        return None
    try:
        cleaned = str(raw).replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
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

    display_source = (raw.get("name_source") or "NewsCatcher").strip() or "NewsCatcher"
    url = (raw.get("link") or "").strip() or None
    body = (raw.get("excerpt") or raw.get("summary") or "").strip() or None

    # NewsCatcher v3 may include NLP entities — keep only ticker-like symbols.
    # Full entity names are preserved in metadata for debugging.
    stock_tags: list[str] = []
    entity_names: list[str] = []
    entities = raw.get("entities")
    if isinstance(entities, list):
        for ent in entities[:10]:
            if isinstance(ent, dict):
                name = (ent.get("name") or "").strip()
                if name:
                    entity_names.append(name)
                    # Only keep values that look like tickers (e.g. "AAPL")
                    if _TICKER_RE.match(name):
                        stock_tags.append(name)

    # Derive category_hint from topic via mapping
    raw_topic = (raw.get("topic") or "").strip().lower()
    category_hint = _TOPIC_CATEGORY_MAP.get(raw_topic, "other")

    return NormalizedArticle(
        source_type="newscatcher",
        external_id=stable_newscatcher_external_id(raw),
        headline=title,
        url=url,
        published_at=published,
        source=display_source,
        stock_tags=stock_tags[:5],
        category_hint=category_hint,
        raw_content=body[:2000] if body else None,
        metadata={
            "newscatcher_id": raw.get("_id"),
            "newscatcher_score": raw.get("_score"),
            "newscatcher_country": raw.get("country"),
            "newscatcher_topic": raw.get("topic"),
            "newscatcher_entities": entity_names[:10],
        },
    )


def fetch_newscatcher_news(
    *,
    lookback_hours: int = 24,
    max_articles: int = 50,
    queries: list[str] | None = None,
) -> SourceFetchBundle:
    """
    Pull English articles from the last ``lookback_hours`` via NewsCatcher v3.
    Optionally uses targeted ``queries`` for portfolio-specific searches.
    """
    key = os.getenv("NEWSCATCHER_API_KEY", "").strip()
    if not key:
        return SourceFetchBundle(
            articles=[],
            outcome="failed",
            error="NEWSCATCHER_API_KEY is not set",
        )

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=lookback_hours)
    from_date = cutoff.strftime("%Y/%m/%d %H:%M:%S")

    all_articles: list[NormalizedArticle] = []
    warnings: list[str] = []
    seen_ids: set[str] = set()

    def _dedupe_append(articles: list[NormalizedArticle]) -> None:
        for art in articles:
            if art.external_id not in seen_ids:
                seen_ids.add(art.external_id)
                all_articles.append(art)

    headers = {
        "x-api-token": key,
        "Content-Type": "application/json",
    }

    # --- Global finance fetch ---
    try:
        global_articles = _search(
            headers,
            query=_DEFAULT_QUERY,
            from_date=from_date,
            cutoff=cutoff,
            page_size=min(max_articles, 100),
        )
        _dedupe_append(global_articles)
    except Exception as exc:
        logger.exception("NewsCatcher global search failed")
        warnings.append(f"Global search failed: {exc!s}")

    # --- Targeted portfolio queries ---
    if queries:
        for query in queries[:8]:
            try:
                targeted = _search(
                    headers,
                    query=query,
                    from_date=from_date,
                    cutoff=cutoff,
                    page_size=min(max(max_articles // 4, 10), 50),
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


def _search(
    headers: dict[str, str],
    *,
    query: str,
    from_date: str,
    cutoff: datetime,
    page_size: int = 50,
) -> list[NormalizedArticle]:
    """Execute a single NewsCatcher v3 search request."""
    payload: dict[str, Any] = {
        "q": query,
        "lang": "en",
        "sort_by": "date",
        "page_size": page_size,
        "from_": from_date,
    }

    response = requests.post(
        _BASE_URL,
        headers=headers,
        json=payload,
        timeout=20,
    )
    response.raise_for_status()
    data = response.json()

    results = data.get("articles", [])
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
