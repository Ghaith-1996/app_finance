"""Contract tests for the local Kubernetes runner entrypoints.

These isolate deterministic partitioning, serialization and output boundaries.
A real Supabase/Kubernetes integration run is still required before release.
"""
from __future__ import annotations

import contextlib
import io
import json
import os
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from workers.news_ingestion.runner_entry import (
    MANIFEST_VERSION,
    article_from_dict,
    article_to_dict,
    process_manifest,
    partition_articles,
    validate_local_supabase_url,
    main,
)
from workers.news_ingestion.schema import NormalizedArticle


def sample_article(external_id: str) -> NormalizedArticle:
    return NormalizedArticle(
        source_type="gnews",
        external_id=external_id,
        headline=f"Headline {external_id}",
        url=f"https://example.org/{external_id}",
        published_at=datetime(2026, 10, 10, tzinfo=timezone.utc),
        source="Test",
        stock_tags=["MSFT"],
        category_hint="other",
        raw_content="Test article text",
        metadata={"test": True},
    )


class RunnerContractTests(unittest.TestCase):
    def test_manifest_round_trip_preserves_article(self):
        article = sample_article("a")
        restored = article_from_dict(article_to_dict(article))
        self.assertEqual(restored, article)

    def test_partitions_are_disjoint_and_complete(self):
        articles = [article_to_dict(sample_article(str(i))) for i in range(13)]
        groups = [partition_articles(articles, index, 5) for index in range(5)]
        keys = [[article["external_id"] for article in group] for group in groups]
        self.assertEqual(sorted(key for group in keys for key in group),
                         sorted(str(i) for i in range(13)))
        self.assertEqual(len({key for group in keys for key in group}), 13)
        self.assertEqual(keys[0], ["0", "5", "10"])

    def test_invalid_partition_index_is_rejected(self):
        with self.assertRaises(ValueError):
            partition_articles([], 3, 3)

    def test_cloud_supabase_url_rejected(self):
        with self.assertRaises(ValueError):
            validate_local_supabase_url("https://production.supabase.co")
        validate_local_supabase_url("http://host.docker.internal:54321")
        validate_local_supabase_url("http://supabase_kong_app_finance:8000")

    def test_discover_stdout_is_exactly_one_json_document(self):
        manifest = {"version": MANIFEST_VERSION, "provider_set": "current",
                    "sources": {"gnews": {"outcome": "success"}},
                    "articles": [article_to_dict(sample_article("one"))]}
        out = io.StringIO()
        err = io.StringIO()
        with patch("workers.news_ingestion.runner_entry.discover", return_value=manifest), \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            result = main(["discover", "--sources", "gnews"])
        self.assertEqual(result, 0)
        self.assertEqual(json.loads(out.getvalue()), manifest)
        self.assertEqual(out.getvalue().count("\n"), 1)

    def test_process_rejects_wrong_manifest_version_before_connecting(self):
        with tempfile.TemporaryDirectory() as folder:
            manifest_path = Path(folder) / "manifest.json"
            manifest_path.write_text(json.dumps({"version": 99, "articles": []}))
            with patch("workers.news_ingestion.runner_entry.make_local_client") as client:
                with self.assertRaises(ValueError):
                    process_manifest(manifest_path, index=0, workers=2)
                client.assert_not_called()


if __name__ == "__main__":
    unittest.main()
