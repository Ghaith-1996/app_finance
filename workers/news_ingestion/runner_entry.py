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
import socket
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit

from .schema import NormalizedArticle
from .upsert import _row_from_article

MANIFEST_VERSION = 1
# The Runner stores the manifest in one ConfigMap, whose data Kubernetes caps at 1 MiB.
MAX_MANIFEST_BYTES = 1_000_000
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


# Loopback and RFC1918 only. is_private is too broad: it also covers link-local (169.254.169.254
# cloud metadata), 0.0.0.0/::, documentation/benchmark ranges and IPv6 ULA, which includes AWS
# IPv6 metadata (fd00:ec2::254), so ULA endpoints are refused too.
LOCAL_NETWORKS = tuple(ipaddress.ip_network(network) for network in (
    "127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "::1/128",
))


def _is_local_address(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    # Judge an IPv4-mapped IPv6 host by the IPv4 address it actually reaches.
    if address.version == 6 and address.ipv4_mapped:
        address = address.ipv4_mapped
    return any(address in network for network in LOCAL_NETWORKS)


def _verified_local_addresses(url: str):
    """Return the parsed URL and every address its host reaches, all loopback/RFC1918.

    A local-looking name proves nothing (a dotless alias can resolve to a public
    address), so every resolved address must be local.
    """
    parsed = urlsplit(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "http" or not host or parsed.username or parsed.password:
        raise ValueError("Runner requires a local HTTP Supabase endpoint")

    try:
        addresses = [ipaddress.ip_address(host)]
    except ValueError:
        # The socket layer resolves integer/hex/octal forms (e.g. 134744072 -> 8.8.8.8).
        with contextlib.suppress(OSError):
            socket.inet_aton(host)
            raise ValueError("Runner refuses a noncanonical IPv4 Supabase host")
        allowed_names = {"localhost", "host.docker.internal", "gateway.docker.internal"}
        if host not in allowed_names and "." in host and not host.endswith(".docker.internal"):
            raise ValueError("Runner refuses a nonlocal Supabase URL")
        try:
            infos = socket.getaddrinfo(host, parsed.port or 80, type=socket.SOCK_STREAM)
        except OSError as exc:
            raise ValueError("Runner cannot resolve the Supabase host") from exc
        addresses = list(dict.fromkeys(ipaddress.ip_address(info[4][0]) for info in infos))
    if not addresses or not all(_is_local_address(address) for address in addresses):
        raise ValueError("Runner refuses a nonlocal Supabase URL")
    return parsed, addresses


def pin_local_supabase_url(url: str, timeout: float) -> str:
    """Return url with its host replaced by a verified loopback/RFC1918 address.

    The client connects to a checked address instead of resolving the name again.
    Like socket.create_connection, it falls back across the name's answers in
    resolver order (localhost: ::1, then 127.0.0.1 for an IPv4-only listener),
    but only across the verified ones; the probe is a bare TCP connect, no request.
    """
    parsed, addresses = _verified_local_addresses(url)
    chosen = addresses[0]
    if len(addresses) > 1:
        for address in addresses:
            try:
                with socket.create_connection((str(address), parsed.port or 80), timeout=timeout):
                    chosen = address
                    break
            except OSError:
                continue
        # None accepted: keep the first, so the client reports the usual connection error.

    pinned = str(chosen)
    if chosen.version == 6:
        pinned = f"[{pinned}]"
    if parsed.port is not None:
        pinned = f"{pinned}:{parsed.port}"
    return parsed._replace(netloc=pinned).geturl()


def validate_local_supabase_url(url: str) -> str:
    """Fail closed when a runner accidentally receives a hosted Supabase URL."""
    _verified_local_addresses(url)
    return url


def make_local_client():
    if os.environ.get("PULSEFOLIO_RUNNER_LOCAL") != "1":
        raise ValueError("PULSEFOLIO_RUNNER_LOCAL=1 is required for database writes")
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not key:
        raise ValueError("Missing local SUPABASE_SERVICE_ROLE_KEY")
    import httpx
    from postgrest.constants import DEFAULT_POSTGREST_CLIENT_TIMEOUT
    from supabase import ClientOptions, create_client

    url = pin_local_supabase_url(url, DEFAULT_POSTGREST_CLIENT_TIMEOUT)
    # Redirects and inherited proxies can send credentials outside the validated local endpoint.
    http_client = httpx.Client(
        follow_redirects=False, trust_env=False, timeout=DEFAULT_POSTGREST_CLIENT_TIMEOUT
    )
    return create_client(url, key, options=ClientOptions(httpx_client=http_client))


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
            encoded = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
            size = len(encoded.encode("utf-8"))
            if size > MAX_MANIFEST_BYTES:
                logger.error("Manifest is %s bytes; limit is %s. Lower --max-articles.",
                             size, MAX_MANIFEST_BYTES)
                raise ValueError("Manifest exceeds the ConfigMap size limit")
            print(encoded, flush=True)
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
