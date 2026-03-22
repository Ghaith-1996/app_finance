"""Unit tests for GNews article identity -> external_id.

Run from repo root:
  python -m unittest workers.news_ingestion.tests.test_gnews_external_id
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from workers.news_ingestion.fetchers.gnews_fetcher import _article_to_normalized, stable_gnews_external_id


class TestStableGnewsExternalId(unittest.TestCase):
    def test_prefers_url_hash_when_present(self) -> None:
        article = {
            "title": "Same title",
            "url": "https://example.com/story/1",
            "published date": "Wed, 01 Jan 2025 12:00:00 GMT",
        }
        newer_copy = {**article, "published date": "Thu, 02 Jan 2025 12:00:00 GMT"}
        self.assertEqual(stable_gnews_external_id(article), stable_gnews_external_id(newer_copy))

    def test_fallback_without_url_uses_durable_fields(self) -> None:
        a = {
            "title": "Story title",
            "published date": "Sat, 01 Mar 2025 10:00:00 GMT",
            "publisher": "Reuters",
        }
        b = {**a, "title": "Updated title"}
        self.assertNotEqual(stable_gnews_external_id(a), stable_gnews_external_id(b))

    def test_normalization_preserves_bucket_and_query_metadata(self) -> None:
        article = {
            "title": "Apple shares rise on data center demand",
            "url": "https://example.com/story/3",
            "published date": "Sat, 01 Mar 2025 10:00:00 GMT",
            "description": "Apple stock gained after new AI infrastructure commentary.",
            "publisher": "Reuters",
        }

        normalized = _article_to_normalized(
            article,
            cutoff=datetime(2025, 3, 1, 0, 0, tzinfo=timezone.utc),
            bucket="targeted_portfolio_refresh",
            query="\"Apple Inc\" AAPL stock",
        )

        self.assertIsNotNone(normalized)
        assert normalized is not None
        self.assertEqual(normalized.source_type, "gnews")
        self.assertEqual(normalized.source, "Reuters")
        self.assertEqual(normalized.raw_content, article["description"])
        self.assertEqual(normalized.metadata["gnews_fetch_buckets"], ["targeted_portfolio_refresh"])
        self.assertEqual(normalized.metadata["gnews_target_queries"], ["\"Apple Inc\" AAPL stock"])


if __name__ == "__main__":
    unittest.main()
