"""Focused tests for worker preflight diagnostics.

Run from repo root:
  python -m unittest workers.news_ingestion.tests.test_preflight
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

from workers.news_ingestion.main import preflight_check


class TestPreflight(unittest.TestCase):
    @patch("workers.news_ingestion.main.configure_worker_environment", return_value="D:/tmp/.edgar_data")
    @patch("workers.news_ingestion.main.importlib.import_module")
    def test_gnews_is_ready_without_api_key_when_package_is_installed(self, mock_import_module, _mock_configure_worker_environment) -> None:
        mock_import_module.return_value = object()

        with patch.dict(
            os.environ,
            {
                "SUPABASE_SERVICE_ROLE_KEY": "service-role",
                "EDGAR_IDENTITY": "Jane Doe jane@example.com",
                "NEWSAPI_KEY": "newsapi-key",
            },
            clear=True,
        ):
            result = preflight_check()

        self.assertTrue(result["ok"])
        checks = {check["name"]: check for check in result["checks"]}
        self.assertTrue(checks["EDGAR_LOCAL_DATA_DIR"]["ok"])
        self.assertTrue(checks["newsapi-python"]["ok"])
        self.assertTrue(checks["gnews"]["ok"])
        self.assertNotIn("GNEWS_API_KEY", checks)


if __name__ == "__main__":
    unittest.main()
