"""Extract full article text from publisher URLs using newspaper3k."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)

MIN_USEFUL_LENGTH = 80
FETCH_DELAY_SECONDS = 0.7
SKIP_URL_PREFIXES = (
    "https://www.sec.gov/",
    "https://sec.gov/",
    "https://efts.sec.gov/",
)


@dataclass
class ExtractionStats:
    attempted: int = 0
    extracted: int = 0
    failed: int = 0
    skipped: int = 0

    def to_dict(self) -> dict:
        return {
            "attempted": self.attempted,
            "extracted": self.extracted,
            "failed": self.failed,
            "skipped": self.skipped,
        }


def _should_skip_url(url: str) -> bool:
    return any(url.startswith(prefix) for prefix in SKIP_URL_PREFIXES)


def extract_article_text(url: str) -> str | None:
    """Download and parse a single article URL, returning the body text or None."""
    try:
        from newspaper import Article
    except ImportError:
        logger.warning("newspaper3k not installed — skipping full-text extraction")
        return None

    try:
        article = Article(url)
        article.download()
        article.parse()
        text = (article.text or "").strip()
        return text if len(text) >= MIN_USEFUL_LENGTH else None
    except Exception as exc:
        logger.debug("Extraction failed for %s: %s", url, exc)
        return None


def _get_supabase_client():
    from supabase import create_client

    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for full-text extraction.")
    if not url:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL is required.")
    return create_client(url, key)


def extract_full_text_for_ids(article_ids: list[str]) -> ExtractionStats:
    """
    Extract full text for specific article IDs (typically freshly inserted).
    Only processes rows where full_content IS NULL and url IS NOT NULL.
    """
    stats = ExtractionStats()

    if not article_ids:
        return stats

    try:
        client = _get_supabase_client()
    except Exception as exc:
        logger.error("Supabase connection failed for extraction: %s", exc)
        stats.failed = len(article_ids)
        return stats

    result = (
        client.table("news_items")
        .select("id, url, source_type")
        .in_("id", article_ids)
        .is_("full_content", "null")
        .not_.is_("url", "null")
        .execute()
    )

    rows = result.data or []

    for row in rows:
        url = row.get("url", "")
        row_id = row["id"]

        if not url or _should_skip_url(url):
            stats.skipped += 1
            client.table("news_items").update({"full_content": ""}).eq("id", row_id).execute()
            continue

        stats.attempted += 1
        text = extract_article_text(url)

        if text:
            client.table("news_items").update({"full_content": text}).eq("id", row_id).execute()
            stats.extracted += 1
            logger.info("Extracted %d chars for %s", len(text), url[:80])
        else:
            client.table("news_items").update({"full_content": ""}).eq("id", row_id).execute()
            stats.failed += 1

        time.sleep(FETCH_DELAY_SECONDS)

    return stats


def backfill_full_text(*, limit: int = 50) -> ExtractionStats:
    """
    Backfill full_content for existing articles that have a URL but no
    extracted text yet. Processes the most recent articles first.
    """
    stats = ExtractionStats()

    try:
        client = _get_supabase_client()
    except Exception as exc:
        logger.error("Supabase connection failed for backfill: %s", exc)
        return stats

    result = (
        client.table("news_items")
        .select("id, url, source_type")
        .is_("full_content", "null")
        .not_.is_("url", "null")
        .order("published_at", desc=True)
        .limit(limit)
        .execute()
    )

    rows = result.data or []
    logger.info("Backfill: found %d articles needing full-text extraction", len(rows))

    for row in rows:
        url = row.get("url", "")
        row_id = row["id"]

        if not url or _should_skip_url(url):
            stats.skipped += 1
            client.table("news_items").update({"full_content": ""}).eq("id", row_id).execute()
            continue

        stats.attempted += 1
        text = extract_article_text(url)

        if text:
            client.table("news_items").update({"full_content": text}).eq("id", row_id).execute()
            stats.extracted += 1
            logger.info("Backfill extracted %d chars for %s", len(text), url[:80])
        else:
            client.table("news_items").update({"full_content": ""}).eq("id", row_id).execute()
            stats.failed += 1

        time.sleep(FETCH_DELAY_SECONDS)

    return stats
