"""Contract tests for the local Kubernetes runner entrypoints.

These isolate deterministic partitioning, serialization and output boundaries.
A real Supabase/Kubernetes integration run is still required before release.
"""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
import shutil
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
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

# Not find_spec("supabase"): the repo's SQL supabase/ folder is a namespace package.
needs_client = unittest.skipUnless(importlib.util.find_spec("postgrest"), "supabase client not installed")


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

    def test_noncanonical_public_ipv4_hosts_rejected(self):
        # Each of these is resolved by the socket layer to public 8.8.8.8.
        for url in ("http://134744072:54321", "http://0x08080808:54321",
                    "http://0x8.0x8.0x8.0x8:54321", "http://[::ffff:8.8.8.8]:54321"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_local_supabase_url(url)

    def test_canonical_local_hosts_still_accepted(self):
        for url in ("http://localhost:54321", "http://127.0.0.1:54321", "http://[::1]:54321",
                    "http://172.18.0.5:8000", "http://gateway.docker.internal:54321"):
            with self.subTest(url=url):
                self.assertEqual(validate_local_supabase_url(url), url)

    def test_discover_refuses_manifest_over_configmap_limit(self):
        # Under the limit in characters, over it in UTF-8 bytes (ConfigMap counts bytes).
        article = article_to_dict(sample_article("big"))
        article["raw_content"] = "é" * 600_000
        manifest = {"version": MANIFEST_VERSION, "provider_set": "current",
                    "sources": {"gnews": {"outcome": "success"}}, "articles": [article]}
        out = io.StringIO()
        err = io.StringIO()
        with patch("workers.news_ingestion.runner_entry.discover", return_value=manifest), \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            result = main(["discover", "--sources", "gnews"])
        self.assertEqual(result, 1)
        self.assertEqual(out.getvalue(), "")

    def _serve(self, handler):
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return f"http://127.0.0.1:{server.server_address[1]}"

    def _process_against(self, url):
        folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, folder, True)
        manifest_path = Path(folder) / "manifest.json"
        manifest_path.write_text(json.dumps({"version": MANIFEST_VERSION,
                                             "articles": [article_to_dict(sample_article("r"))]}))
        env = {"PULSEFOLIO_RUNNER_LOCAL": "1", "SUPABASE_URL": url,
               "SUPABASE_SERVICE_ROLE_KEY": "local-test-key"}
        with patch.dict(os.environ, env):
            return process_manifest(manifest_path, index=0, workers=1)

    @needs_client
    def test_insert_does_not_follow_redirects_with_service_role_key(self):
        from postgrest.exceptions import APIError

        # Real pinned client over HTTP; both statuses preserve the insert on redirect.
        leaked = []

        class Target(BaseHTTPRequestHandler):
            def do_POST(self):
                leaked.append(dict(self.headers))
                self.send_response(201)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b"[]")

            def log_message(self, *args):
                pass

        target = self._serve(Target)

        for status in (307, 308):
            with self.subTest(status=status):
                seen = []

                class Redirector(Target):
                    def do_POST(self):
                        seen.append(self.headers.get("apikey"))
                        self.send_response(status)
                        self.send_header("Location", target + self.path)
                        self.send_header("Content-Length", "0")
                        self.end_headers()

                with self.assertRaises(APIError) as error:
                    self._process_against(self._serve(Redirector))
                self.assertEqual(error.exception.code, status)
                self.assertEqual(seen, ["local-test-key"])
                self.assertEqual(leaked, [], "insert and service-role key replayed to the redirect target")

    @needs_client
    def test_insert_still_reaches_local_endpoint_with_key(self):
        seen = []

        class Local(BaseHTTPRequestHandler):
            def do_POST(self):
                seen.append((self.path, self.headers.get("apikey"), self.headers.get("Authorization")))
                self.send_response(201)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b"[]")

            def log_message(self, *args):
                pass

        summary = self._process_against(self._serve(Local))
        self.assertEqual(summary["inserted"], 1)
        self.assertEqual(seen, [("/rest/v1/news_items", "local-test-key", "Bearer local-test-key")])

    @needs_client
    def test_local_insert_ignores_inherited_proxies(self):
        seen = []
        proxied = []

        class Local(BaseHTTPRequestHandler):
            requests = seen

            def do_POST(self):
                self.requests.append((self.path, self.headers.get("apikey"),
                                      self.headers.get("Authorization")))
                self.send_response(201)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b"[]")

            def log_message(self, *args):
                pass

        class Proxy(Local):
            requests = proxied

        local_url = self._serve(Local)
        proxy_url = self._serve(Proxy)
        for variable in ("HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
            with self.subTest(variable=variable):
                seen.clear()
                proxied.clear()
                # No ambient proxy bypass may hide the credential leak.
                with patch.dict(os.environ, {variable: proxy_url, "NO_PROXY": ""}, clear=True):
                    summary = self._process_against(local_url)
                self.assertEqual(proxied, [], "service-role request reached the inherited proxy")
                self.assertEqual(summary["inserted"], 1)
                self.assertEqual(seen, [("/rest/v1/news_items", "local-test-key",
                                         "Bearer local-test-key")])

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
