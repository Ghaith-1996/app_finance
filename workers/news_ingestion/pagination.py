"""Read every row of a table in stable pages (audit H1).

PostgREST caps each response at the project's max-rows setting, so a single select silently
drops rows above it. The offset advances by the rows actually returned and the scan stops only on
an empty page, so a server cap smaller than ``page_size`` cannot end it early.
"""

from __future__ import annotations

DEFAULT_PAGE_SIZE = 1000


def fetch_all_rows(client, table: str, columns: str, page_size: int = DEFAULT_PAGE_SIZE) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        page = (
            client.table(table)
            .select(columns)
            .order("id")
            .range(start, start + page_size - 1)
            .execute()
            .data
            or []
        )
        if not page:
            return rows
        rows.extend(page)
        start += len(page)
