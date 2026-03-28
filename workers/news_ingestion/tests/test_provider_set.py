"""
Unit tests for provider-set selection in main.py.

Verifies that ``--provider-set current`` and ``--provider-set candidate``
activate the correct source registries and that ``run()`` honours the
``provider_set`` argument.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from workers.news_ingestion.main import (
    CANDIDATE_SOURCE_REGISTRY,
    CANDIDATE_VALID_SOURCES,
    PROVIDER_SETS,
    SOURCE_REGISTRY,
    VALID_SOURCES,
    _get_registry,
    _get_valid_sources,
    preflight_check,
    run,
)


class TestRegistryConstants(unittest.TestCase):
    """SOURCE_REGISTRY and CANDIDATE_SOURCE_REGISTRY have the expected keys."""

    def test_current_keys(self):
        self.assertEqual(set(SOURCE_REGISTRY), {"edgar", "newsapi", "gnews"})

    def test_candidate_keys(self):
        self.assertEqual(
            set(CANDIDATE_SOURCE_REGISTRY),
            {"edgar", "newsapi_ai", "gnews", "newscatcher"},
        )

    def test_valid_sources_matches_registry(self):
        self.assertEqual(VALID_SOURCES, frozenset(SOURCE_REGISTRY))

    def test_candidate_valid_sources_matches_registry(self):
        self.assertEqual(CANDIDATE_VALID_SOURCES, frozenset(CANDIDATE_SOURCE_REGISTRY))

    def test_provider_sets_contains_both(self):
        self.assertIn("current", PROVIDER_SETS)
        self.assertIn("candidate", PROVIDER_SETS)
        self.assertIs(PROVIDER_SETS["current"], SOURCE_REGISTRY)
        self.assertIs(PROVIDER_SETS["candidate"], CANDIDATE_SOURCE_REGISTRY)

    def test_edgar_shared_between_sets(self):
        """EDGAR config object is the same instance in both registries."""
        self.assertIs(
            SOURCE_REGISTRY["edgar"],
            CANDIDATE_SOURCE_REGISTRY["edgar"],
        )


class TestGetRegistry(unittest.TestCase):
    """_get_registry selects the right registry for a provider-set name."""

    def test_current(self):
        self.assertIs(_get_registry("current"), SOURCE_REGISTRY)

    def test_candidate(self):
        self.assertIs(_get_registry("candidate"), CANDIDATE_SOURCE_REGISTRY)

    def test_unknown_falls_back_to_current(self):
        self.assertIs(_get_registry("nonexistent"), SOURCE_REGISTRY)

    def test_get_valid_sources_current(self):
        self.assertEqual(_get_valid_sources("current"), frozenset(SOURCE_REGISTRY))

    def test_get_valid_sources_candidate(self):
        self.assertEqual(
            _get_valid_sources("candidate"),
            frozenset(CANDIDATE_SOURCE_REGISTRY),
        )


class TestCandidateSourceProperties(unittest.TestCase):
    """Candidate-only sources have the correct config flags."""

    def test_newsapi_ai_accepts_queries(self):
        cfg = CANDIDATE_SOURCE_REGISTRY["newsapi_ai"]
        self.assertTrue(cfg.accepts_queries)
        self.assertFalse(cfg.uses_tickers)
        self.assertFalse(cfg.accepts_gnews_queries)

    def test_newscatcher_accepts_queries(self):
        cfg = CANDIDATE_SOURCE_REGISTRY["newscatcher"]
        self.assertTrue(cfg.accepts_queries)
        self.assertFalse(cfg.uses_tickers)
        self.assertFalse(cfg.accepts_gnews_queries)

    def test_gnews_accepts_gnews_queries_in_candidate(self):
        cfg = CANDIDATE_SOURCE_REGISTRY["gnews"]
        self.assertTrue(cfg.accepts_gnews_queries)
        self.assertFalse(cfg.accepts_queries)

    def test_newsapi_ai_env_var(self):
        self.assertEqual(CANDIDATE_SOURCE_REGISTRY["newsapi_ai"].env_var, "NEWSAPI_AI_API_KEY")

    def test_newscatcher_env_var(self):
        self.assertEqual(CANDIDATE_SOURCE_REGISTRY["newscatcher"].env_var, "NEWSCATCHER_API_KEY")


class TestRunProviderSet(unittest.TestCase):
    """run() passes provider_set through to registry selection."""

    @patch("workers.news_ingestion.main.prepare_worker_runtime")
    @patch("workers.news_ingestion.main.upsert_articles")
    @patch("workers.news_ingestion.main.spawn_extraction_worker")
    def test_candidate_run_uses_candidate_sources(self, mock_spawn, mock_upsert, mock_prep):
        """When provider_set='candidate', the result dict contains candidate source keys."""
        from workers.news_ingestion.fetchers.result import SourceFetchBundle

        empty_bundle = SourceFetchBundle(articles=[], outcome="empty_window")
        empty_stats = MagicMock(
            fetched=0, inserted=0, skipped=0, failed=0,
            inserted_ids=[], to_dict=lambda: {"fetched": 0, "inserted": 0, "skipped": 0, "failed": 0},
        )
        mock_upsert.return_value = empty_stats

        with patch("workers.news_ingestion.main._fetch_source", return_value=empty_bundle):
            result = run(
                ["AAPL"],
                provider_set="candidate",
                lookback_hours=24,
                max_articles_per_source=5,
            )

        # Result must contain all candidate keys
        for key in ("edgar", "newsapi_ai", "gnews", "newscatcher"):
            self.assertIn(key, result, f"Missing candidate key '{key}' in run() result")

        # Result must NOT contain current-only keys
        self.assertNotIn("newsapi", result)

    @patch("workers.news_ingestion.main.prepare_worker_runtime")
    @patch("workers.news_ingestion.main.upsert_articles")
    @patch("workers.news_ingestion.main.spawn_extraction_worker")
    def test_current_run_uses_current_sources(self, mock_spawn, mock_upsert, mock_prep):
        """When provider_set='current', the result dict contains current source keys."""
        from workers.news_ingestion.fetchers.result import SourceFetchBundle

        empty_bundle = SourceFetchBundle(articles=[], outcome="empty_window")
        empty_stats = MagicMock(
            fetched=0, inserted=0, skipped=0, failed=0,
            inserted_ids=[], to_dict=lambda: {"fetched": 0, "inserted": 0, "skipped": 0, "failed": 0},
        )
        mock_upsert.return_value = empty_stats

        with patch("workers.news_ingestion.main._fetch_source", return_value=empty_bundle):
            result = run(
                ["AAPL"],
                provider_set="current",
                lookback_hours=24,
                max_articles_per_source=5,
            )

        for key in ("edgar", "newsapi", "gnews"):
            self.assertIn(key, result, f"Missing current key '{key}' in run() result")

        # Must NOT contain candidate-only keys
        self.assertNotIn("newsapi_ai", result)
        self.assertNotIn("newscatcher", result)


class TestPreflightProviderSet(unittest.TestCase):
    """preflight_check respects the provider_set argument."""

    @patch("workers.news_ingestion.main.configure_worker_environment", return_value="/tmp")
    def test_candidate_preflight_checks_candidate_env_vars(self, _):
        result = preflight_check(provider_set="candidate")
        check_names = {c["name"] for c in result["checks"]}
        self.assertIn("NEWSAPI_AI_API_KEY", check_names)
        self.assertIn("NEWSCATCHER_API_KEY", check_names)
        # newsapi's env var should NOT be checked
        self.assertNotIn("NEWSAPI_KEY", check_names)

    @patch("workers.news_ingestion.main.configure_worker_environment", return_value="/tmp")
    def test_current_preflight_checks_current_env_vars(self, _):
        result = preflight_check(provider_set="current")
        check_names = {c["name"] for c in result["checks"]}
        self.assertIn("NEWSAPI_KEY", check_names)
        # candidate-only vars should NOT be checked
        self.assertNotIn("NEWSAPI_AI_API_KEY", check_names)
        self.assertNotIn("NEWSCATCHER_API_KEY", check_names)


if __name__ == "__main__":
    unittest.main()
