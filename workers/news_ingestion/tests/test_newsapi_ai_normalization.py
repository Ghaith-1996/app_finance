"""Unit tests for NewsAPI.ai fetcher normalization logic.

Covers:
  - ticker-only stock_tags (concept labels excluded, actual tickers kept)
  - category_hint mapping from concept labels via _CONCEPT_CATEGORY_MAP
  - stable external_id generation
  - empty / missing field handling

Run from repo root:
  python -m unittest workers.news_ingestion.tests.test_newsapi_ai_normalization
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from workers.news_ingestion.fetchers.newsapi_ai_fetcher import (
    _article_to_normalized,
    stable_newsapi_ai_external_id,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NOW = datetime.now(timezone.utc)
_RECENT = (_NOW - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
_CUTOFF = _NOW - timedelta(hours=24)


def _make_article(**overrides: object) -> dict:
    """Build a minimal valid NewsAPI.ai article dict."""
    base: dict = {
        "uri": "evt-1234567890",
        "title": "Test Article Headline",
        "url": "https://example.com/article/1",
        "dateTimePub": _RECENT,
        "body": "Article body text.",
        "source": {"title": "Reuters", "uri": "reuters.com"},
        "concepts": [],
    }
    base.update(overrides)
    return base


def _make_concept(label_eng: str) -> dict:
    """Build a single Event Registry concept dict."""
    return {"label": {"eng": label_eng}}


# ---------------------------------------------------------------------------
# Stock tag filtering
# ---------------------------------------------------------------------------


class TestStockTagFiltering(unittest.TestCase):
    """Only values matching ^[A-Z]{1,5}(\\.[A-Z]{1,2})?$ become stock_tags."""

    def test_real_tickers_kept(self) -> None:
        art = _make_article(concepts=[
            _make_concept("AAPL"),
            _make_concept("MSFT"),
            _make_concept("BRK.A"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, ["AAPL", "MSFT", "BRK.A"])

    def test_concept_labels_excluded_from_tags(self) -> None:
        """Long descriptive concept names must NOT appear in stock_tags."""
        art = _make_article(concepts=[
            _make_concept("Stock market"),
            _make_concept("Apple Inc."),
            _make_concept("Finance"),
            _make_concept("Artificial intelligence"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, [])

    def test_mixed_concepts_filter_correctly(self) -> None:
        art = _make_article(concepts=[
            _make_concept("Stock market"),
            _make_concept("GOOG"),
            _make_concept("Alphabet Inc."),
            _make_concept("AMZN"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, ["GOOG", "AMZN"])

    def test_lowercase_symbols_excluded(self) -> None:
        art = _make_article(concepts=[_make_concept("aapl")])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, [])

    def test_tags_capped_at_five(self) -> None:
        art = _make_article(concepts=[
            _make_concept("A"), _make_concept("B"), _make_concept("C"),
            _make_concept("D"), _make_concept("E"), _make_concept("F"),
            _make_concept("G"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(len(result.stock_tags), 5)

    def test_concept_labels_in_metadata(self) -> None:
        """Even excluded labels should appear in metadata for debugging."""
        art = _make_article(concepts=[
            _make_concept("Stock market"),
            _make_concept("AAPL"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertIn("Stock market", result.metadata["newsapi_ai_concepts"])
        self.assertIn("AAPL", result.metadata["newsapi_ai_concepts"])


# ---------------------------------------------------------------------------
# Category hint mapping
# ---------------------------------------------------------------------------


class TestCategoryHintMapping(unittest.TestCase):
    """category_hint should map from first matching concept label."""

    def test_financials_from_stock_market(self) -> None:
        art = _make_article(concepts=[_make_concept("Stock market")])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "financials")

    def test_macro_from_interest_rate(self) -> None:
        art = _make_article(concepts=[_make_concept("Interest rate")])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "macro")

    def test_technology_from_ai(self) -> None:
        art = _make_article(concepts=[_make_concept("Artificial intelligence")])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "technology")

    def test_geopolitics_from_trade_war(self) -> None:
        art = _make_article(concepts=[_make_concept("Trade war")])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "geopolitics")

    def test_first_match_wins(self) -> None:
        art = _make_article(concepts=[
            _make_concept("Energy"),
            _make_concept("Technology"),
        ])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "energy")

    def test_defaults_to_other_when_unmatched(self) -> None:
        art = _make_article(concepts=[_make_concept("AAPL")])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "other")

    def test_defaults_to_other_when_no_concepts(self) -> None:
        art = _make_article(concepts=[])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.category_hint, "other")

    def test_case_insensitive_lookup(self) -> None:
        """Map uses .lower() so 'STOCK MARKET' should still match."""
        art = _make_article(concepts=[_make_concept("STOCK MARKET")])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        # Note: "STOCK MARKET" != ticker (has space), so mapping should fire
        self.assertEqual(result.category_hint, "financials")


# ---------------------------------------------------------------------------
# Stable external ID
# ---------------------------------------------------------------------------


class TestStableExternalId(unittest.TestCase):
    def test_prefers_uri(self) -> None:
        a = _make_article(uri="evt-1", url="https://a.com", title="T")
        b = _make_article(uri="evt-1", url="https://b.com", title="T2")
        self.assertEqual(
            stable_newsapi_ai_external_id(a),
            stable_newsapi_ai_external_id(b),
        )

    def test_falls_back_to_url(self) -> None:
        a = _make_article(uri="", url="https://a.com/story")
        b = _make_article(uri="", url="https://a.com/story")
        self.assertEqual(
            stable_newsapi_ai_external_id(a),
            stable_newsapi_ai_external_id(b),
        )
        self.assertTrue(stable_newsapi_ai_external_id(a).startswith("newsapi_ai_"))

    def test_falls_back_to_title_date(self) -> None:
        a = _make_article(uri="", url="", title="Unique", dateTimePub="2025-01-01")
        eid = stable_newsapi_ai_external_id(a)
        self.assertTrue(eid.startswith("newsapi_ai_"))

    def test_different_uris_differ(self) -> None:
        a = _make_article(uri="evt-1")
        b = _make_article(uri="evt-2")
        self.assertNotEqual(
            stable_newsapi_ai_external_id(a),
            stable_newsapi_ai_external_id(b),
        )


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestEdgeCases(unittest.TestCase):
    def test_missing_title_returns_none(self) -> None:
        art = _make_article(title="")
        self.assertIsNone(_article_to_normalized(art, cutoff=_CUTOFF))

    def test_missing_date_returns_none(self) -> None:
        art = _make_article(dateTimePub="")
        self.assertIsNone(_article_to_normalized(art, cutoff=_CUTOFF))

    def test_old_article_below_cutoff_returns_none(self) -> None:
        old_date = (_CUTOFF - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        art = _make_article(dateTimePub=old_date)
        self.assertIsNone(_article_to_normalized(art, cutoff=_CUTOFF))

    def test_source_type_is_newsapi_ai(self) -> None:
        art = _make_article()
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.source_type, "newsapi_ai")

    def test_body_truncated_at_2000(self) -> None:
        art = _make_article(body="x" * 5000)
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(len(result.raw_content or ""), 2000)

    def test_none_concepts_handled(self) -> None:
        art = _make_article(concepts=None)
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, [])

    def test_malformed_concept_label_handled(self) -> None:
        """Concept with missing/None label dict shouldn't blow up."""
        art = _make_article(concepts=[{"label": None}, {}])
        result = _article_to_normalized(art, cutoff=_CUTOFF)
        assert result is not None
        self.assertEqual(result.stock_tags, [])


if __name__ == "__main__":
    unittest.main()
