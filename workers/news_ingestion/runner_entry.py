"""Local-only manifest discovery and deterministic Kubernetes Indexed Job processing.

Intentionally independent of the production cron entrypoints. This module
reuses the existing fetchers, normalized article model, and row mapper.
It never calls the deployed Next.js cron routes or writes to a cloud Supabase.
"""
from __future__ import annotations

import argparse
import contextlib
import ipaddress
import json
import logging
import os
import signal
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

from .schema import NormalizedArticle
from .upsert import _row_from_article

MANIFEST_VERSION = 1
logger = logging.getLogger(__name__)


def article_to_dict(article: NormalizedArticle) -> dict:
    return {
        "source_type": article.source_type,
        "external_id": article.external_id,
        "headline": article.headline,
        "url": article.url,
        "published_at": article.published_at.isoformat(),
        "source": article.source,
        "stock_tags": article.stock_tags,
        "category_hint": article.category_hint,
        "raw_content": article.raw_content,
        "metadata": article.metadata,
    }


def article_from_dict(row: dict) -> NormalizedArticle:
    if not isinstance(row, dict):
        raise ValueError("Manifest article must be an object")
    required = ("source_type", "external_id", "headline", "source", "published_at")
    if any(not isinstance(row.get(key), str) or not row[key] for key in required):
        raise ValueError("Manifest article has missing or invalid required fields")
    try:
        published_at = datetime.fromisoformat(row["published_at"].replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise ValueError("Manifest article has invalid published_at") from exc
    if published_at.tzinfo is None:
        raise ValueError("Manifest article must have timezone-aware published_at")
    tags = row.get("stock_tags", [])
    metadata = row.get("metadata", {})
    if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
        raise ValueError("Manifest stock_tags must be an array of strings")
    if not isinstance(metadata, dict):
        raise ValueError("Manifest metadata must be an object")
    return NormalizedArticle(
        source_type=row["source_type"],
        external_id=row["external_id"],
        headline=row["headline"],
        url=row.get("url"),
        published_at=published_at,
        source=row["source"],
        stock_tags=tags,
        category_hint=row.get("category_hint", "other"),
        raw_content=row.get("raw_content"),
        metadata=metadata,
    )


def partition_articles(articles: list, index: int, workers: int) -> list:
    """Each item belongs to exactly one Indexed Job completion index."""
    if workers < 1 or index < 0 or index >= workers:
        raise ValueError("Worker index must be within [0, workers)")
    return articles[index::workers]


def discover(
    sources: list[str],
    *,
    tickers: list[str] | None = None,
    lookback_hours: int = 24,
    max_articles: int = 50,
    provider_set: str = "current",
) -> dict:
    """Fetch source lists exactly once and return a stable, database-free JSON manifest."""
    from .bootstrap import prepare_worker_runtime
    from .main import _fetch_source, _get_registry

    if not 1 <= lookback_hours <= 720 or not 1 <= max_articles <= 500:
        raise ValueError("Invalid lookback-hours or max-articles")
    if provider_set not in ("current", "candidate"):
        raise ValueError("Unknown provider set")

    registry = _get_registry(provider_set)
    chosen = list(dict.fromkeys(source.strip().lower() for source in sources if source.strip()))
    if not chosen:
        raise ValueError("At least one news source is required")
    unknown = [source for source in chosen if source not in registry]
    if unknown:
        raise ValueError(f"Unknown news sources: {', '.join(unknown)}")

    symbols = list(dict.fromkeys(symbol.strip().upper() for symbol in (tickers or []) if symbol.strip()))
    if "edgar" in chosen and not symbols:
        raise ValueError("EDGAR requires --tickers")

    prepare_worker_runtime()
    items: dict[tuple[str, str], NormalizedArticle] = {}
    outcomes: dict[str, dict] = {}
    failures = 0
    for source in chosen:
        config = registry[source]
        bundle = _fetch_source(
            config,
            tickers=symbols,
            gnews_queries=None,
            queries=None,
            lookback_hours=lookback_hours,
            max_articles_per_source=max_articles,
        )
        outcomes[source] = {"outcome": bundle.outcome, "fetched": bundle.fetched}
        if bundle.outcome == "failed":
            failures += 1
            logger.warning("Source %s failed during discovery", source)
        for article in bundle.articles:
            items.setdefault((article.source_type, article.external_id), article)

    if failures == len(chosen):
        raise RuntimeError("All selected news sources failed")

    ordered = [article_to_dict(items[key]) for key in sorted(items)]
    return {
        "version": MANIFEST_VERSION,
        "provider_set": provider_set,
        "sources": outcomes,
        "articles": ordered,
    }


def validate_local_supabase_url(url: str) -> str:
    """Fail closed when a runner accidentally receives a hosted Supabase URL."""
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "http" or not host or parsed.username or parsed.password:
        raise ValueError("Runner requires a local HTTP Supabase endpoint")

    allowed_names = {"localhost", "127.0.0.1", "host.docker.internal", "gateway.docker.internal"}
    is_local_name = host in allowed_names or "." not in host or host.endswith(".docker.internal")
    is_private_ip = False
    try:
        address = ipaddress.ip_address(host)
        is_private_ip = address.is_private or address.is_loopback
    except ValueError:
        pass
    if not is_local_name and not is_private_ip:
        raise ValueError("Runner refuses a nonlocal Supabase URL")
    return url


def make_local_client():
    if os.environ.get("PULSEFOLIO_RUNNER_LOCAL") != "1":
        raise ValueError("PULSEFOLIO_RUNNER_LOCAL=1 is required for database writes")
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not key:
        raise ValueError("Missing local SUPABASE_SERVICE_ROLE_KEY")
    validate_local_supabase_url(url)
    from supabase import create_client

    return create_client(url, key)


def process_manifest(path: Path, *, index: int, workers: int) -> dict:
    """Insert this index's partition, safely skipping existing source article keys.

    Insert first to avoid check-then-insert races. The existing partial unique
    index on (source_type, external_id) prevents duplicates; a 23505 is only
    treated as an existing article after confirming its matching key in DB.
    We intentionally never overwrite the AI enrichment columns of an old row.
    """
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("version") != MANIFEST_VERSION:
        raise ValueError("Unsupported manifest version")
    raw = payload.get("articles")
    if not isinstance(raw, list):
        raise ValueError("Manifest articles must be an array")
    all_articles = [article_from_dict(item) for item in raw]
    selected = partition_articles(all_articles, index, workers)
    if not selected:
        return {"index": index, "workers": workers, "assigned": 0, "inserted": 0, "skipped": 0}

    client = make_local_client()
    inserted = 0
    skipped = 0
    for article in selected:
        try:
            client.table("news_items").insert(_row_from_article(article)).execute()
            inserted += 1
        except Exception as exc:
            if str(getattr(exc, "code", "")) != "23505":
                raise
            existing = (
                client.table("news_items")
                .select("id")
                .eq("source_type", article.source_type)
                .eq("external_id", article.external_id)
                .limit(1)
                .execute()
            )
            if not existing.data:
                raise
            skipped += 1
    logger.info("Worker %s completed: assigned=%s inserted=%s skipped=%s",
                index, len(selected), inserted, skipped)
    return {"index": index, "workers": workers,
            "assigned": len(selected), "inserted": inserted, "skipped": skipped}


def _exit_on_sigterm(signum, frame):
    logger.warning("Received SIGTERM; stopping worker")
    raise SystemExit(128 + signum)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Local Pulsefolio Runner adapter")
    commands = parser.add_subparsers(dest="command", required=True)

    discovery = commands.add_parser("discover", help="Emit exactly one JSON manifest to stdout")
    discovery.add_argument("--sources", default="gnews")
    discovery.add_argument("--tickers", default="")
    discovery.add_argument("--provider-set", choices=["current", "candidate"], default="current")
    discovery.add_argument("--lookback-hours", type=int, default=24)
    discovery.add_argument("--max-articles", type=int, default=50)

    processing = commands.add_parser("process", help="Process one Indexed Job completion")
    processing.add_argument("--manifest", type=Path, required=True)
    processing.add_argument("--index", type=int, default=None)
    processing.add_argument("--workers", type=int, required=True)

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)

    try:
        if args.command == "discover":
            # Third-party fetchers may print; stdout is exclusively the final JSON.
            with contextlib.redirect_stdout(sys.stderr):
                manifest = discover(
                    args.sources.split(","),
                    tickers=args.tickers.split(",") if args.tickers else [],
                    provider_set=args.provider_set,
                    lookback_hours=args.lookback_hours,
                    max_articles=args.max_articles,
                )
            print(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), flush=True)
            return 0

        raw_index = args.index if args.index is not None else os.environ.get("JOB_COMPLETION_INDEX")
        if raw_index is None:
            raise ValueError("Missing Kubernetes JOB_COMPLETION_INDEX")
        # As container PID 1, Python ignores SIGTERM unless a handler exists; without it a
        # deleted/cancelled Pod keeps inserting until SIGKILL. Inserts are idempotent, so
        # stopping mid-partition is safe and the retried index resumes.
        signal.signal(signal.SIGTERM, _exit_on_sigterm)
        summary = process_manifest(args.manifest, index=int(raw_index), workers=args.workers)
        print(json.dumps(summary, separators=(",", ":")), flush=True)
        return 0
    except Exception as exc:
        logger.error("Runner %s failed: %s", args.command, type(exc).__name__)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
