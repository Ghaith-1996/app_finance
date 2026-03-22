"""Fetch global market/business headlines via the no-auth gnews package."""

from __future__ import annotations

import hashlib
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any

from ..schema import NormalizedArticle
from .result import SourceFetchBundle

logger = logging.getLogger(__name__)

GNEWS_TIMEOUT_SECONDS = 15
GLOBAL_FETCH_BUCKETS = (
    ("global_top", None),
    ("global_top_3h", "3h"),
    ("global_top_1h", "1h"),
)
TARGETED_BUCKET = "targeted_portfolio_refresh"
TARGETED_PERIOD = "3h"
MAX_TARGETED_QUERIES = 8


def stable_gnews_external_id(article: dict[str, Any]) -> str:
    """Stable dedupe key based on durable article fields returned by gnews."""
    url = str(article.get("url") or "").strip()
    if url:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
        return f"gnews_{digest}"

    title = str(article.get("title") or "").strip()
    pub = str(article.get("published date") or article.get("published_date") or "").strip()
    publisher = _publisher_name(article.get("publisher"))
    raw = f"{title}|{pub}|{publisher}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]
    return f"gnews_{digest}"


def _parse_published_at(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except Exception:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _publisher_name(raw: Any) -> str:
    if isinstance(raw, str):
        return raw.strip()
    if isinstance(raw, dict):
        return str(raw.get("title") or raw.get("name") or raw.get("href") or "").strip()
    return ""


def _run_with_timeout(fn: Any, *args: Any) -> Any:
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(fn, *args)
        return future.result(timeout=GNEWS_TIMEOUT_SECONDS)


def _get_gnews_client(*, period: str | None, max_results: int):
    from gnews import GNews  # type: ignore[import-untyped]

    return GNews(
        language="en",
        country="US",
        period=period,
        max_results=max_results,
    )


def _fetch_bucket_articles(
    *,
    period: str | None,
    max_results: int,
    query: str | None = None,
) -> list[dict[str, Any]]:
    client = _get_gnews_client(period=period, max_results=max_results)
    if query:
        return _run_with_timeout(client.get_news, query)
    return _run_with_timeout(client.get_top_news)


def _article_to_normalized(
    raw: dict[str, Any],
    *,
    cutoff: datetime,
    bucket: str,
    query: str | None = None,
) -> NormalizedArticle | None:
    title = str(raw.get("title") or "").strip()
    if not title:
        return None

    published = _parse_published_at(
        str(raw.get("published date") or raw.get("published_date") or "").strip() or None,
    )
    if published is None or published < cutoff:
        return None

    publisher = _publisher_name(raw.get("publisher")) or "Google News"
    description = str(raw.get("description") or "").strip()
    url = str(raw.get("url") or "").strip() or None

    metadata = {
        "gnews_fetch_buckets": [bucket],
        "gnews_publisher_raw": raw.get("publisher"),
        "gnews_published_raw": raw.get("published date") or raw.get("published_date"),
    }
    if query:
        metadata["gnews_target_queries"] = [query]

    return NormalizedArticle(
        source_type="gnews",
        external_id=stable_gnews_external_id(raw),
        headline=title,
        url=url,
        published_at=published,
        source=publisher,
        stock_tags=[],
        category_hint="other",
        raw_content=description or None,
        metadata=metadata,
    )


def _merge_unique_strings(*values: Any) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, list):
            continue
        for item in value:
            text = str(item).strip()
            if not text or text in seen:
                continue
            merged.append(text)
            seen.add(text)
    return merged


def _prefer_article(existing: NormalizedArticle, candidate: NormalizedArticle) -> NormalizedArticle:
    existing_score = (
        existing.published_at,
        len(existing.raw_content or ""),
        1 if existing.url else 0,
    )
    candidate_score = (
        candidate.published_at,
        len(candidate.raw_content or ""),
        1 if candidate.url else 0,
    )
    return candidate if candidate_score > existing_score else existing


def _merge_articles(existing: NormalizedArticle, candidate: NormalizedArticle) -> NormalizedArticle:
    preferred = _prefer_article(existing, candidate)
    other = candidate if preferred is existing else existing

    preferred.metadata = {
        **other.metadata,
        **preferred.metadata,
        "gnews_fetch_buckets": _merge_unique_strings(
            existing.metadata.get("gnews_fetch_buckets"),
            candidate.metadata.get("gnews_fetch_buckets"),
        ),
        "gnews_target_queries": _merge_unique_strings(
            existing.metadata.get("gnews_target_queries"),
            candidate.metadata.get("gnews_target_queries"),
        ),
    }

    if not preferred.raw_content and other.raw_content:
        preferred.raw_content = other.raw_content
    if not preferred.url and other.url:
        preferred.url = other.url
    if not preferred.source and other.source:
        preferred.source = other.source

    return preferred


def _rank_for_output(article: NormalizedArticle) -> tuple[int, datetime, int]:
    buckets = article.metadata.get("gnews_fetch_buckets") or []
    is_targeted = 1 if TARGETED_BUCKET in buckets else 0
    return (is_targeted, article.published_at, len(article.raw_content or ""))


def fetch_gnews_news(
    *,
    lookback_hours: int = 24,
    max_articles: int = 50,
    queries: list[str] | None = None,
) -> SourceFetchBundle:
    """
    Pull global top Google News stories plus recent slices. When refresh passes
    targeted holding queries, also fetch recent query matches and dedupe them
    into the same global news pool.
    """
    try:
        from gnews import GNews  # noqa: F401  # type: ignore[import-untyped]
    except Exception as exc:
        return SourceFetchBundle(
            articles=[],
            outcome="failed",
            error=f"gnews import failed: {exc!s}",
        )

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=lookback_hours)

    global_max = min(max(4, max_articles), 10)
    targeted_max = min(max(3, max_articles // 3), 6)
    targeted_queries = [query.strip() for query in (queries or []) if query.strip()][:MAX_TARGETED_QUERIES]

    collected: list[NormalizedArticle] = []
    warnings: list[str] = []
    attempted_requests = 0
    failed_requests = 0

    for bucket, period in GLOBAL_FETCH_BUCKETS:
        attempted_requests += 1
        try:
            raw_articles = _fetch_bucket_articles(period=period, max_results=global_max)
        except FuturesTimeoutError:
            failed_requests += 1
            warnings.append(f"{bucket}: timed out after {GNEWS_TIMEOUT_SECONDS}s")
            continue
        except Exception as exc:
            failed_requests += 1
            warnings.append(f"{bucket}: {type(exc).__name__}: {exc}")
            logger.exception("GNews bucket fetch failed: %s", bucket)
            continue

        if not isinstance(raw_articles, list):
            warnings.append(f"{bucket}: unexpected response shape")
            continue

        for item in raw_articles:
            if not isinstance(item, dict):
                continue
            try:
                article = _article_to_normalized(item, cutoff=cutoff, bucket=bucket)
                if article:
                    collected.append(article)
            except Exception as exc:
                warnings.append(f"{bucket}: skip article: {exc!s}")

    for query in targeted_queries:
        attempted_requests += 1
        try:
            raw_articles = _fetch_bucket_articles(
                period=TARGETED_PERIOD,
                max_results=targeted_max,
                query=query,
            )
        except FuturesTimeoutError:
            failed_requests += 1
            warnings.append(f"{TARGETED_BUCKET} [{query}]: timed out after {GNEWS_TIMEOUT_SECONDS}s")
            continue
        except Exception as exc:
            failed_requests += 1
            warnings.append(f"{TARGETED_BUCKET} [{query}]: {type(exc).__name__}: {exc}")
            logger.exception("Targeted GNews query failed: %s", query)
            continue

        if not isinstance(raw_articles, list):
            warnings.append(f"{TARGETED_BUCKET} [{query}]: unexpected response shape")
            continue

        for item in raw_articles:
            if not isinstance(item, dict):
                continue
            try:
                article = _article_to_normalized(
                    item,
                    cutoff=cutoff,
                    bucket=TARGETED_BUCKET,
                    query=query,
                )
                if article:
                    collected.append(article)
            except Exception as exc:
                warnings.append(f"{TARGETED_BUCKET} [{query}]: skip article: {exc!s}")

    deduped: dict[str, NormalizedArticle] = {}
    for article in collected:
        existing = deduped.get(article.external_id)
        deduped[article.external_id] = _merge_articles(existing, article) if existing else article

    articles = sorted(deduped.values(), key=_rank_for_output, reverse=True)[:max_articles]

    if not articles and attempted_requests > 0 and failed_requests >= attempted_requests:
        return SourceFetchBundle(
            articles=[],
            outcome="failed",
            error="All GNews fetch buckets failed",
            warnings=warnings,
        )

    if not articles:
        return SourceFetchBundle(
            articles=[],
            outcome="empty_window",
            warnings=warnings,
        )

    return SourceFetchBundle(
        articles=articles,
        outcome="success",
        warnings=warnings,
    )
