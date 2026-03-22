"""Unit tests for NewsAPI article identity → external_id.

Run from repo root:
  python -m unittest workers.news_ingestion.tests.test_newsapi_external_id
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

# Repo root (parent of `workers/`)
_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from workers.news_ingestion.fetchers.newsapi_fetcher import stable_newsapi_external_id


class TestStableNewsapiExternalId(unittest.TestCase):
    def test_uses_url_hash_when_present(self) -> None:
        a = {
            "title": "Same title",
            "url": "https://example.com/story/1",
            "publishedAt": "2025-01-01T12:00:00Z",
            "source": {"name": "Reuters"},
        }
        b = {**a, "publishedAt": "2025-01-02T12:00:00Z"}
        id_a = stable_newsapi_external_id(a)
        id_b = stable_newsapi_external_id(b)
        self.assertTrue(id_a.startswith("newsapi_"))
        self.assertEqual(id_a, id_b)

    def test_fallback_without_url(self) -> None:
        a = {
            "title": "Unique headline",
            "url": "",
            "publishedAt": "2025-03-01T10:00:00Z",
            "source": {"name": "Bloomberg"},
        }
        b = {**a, "title": "Other headline"}
        self.assertNotEqual(stable_newsapi_external_id(a), stable_newsapi_external_id(b))


if __name__ == "__main__":
    unittest.main()
