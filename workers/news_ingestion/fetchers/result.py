"""Structured result from a single news source fetch (before Supabase upsert)."""

from __future__ import annotations

from dataclasses import dataclass, field

from ..schema import NormalizedArticle


@dataclass
class SourceFetchBundle:
    """Outcome of fetching from one provider (e.g. edgar, newsapi)."""

    articles: list[NormalizedArticle] = field(default_factory=list)
    """
    outcome:
      - success: at least one article returned
      - empty_window: fetch path completed with no errors but zero articles in lookback
      - failed: import/setup error, or every ticker request failed with an exception
    """
    outcome: str = "empty_window"
    error: str | None = None  # primary error when outcome is failed
    warnings: list[str] = field(default_factory=list)  # per-ticker or secondary issues

    @property
    def fetched(self) -> int:
        return len(self.articles)

    def to_dict(self) -> dict:
        return {
            "fetched": self.fetched,
            "fetch_outcome": self.outcome,
            "fetch_error": self.error,
            "fetch_warnings": self.warnings,
        }
