"""Shared normalized article schema for ingestion sources (EDGAR, NewsAPI, etc.)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class NormalizedArticle:
    """Single normalized news row ready for Supabase upsert."""

    source_type: str
    """e.g. 'edgar', 'newsapi'"""

    external_id: str
    """Provider-stable dedup key stored with source_type."""

    headline: str
    url: Optional[str]
    published_at: datetime
    """Timezone-aware UTC datetime."""

    source: str
    """Display publisher string (e.g. 'SEC/EDGAR', 'Reuters')."""

    stock_tags: list[str] = field(default_factory=list)
    """Uppercase ticker symbols confirmed by the provider (may be empty for NewsAPI)."""

    category_hint: str = "other"
    """Pre-AI category guess; AI enrichment may override for display."""

    raw_content: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    """Source-specific details stored as JSONB."""
