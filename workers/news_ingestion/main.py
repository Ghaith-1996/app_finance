#!/usr/bin/env python3
"""
News ingestion worker: SEC filings via edgartools plus global market/business
headlines via NewsAPI and the gnews package, normalized into the shared article
schema, then upserted into Supabase news_items.

Invoked by Next.js routes or directly from the CLI.
"""

from __future__ import annotations

import argparse
import importlib
import json
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

try:
    from dotenv import load_dotenv

    env_path = Path(__file__).parent.parent.parent / ".env"
    load_dotenv(dotenv_path=env_path, override=False)
except ImportError:
    pass

from .bootstrap import configure_worker_environment, prepare_worker_runtime
from .extract_full_text import backfill_full_text, spawn_extraction_worker
from .fetchers.edgar_fetcher import fetch_edgar_news
from .fetchers.gnews_fetcher import fetch_gnews_news
from .fetchers.newsapi_fetcher import fetch_newsapi_news
from .fetchers.result import SourceFetchBundle
from .upsert import UpsertStats, upsert_articles

logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SourceConfig:
    key: str
    label: str
    fetcher: Callable[..., SourceFetchBundle]
    uses_tickers: bool = False
    accepts_gnews_queries: bool = False
    env_var: str | None = None
    env_error: str | None = None
    import_name: str | None = None
    import_label: str | None = None


SOURCE_REGISTRY: dict[str, SourceConfig] = {
    "edgar": SourceConfig(
        key="edgar",
        label="EDGAR",
        fetcher=fetch_edgar_news,
        uses_tickers=True,
        env_var="EDGAR_IDENTITY",
        env_error="Missing. Set to 'Full Name email@example.com' per SEC policy.",
        import_name="edgar",
        import_label="edgartools",
    ),
    "newsapi": SourceConfig(
        key="newsapi",
        label="NewsAPI",
        fetcher=fetch_newsapi_news,
        env_var="NEWSAPI_KEY",
        env_error="Missing. Required for NewsAPI global headlines.",
        import_name="newsapi",
        import_label="newsapi-python",
    ),
    "gnews": SourceConfig(
        key="gnews",
        label="GNews",
        fetcher=fetch_gnews_news,
        accepts_gnews_queries=True,
        import_name="gnews",
        import_label="gnews",
    ),
}

VALID_SOURCES = frozenset(SOURCE_REGISTRY)


def _empty_bundle(*, outcome: str = "skipped", error: str | None = None) -> SourceFetchBundle:
    return SourceFetchBundle(articles=[], outcome=outcome, error=error)


def _empty_stats() -> UpsertStats:
    return UpsertStats()


def _merge_source_row(stats: UpsertStats, bundle: SourceFetchBundle) -> dict:
    return {**stats.to_dict(), **bundle.to_dict()}


def _source_rows_from_maps(
    bundles: dict[str, SourceFetchBundle],
    stats: dict[str, UpsertStats] | None = None,
) -> dict[str, dict]:
    source_rows: dict[str, dict] = {}
    for key in SOURCE_REGISTRY:
        source_rows[key] = _merge_source_row(
            (stats or {}).get(key, _empty_stats()),
            bundles.get(key, _empty_bundle()),
        )
    return source_rows


def _label_for(key: str) -> str:
    config = SOURCE_REGISTRY.get(key)
    return config.label if config else key


def _labels_for(keys: list[str]) -> str:
    labels = [_label_for(key) for key in keys]
    if not labels:
        return "sources"
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]} and {labels[1]}"
    return f"{', '.join(labels[:-1])}, and {labels[-1]}"


def _outcome_human(outcome: str) -> str:
    return {
        "success": "returned headlines",
        "empty_window": "returned no items in the lookback window",
        "failed": "failed",
        "skipped": "was skipped",
    }.get(outcome, outcome)


def _all_rows_failed(stats: UpsertStats) -> bool:
    return stats.fetched > 0 and stats.inserted == 0 and stats.skipped == 0 and stats.failed >= stats.fetched


def preflight_check() -> dict:
    """Validate dependencies and config. Returns {ok: bool, checks: [...]}. Never raises."""
    checks: list[dict] = []

    try:
        data_path = configure_worker_environment()
        checks.append({
            "name": "EDGAR_LOCAL_DATA_DIR",
            "ok": True,
            "detail": data_path,
        })
    except Exception as exc:
        checks.append({
            "name": "EDGAR_LOCAL_DATA_DIR",
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
        })

    seen_imports: set[str] = set()
    for config in SOURCE_REGISTRY.values():
        if not config.import_name or not config.import_label:
            continue
        if config.import_label in seen_imports:
            continue
        try:
            importlib.import_module(config.import_name)
            checks.append({"name": config.import_label, "ok": True})
        except Exception as exc:
            checks.append({
                "name": config.import_label,
                "ok": False,
                "error": f"{type(exc).__name__}: {exc}",
            })
        seen_imports.add(config.import_label)

    try:
        importlib.import_module("supabase")
        checks.append({"name": "supabase", "ok": True})
    except Exception as exc:
        checks.append({
            "name": "supabase",
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
        })

    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    checks.append({
        "name": "SUPABASE_SERVICE_ROLE_KEY",
        "ok": bool(service_role_key),
        **({"error": "Missing. Required to bypass RLS for news ingestion."} if not service_role_key else {}),
    })

    for config in SOURCE_REGISTRY.values():
        if not config.env_var or not config.env_error:
            continue
        value = os.getenv(config.env_var, "").strip()
        checks.append({
            "name": config.env_var,
            "ok": bool(value),
            **({"error": config.env_error} if not value else {}),
        })

    all_ok = all(c["ok"] for c in checks)
    return {"ok": all_ok, "checks": checks}


def _fetch_source(
    config: SourceConfig,
    *,
    tickers: list[str],
    gnews_queries: list[str] | None,
    lookback_hours: int,
    max_articles_per_source: int,
) -> SourceFetchBundle:
    if config.uses_tickers:
        return config.fetcher(
            tickers,
            lookback_hours=lookback_hours,
            max_articles=max_articles_per_source,
        )
    if config.accepts_gnews_queries:
        return config.fetcher(
            lookback_hours=lookback_hours,
            max_articles=max_articles_per_source,
            queries=gnews_queries,
        )
    return config.fetcher(
        lookback_hours=lookback_hours,
        max_articles=max_articles_per_source,
    )


def _summarize_ingest(
    bundles: dict[str, SourceFetchBundle],
    stats: dict[str, UpsertStats],
    total_inserted: int,
    *,
    active_source_keys: list[str],
    lookback_hours: int = 24,
) -> tuple[str, str]:
    failed_sources = [key for key in active_source_keys if bundles[key].outcome == "failed"]

    if failed_sources and len(failed_sources) == len(active_source_keys):
        return (
            "failed",
            f"All active sources failed ({_labels_for(failed_sources)}). See per-source fetch_error details.",
        )

    if total_inserted > 0:
        parts = [f"Inserted {total_inserted} new row(s)."]
        for key in failed_sources:
            err = bundles[key].error or "Unknown fetch error"
            parts.append(f"{_label_for(key)} failed: {err}")
        status = "partial" if failed_sources else "success"
        return status, " ".join(parts)

    if active_source_keys and all(_all_rows_failed(stats[key]) for key in active_source_keys):
        return (
            "failed",
            "Fetches returned articles but every Supabase upsert failed. Check SUPABASE_SERVICE_ROLE_KEY and DB.",
        )

    if failed_sources:
        surviving_keys = [key for key in active_source_keys if key not in failed_sources]
        failure_parts = []
        for key in failed_sources:
            err = bundles[key].error or "Unknown fetch error"
            failure_parts.append(f"{_label_for(key)} failed ({err})")
        if surviving_keys:
            survivor_parts = [
                f"{_label_for(key)} {_outcome_human(bundles[key].outcome)}"
                for key in surviving_keys
            ]
            return (
                "partial",
                f"{'; '.join(failure_parts)}. {'; '.join(survivor_parts)}; no new rows inserted.",
            )
        return "failed", "; ".join(failure_parts)

    all_empty = all(
        bundles[key].outcome in {"empty_window", "skipped"} or bundles[key].fetched == 0
        for key in active_source_keys
    )
    if all_empty:
        return (
            "empty",
            f"No articles found in the last {lookback_hours} hour(s) from {_labels_for(active_source_keys)}.",
        )

    total_fetched = sum(stats[key].fetched for key in active_source_keys)
    total_skipped = sum(stats[key].skipped for key in active_source_keys)
    if total_fetched > 0 and total_skipped >= total_fetched:
        return (
            "empty",
            "No new articles in the lookback window (all fetched items were already ingested).",
        )

    return "empty", "No new articles to ingest for this lookback window."


def run(
    tickers: list[str],
    *,
    lookback_hours: int = 24,
    max_articles_per_source: int = 20,
    probe_only: bool = False,
    sources: list[str] | None = None,
    sources_explicit: bool = False,
    gnews_queries: list[str] | None = None,
) -> dict:
    """
    Fetch from selected sources, optionally upsert, return stats + per-source outcomes.

    EDGAR uses ``tickers``. NewsAPI ignores tickers. GNews always fetches global
    top stories and, when provided, also runs refresh-only targeted queries.
    """
    prepare_worker_runtime()

    active_sources = {s.lower() for s in sources} if sources else set(VALID_SOURCES)
    active_sources &= VALID_SOURCES
    if not active_sources:
        active_sources = set(VALID_SOURCES)

    bundles = {key: _empty_bundle() for key in SOURCE_REGISTRY}

    if "edgar" in active_sources and not tickers:
        if sources_explicit and sources and "edgar" in {s.lower() for s in sources}:
            bundles["edgar"] = _empty_bundle(outcome="failed", error="No tickers")
            return {
                "ingest_status": "failed",
                "ingest_detail": "EDGAR requires at least one ticker symbol.",
                **_source_rows_from_maps(bundles),
                "total_inserted": 0,
            }
        active_sources.discard("edgar")

    if not active_sources:
        return {
            "ingest_status": "failed",
            "ingest_detail": "Nothing to fetch: enable a global headline source or provide tickers for EDGAR.",
            **_source_rows_from_maps(bundles),
            "total_inserted": 0,
        }

    active_source_keys = [key for key in SOURCE_REGISTRY if key in active_sources]

    logger.info(
        "Starting ingestion: tickers=%s lookback_hours=%d max_per_source=%d probe=%s sources=%s gnews_queries=%d",
        tickers,
        lookback_hours,
        max_articles_per_source,
        probe_only,
        active_source_keys,
        len(gnews_queries or []),
    )

    for key in active_source_keys:
        config = SOURCE_REGISTRY[key]
        logger.info("Fetching via %s...", config.label)
        bundle = _fetch_source(
            config,
            tickers=tickers,
            gnews_queries=gnews_queries,
            lookback_hours=lookback_hours,
            max_articles_per_source=max_articles_per_source,
        )
        bundles[key] = bundle
        logger.info(
            "%s outcome=%s fetched=%d",
            key,
            bundle.outcome,
            bundle.fetched,
        )

    if probe_only:
        return {
            "probe_only": True,
            **{key: bundles[key].to_dict() for key in SOURCE_REGISTRY},
            "ingest_status": "probe",
            "ingest_detail": "Fetch-only probe; no database writes.",
        }

    stats = {key: _empty_stats() for key in SOURCE_REGISTRY}
    for key in active_source_keys:
        stats[key] = upsert_articles(bundles[key].articles, source_label=key)

    total_inserted = sum(stats[key].inserted for key in active_source_keys)

    all_inserted_ids: list[str] = []
    for key in active_source_keys:
        all_inserted_ids.extend(stats[key].inserted_ids)

    extraction_stats = None
    if all_inserted_ids:
        logger.info(
            "Queueing background full-text extraction for %d newly inserted articles (newspaper4k)...",
            len(all_inserted_ids),
        )
        spawn_extraction_worker(all_inserted_ids)
        extraction_stats = {
            "queued": len(all_inserted_ids),
            "background": True,
            "attempted": 0,
            "extracted": 0,
            "failed": 0,
            "skipped": 0,
            "cache_hits": 0,
        }

    ingest_status, ingest_detail = _summarize_ingest(
        bundles,
        stats,
        total_inserted,
        active_source_keys=active_source_keys,
        lookback_hours=lookback_hours,
    )

    logger.info(
        "Ingestion complete: status=%s %s total=%d",
        ingest_status,
        " ".join(f"{key}_ins={stats[key].inserted}" for key in active_source_keys),
        total_inserted,
    )

    result = {
        "ingest_status": ingest_status,
        "ingest_detail": ingest_detail,
        **_source_rows_from_maps(bundles, stats),
        "total_inserted": total_inserted,
    }
    if extraction_stats:
        result["full_text_extraction"] = extraction_stats
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="News ingestion worker")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Run preflight diagnostics only (no ingestion). Prints JSON.",
    )
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Fetch-only probe (no Supabase writes). Prints per-source outcomes.",
    )
    parser.add_argument(
        "--tickers",
        required=False,
        default="",
        help="Comma-separated symbols for EDGAR filings (optional if only global headline sources run)",
    )
    parser.add_argument(
        "--lookback-hours",
        type=int,
        default=24,
        dest="lookback_hours",
        help="How many hours back to fetch (default: 24)",
    )
    parser.add_argument(
        "--max-articles",
        type=int,
        default=20,
        dest="max_articles",
        help="Max articles per source before dedupe (default: 20)",
    )
    parser.add_argument(
        "--sources",
        required=False,
        default="",
        help=f"Comma-separated source names ({','.join(sorted(VALID_SOURCES))}). Default: all.",
    )
    parser.add_argument(
        "--gnews-queries-json",
        required=False,
        default="",
        help="Optional JSON array of refresh-only targeted GNews queries.",
    )
    parser.add_argument(
        "--backfill",
        action="store_true",
        help="Run full-text extraction on existing articles missing full_content (no ingestion).",
    )
    parser.add_argument(
        "--backfill-limit",
        type=int,
        default=50,
        dest="backfill_limit",
        help="Max articles to backfill (default: 50). Only used with --backfill.",
    )
    args = parser.parse_args()

    if args.backfill:
        prepare_worker_runtime()
        logger.info("Running full-text backfill (limit=%d)...", args.backfill_limit)
        result = backfill_full_text(limit=args.backfill_limit)
        print(json.dumps({"backfill": True, **result.to_dict()}), flush=True)
        sys.exit(0)

    if args.check:
        try:
            result = preflight_check()
            print(json.dumps(result), flush=True)
            sys.exit(0 if result["ok"] else 1)
        except Exception as exc:
            print(
                json.dumps({
                    "ok": False,
                    "checks": [{
                        "name": "preflight",
                        "ok": False,
                        "error": f"{type(exc).__name__}: {exc}",
                    }],
                }),
                flush=True,
            )
            sys.exit(1)

    tickers = [t.strip().upper() for t in args.tickers.split(",") if t.strip()]
    sources_arg = args.sources.strip()
    source_list = [s.strip().lower() for s in sources_arg.split(",") if s.strip()] or None
    sources_explicit = bool(sources_arg)

    if source_list:
        bad = [s for s in source_list if s not in VALID_SOURCES]
        if bad:
            print(json.dumps({"error": f"Unknown sources: {bad}. Valid: {sorted(VALID_SOURCES)}"}), flush=True)
            sys.exit(1)

    gnews_queries: list[str] | None = None
    if args.gnews_queries_json.strip():
        try:
            parsed_queries = json.loads(args.gnews_queries_json)
        except json.JSONDecodeError as exc:
            print(json.dumps({"error": f"Invalid --gnews-queries-json: {exc.msg}"}), flush=True)
            sys.exit(1)
        if not isinstance(parsed_queries, list) or not all(isinstance(item, str) for item in parsed_queries):
            print(json.dumps({"error": "--gnews-queries-json must be a JSON array of strings"}), flush=True)
            sys.exit(1)
        gnews_queries = [item.strip() for item in parsed_queries if item.strip()]

    active_source_probe = set(source_list) if source_list else set(VALID_SOURCES)
    if "edgar" in active_source_probe and not tickers:
        if sources_explicit and source_list and "edgar" in source_list:
            print(json.dumps({"error": "EDGAR requires --tickers with at least one symbol"}), flush=True)
            sys.exit(1)

    if args.probe:
        result = run(
            tickers,
            lookback_hours=args.lookback_hours,
            max_articles_per_source=args.max_articles,
            probe_only=True,
            sources=source_list,
            sources_explicit=sources_explicit,
            gnews_queries=gnews_queries,
        )
        print(json.dumps(result), flush=True)
        sys.exit(0)

    health = preflight_check()
    if not health["ok"]:
        failures = [c for c in health["checks"] if not c["ok"]]
        print(json.dumps({"error": "Preflight failed", "checks": failures}), flush=True)
        sys.exit(1)

    result = run(
        tickers,
        lookback_hours=args.lookback_hours,
        max_articles_per_source=args.max_articles,
        sources=source_list,
        sources_explicit=sources_explicit,
        gnews_queries=gnews_queries,
    )

    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
