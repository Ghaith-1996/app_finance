"""Unit tests for NewsCatcher fetcher normalization logic.

Covers:
  - ticker-only stock_tags (entity names excluded, actual tickers kept)
  - category_hint mapping from topic via _TOPIC_CATEGORY_MAP
  - stable external_id generation
  - empty / missing field handling

Run from repo root:
  python -m unittest workers.news_ingestion.tests.test_newscatcher_normalization
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from workers.news_ingestion.fetchers.newscatcher_fetcher import (
    _article_to_normalized,
    stable_newscatcher_external_id,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NOW = datetime.now(timezone.utc)
_RECENT = (_NOW - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
_CUTOFF = _NOW - timedelta(hours=24)


def _make_article(**overrides: object) -> dict:
    """Build a minimal valid NewsCatcher article dict."""
    base: dict = {
        "_id": "nc-abc123",
        "title": "Test Article Headline",
        "link": "https://example.com/article/1",
        "published_date": _RECENT,
        "excerpt": "Article excerpt text.",
        "name_source": "Bloomberg",
        "topic": "business",
        "entities": [],
    }
    base.update(overrides)
    return base


def _make_entity(name: str) -> dict:
    return {"name": name}


# ---------------------------------------------------------------------------
# Stock tag filtering
# ---------------------------------------------------------------------------


class TestStockTagFiltering(unittest.TestCase):
    """Only values matching ^[A-Z]{1,5}(\\.[A-Z]{1,2})?$ become stock_tags."""

    def test_real_tickers_kept(self) -> None:
        art = _make_article(entities=[
            _make_entity("AAPL"),
            _make_entity("TSLA"),
            _make_entity("BRK.B"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, ["AAPL", "TSLA", "BRK.B"])

    def test_entity_names_excluded_from_tags(self) -> None:
        """Descriptive entity names must NOT appear in stock_tags."""
        art = _make_article(entities=[
            _make_entity("Microsoft Corporation"),
            _make_entity("Apple Inc."),
            _make_entity("United States"),
            _make_entity("Federal Reserve"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, [])

    def test_mixed_entities_filter_correctly(self) -> None:
        art = _make_article(entities=[
            _make_entity("Microsoft Corporation"),
            _make_entity("MSFT"),
            _make_entity("Alphabet Inc."),
            _make_entity("GOOG"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, ["MSFT", "GOOG"])

    def test_lowercase_symbols_excluded(self) -> None:
        art = _make_article(entities=[_make_entity("aapl")])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, [])

    def test_tags_capped_at_five(self) -> None:
        art = _make_article(entities=[
            _make_entity("A"), _make_entity("B"), _make_entity("C"),
            _make_entity("D"), _make_entity("E"), _make_entity("F"),
            _make_entity("G"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(len(result.stock_tags), 5)

    def test_entity_names_in_metadata(self) -> None:
        """Excluded entity names should appear in metadata for debugging."""
        art = _make_article(entities=[
            _make_entity("Microsoft Corporation"),
            _make_entity("MSFT"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertIn("Microsoft Corporation", result.metadata["newscatcher_entities"])
        self.assertIn("MSFT", result.metadata["newscatcher_entities"])


# ---------------------------------------------------------------------------
# Category hint mapping
# ---------------------------------------------------------------------------


class TestCategoryHintMapping(unittest.TestCase):
    """category_hint should map from the topic field."""

    def test_financials_from_business(self) -> None:
        art = _make_article(topic="business")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "financials")

    def test_macro_from_economics(self) -> None:
        art = _make_article(topic="economics")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "macro")

    def test_technology_from_tech(self) -> None:
        art = _make_article(topic="tech")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "technology")

    def test_geopolitics_from_politics(self) -> None:
        art = _make_article(topic="politics")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "geopolitics")

    def test_energy_mapped(self) -> None:
        art = _make_article(topic="energy")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "energy")

    def test_consumer_from_entertainment(self) -> None:
        art = _make_article(topic="entertainment")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "consumer")

    def test_other_from_news(self) -> None:
        art = _make_article(topic="news")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "other")

    def test_defaults_to_other_when_unknown_topic(self) -> None:
        art = _make_article(topic="unknown_topic")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "other")

    def test_defaults_to_other_when_no_topic(self) -> None:
        art = _make_article(topic="")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "other")

    def test_case_insensitive_topic(self) -> None:
        """Topic casing shouldn't matter — uses .lower()."""
        art = _make_article(topic="BUSINESS")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "financials")


# ---------------------------------------------------------------------------
# Stable external ID
# ---------------------------------------------------------------------------


class TestStableExternalId(unittest.TestCase):
    def test_prefers_id(self) -> None:
        a = _make_article(_id="nc-1", link="https://a.com", title="T")
        b = _make_article(_id="nc-1", link="https://b.com", title="T2")
        self.assertEqual(
            stable_newscatcher_external_id(a),
            stable_newscatcher_external_id(b),
        )

    def test_falls_back_to_link(self) -> None:
        a = _make_article(_id="", link="https://a.com/story")
        b = _make_article(_id="", link="https://a.com/story")
        self.assertEqual(
            stable_newscatcher_external_id(a),
            stable_newscatcher_external_id(b),
        )
        self.assertTrue(stable_newscatcher_external_id(a).startswith("newscatcher_"))

    def test_falls_back_to_title_date(self) -> None:
        a = _make_article(_id="", link="", title="Unique", published_date="2025-01-01")
        eid = stable_newscatcher_external_id(a)
        self.assertTrue(eid.startswith("newscatcher_"))

    def test_different_ids_differ(self) -> None:
        a = _make_article(_id="nc-1")
        b = _make_article(_id="nc-2")
        self.assertNotEqual(
            stable_newscatcher_external_id(a),
            stable_newscatcher_external_id(b),
        )


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases(unittest.TestCase):
    def test_missing_title_returns_none(self) -> None:
        art = _make_article(title="")
        self.assertIsNone(_article_to_normalized(art, cutoff=_CUTOFF))

    def test_missing_date_returns_none(self) -> None:
        art = _make_article(published_date="")
        self.assertIsNone(_article_to_normalized(art, cutoff=_CUTOFF))

    def test_old_article_below_cutoff_returns_none(self) -> None:
        old_date = (_CUTOFF - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        art = _make_article(published_date=old_date)
        self.assertIsNone(_article_to_normalized(art, cutoff=_CUTOFF))

    def test_source_type_is_newscatcher(self) -> None:
        art = _make_article()
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.source_type, "newscatcher")

    def test_body_from_excerpt(self) -> None:
        art = _make_article(excerpt="Excerpt text", summary="Summary text")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.raw_content, "Excerpt text")

    def test_body_fallback_to_summary(self) -> None:
        art = _make_article(excerpt="", summary="Summary text")
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.raw_content, "Summary text")

    def test_body_truncated_at_2000(self) -> None:
        art = _make_article(excerpt="x" * 5000)
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(len(result.raw_content or ""), 2000)

    def test_none_entities_handled(self) -> None:
        art = _make_article(entities=None)
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, [])

    def test_malformed_entity_handled(self) -> None:
        """Entity with missing/None name shouldn't blow up."""
        art = _make_article(entities=[{"name": None}, {}])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, [])


if __name__ == "__main__":
    unittest.main()
