"""Audit H1: global scans read every row even when the server caps each response.

Run from repo root:
  python -m unittest workers.news_ingestion.tests.test_pagination
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from workers.news_ingestion.pagination import fetch_all_rows  # noqa: E402


class _CappedQuery:
    def __init__(self, rows, cap):
        self._rows, self._cap, self._range = rows, cap, (0, len(rows))

    def select(self, _columns):
        return self

    def order(self, _column):
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def execute(self):
        start, end = self._range
        return type("Result", (), {"data": self._rows[start : min(end + 1, start + self._cap)]})()


class _CappedClient:
    def __init__(self, rows, cap):
        self._rows, self._cap = rows, cap

    def table(self, _name):
        return _CappedQuery(self._rows, self._cap)


class TestFetchAllRows(unittest.TestCase):
    def test_reads_past_a_server_cap_smaller_than_the_page(self):
        rows = [{"id": i, "symbol": f"S{i}"} for i in range(2345)]
        result = fetch_all_rows(_CappedClient(rows, cap=300), "holdings", "symbol", page_size=1000)
        self.assertEqual(len(result), 2345)
        self.assertEqual(result[-1]["symbol"], "S2344")

    def test_empty_table(self):
        self.assertEqual(fetch_all_rows(_CappedClient([], cap=1000), "holdings", "symbol"), [])


if __name__ == "__main__":
    unittest.main()
