"""Fetch global market/business headlines via NewsAPI (no portfolio tickers)."""

from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from ..schema import NormalizedArticle
from .result import SourceFetchBundle

logger = logging.getLogger(__name__)

# Market / business relevance — keeps the global pool finance-oriented
NEWSAPI_BUSINESS_QUERY = (
    '("stock market" OR business OR finance OR economy OR earnings OR '
    '"wall street" OR nasdaq OR NYSE OR investing OR fed OR SEC OR '
    '"quarterly results" OR IPO OR merger OR acquisition)'
)


def stable_newsapi_external_id(article: dict[str, Any]) -> str:
    """
    Stable dedupe key: prefer URL hash; else title + publishedAt + source name.
    """
    url = (article.get("url") or "").strip()
    if url:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
        return f"newsapi_{digest}"
    title = (article.get("title") or "").strip()
    pub = (article.get("publishedAt") or "").strip()
    src = ""
    s = article.get("source")
    if isinstance(s, dict):
        src = (s.get("id") or s.get("name") or "").strip()
    raw = f"{title}|{pub}|{src}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]
    return f"newsapi_{digest}"


def _parse_published_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        # NewsAPI uses ISO8601, often with Z
        cleaned = value.replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned)
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

    published = _parse_published_at(raw.get("publishedAt"))
    if published is None:
        return None
    if published.tzinfo is None:
        published = published.replace(tzinfo=timezone.utc)
    if published < cutoff:
        return None

    source_block = raw.get("source") if isinstance(raw.get("source"), dict) else {}
    display_source = (source_block.get("name") or "NewsAPI").strip() or "NewsAPI"
    url = (raw.get("url") or "").strip() or None
    description = (raw.get("description") or raw.get("content") or "").strip() or None

    return NormalizedArticle(
        source_type="newsapi",
        external_id=stable_newsapi_external_id(raw),
        headline=title,
        url=url,
        published_at=published,
        source=display_source,
        stock_tags=[],
        category_hint="other",
        raw_content=description,
        metadata={
            "newsapi_author": raw.get("author"),
            "newsapi_source_id": source_block.get("id"),
        },
    )


def fetch_newsapi_news(
    *,
    lookback_hours: int = 24,
    max_articles: int = 50,
) -> SourceFetchBundle:
    """
    Pull English articles from the last ``lookback_hours`` using NewsAPI
    ``everything`` search (market/business-oriented query). Ignores tickers.
    """
    key = os.getenv("NEWSAPI_KEY", "").strip()
    if not key:
        return SourceFetchBundle(
            articles=[],
            outcome="failed",
            error="NEWSAPI_KEY is not set",
        )

    try:
        from newsapi import NewsApiClient  # type: ignore[import-untyped]
    except Exception as exc:
        return SourceFetchBundle(
            articles=[],
            outcome="failed",
            error=f"newsapi-python import failed: {exc!s}",
        )

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=lookback_hours)
    # YYYY-MM-DD is the most compatible `from`/`to` shape across NewsAPI plans;
    # articles older than `cutoff` are dropped client-side.
    from_str = cutoff.date().isoformat()
    to_str = now.date().isoformat()

    page_size = min(max(1, max_articles), 100)

    try:
        client = NewsApiClient(api_key=key)
        response = client.get_everything(
            q=NEWSAPI_BUSINESS_QUERY,
            language="en",
            sort_by="publishedAt",
            from_param=from_str,
            to=to_str,
            page_size=page_size,
            page=1,
        )
    except Exception as exc:
        logger.exception("NewsAPI request failed")
        return SourceFetchBundle(
            articles=[],
            outcome="failed",
            error=f"{type(exc).__name__}: {exc}",
        )

    if not isinstance(response, dict):
        return SourceFetchBundle(
            articles=[],
            outcome="failed",
            error="Unexpected NewsAPI response shape",
        )

    if response.get("status") != "ok":
        msg = response.get("message") or response.get("code") or "NewsAPI error"
        return SourceFetchBundle(
            articles=[],
            outcome="failed",
            error=str(msg),
        )

    raw_articles = response.get("articles") or []
    articles: list[NormalizedArticle] = []
    warnings: list[str] = []

    for item in raw_articles:
        if not isinstance(item, dict):
            continue
        try:
            art = _article_to_normalized(item, cutoff=cutoff)
            if art:
                articles.append(art)
        except Exception as exc:
            warnings.append(f"skip article: {exc!s}")

    if not articles:
        return SourceFetchBundle(
            articles=[],
            outcome="empty_window",
            warnings=warnings,
        )

    return SourceFetchBundle(
        articles=articles[:max_articles],
        outcome="success",
        warnings=warnings,
    )
