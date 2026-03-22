"""Write normalized articles to Supabase news_items, deduplicating by external_id."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from .schema import NormalizedArticle

logger = logging.getLogger(__name__)


@dataclass
class UpsertStats:
    fetched: int = 0
    inserted: int = 0
    skipped: int = 0
    failed: int = 0
    inserted_ids: list[str] = None

    def __post_init__(self):
        if self.inserted_ids is None:
            self.inserted_ids = []

    def to_dict(self) -> dict:
        return {
            "fetched": self.fetched,
            "inserted": self.inserted,
            "skipped": self.skipped,
            "failed": self.failed,
            "inserted_ids": self.inserted_ids,
        }


def _get_supabase_client():
    """Create a Supabase client using service role key (bypasses RLS)."""
    from supabase import create_client

    url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        raise RuntimeError(
            "SUPABASE_SERVICE_ROLE_KEY is required for news ingestion. "
            "The anon key cannot bypass RLS to insert into news_items."
        )
    if not url:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL is required.")
    return create_client(url, key)


def _row_from_article(article: NormalizedArticle) -> dict:
    return {
        "source_type": article.source_type,
        "external_id": article.external_id,
        "headline": article.headline,
        "source": article.source,
        "url": article.url,
        "published_at": article.published_at.isoformat(),
        "raw_content": article.raw_content,
        "stock_tags": article.stock_tags,
        "category_hint": article.category_hint,
        "metadata": article.metadata,
        # AI enrichment fields: left NULL so Node enrichment step fills them in.
        "category": "other",
        "overall_effect": "neutral",
        "ticker_impacts": [],
    }


def upsert_articles(
    articles: list[NormalizedArticle],
    *,
    source_label: str = "",
) -> UpsertStats:
    """
    Insert articles into news_items, skipping any that already exist by
    (source_type, external_id).  Returns per-source counts.
    """
    stats = UpsertStats(fetched=len(articles))

    if not articles:
        return stats

    try:
        client = _get_supabase_client()
    except Exception as exc:
        logger.error("Supabase connection failed: %s", exc)
        stats.failed = len(articles)
        return stats

    for article in articles:
        try:
            # Check for an existing row with the same (source_type, external_id).
            existing = (
                client.table("news_items")
                .select("id")
                .eq("source_type", article.source_type)
                .eq("external_id", article.external_id)
                .execute()
            )
            if existing.data:
                stats.skipped += 1
                continue

            row = _row_from_article(article)
            result = client.table("news_items").insert(row).execute()

            if result.data:
                inserted_id = result.data[0].get("id")
                if inserted_id:
                    stats.inserted_ids.append(inserted_id)
                stats.inserted += 1
            else:
                stats.failed += 1

        except Exception as exc:
            logger.warning(
                "%s upsert failed for %s: %s",
                source_label or article.source_type,
                article.external_id,
                exc,
            )
            stats.failed += 1

    return stats
