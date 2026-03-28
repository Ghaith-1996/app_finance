"""HTTP/error handling tests for the NewsCatcher fetcher.

Run from repo root:
  python -m unittest workers.news_ingestion.tests.test_newscatcher_http_errors
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from workers.news_ingestion.fetchers.newscatcher_fetcher import fetch_newscatcher_news


class _FakeResponse:
    def __init__(self, *, status_code: int, payload=None, ok: bool | None = None):
        self.status_code = status_code
        self._payload = payload
        self.ok = (200 <= status_code < 300) if ok is None else ok

    def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


class TestNewsCatcherHttpErrors(unittest.TestCase):
    def setUp(self) -> None:
        self._original_key = os.environ.get("NEWSCATCHER_API_KEY")
        os.environ["NEWSCATCHER_API_KEY"] = "super-secret-newscatcher-key"

    def tearDown(self) -> None:
        if self._original_key is None:
            os.environ.pop("NEWSCATCHER_API_KEY", None)
        else:
            os.environ["NEWSCATCHER_API_KEY"] = self._original_key

    @patch("workers.news_ingestion.fetchers.newscatcher_fetcher.requests.post")
    def test_success_sets_accept_header_and_preserves_shape(self, post_mock) -> None:
        post_mock.return_value = _FakeResponse(
            status_code=200,
            payload={"status": "ok", "articles": []},
        )

        bundle = fetch_newscatcher_news(lookback_hours=24, max_articles=5)

        self.assertEqual(bundle.outcome, "empty_window")
        self.assertEqual(bundle.articles, [])
        headers = post_mock.call_args.kwargs["headers"]
        self.assertEqual(headers["x-api-token"], "super-secret-newscatcher-key")
        self.assertEqual(headers["Accept"], "application/json")
        self.assertEqual(headers["Content-Type"], "application/json")

    @patch("workers.news_ingestion.fetchers.newscatcher_fetcher.requests.post")
    def test_json_error_surfaces_provider_message(self, post_mock) -> None:
        post_mock.return_value = _FakeResponse(
            status_code=401,
            payload={
                "message": "x-api-token header is missing",
                "status": "Unauthorized",
                "status_code": 401,
            },
            ok=False,
        )

        bundle = fetch_newscatcher_news(lookback_hours=24, max_articles=5)

        self.assertEqual(bundle.outcome, "failed")
        self.assertIsNotNone(bundle.error)
        self.assertIn("401", bundle.error)
        self.assertIn("x-api-token header is missing", bundle.error)
        self.assertNotIn("super-secret-newscatcher-key", bundle.error)

    @patch("workers.news_ingestion.fetchers.newscatcher_fetcher.requests.post")
    def test_non_json_error_uses_safe_fallback(self, post_mock) -> None:
        post_mock.return_value = _FakeResponse(
            status_code=502,
            payload=ValueError("not json"),
            ok=False,
        )

        bundle = fetch_newscatcher_news(lookback_hours=24, max_articles=5)

        self.assertEqual(bundle.outcome, "failed")
        self.assertIsNotNone(bundle.error)
        self.assertIn("HTTP 502 from NewsCatcher search", bundle.error)
        self.assertNotIn("not json", bundle.error)
        self.assertNotIn("super-secret-newscatcher-key", bundle.error)


if __name__ == "__main__":
    unittest.main()
