"""Extract full article text from publisher URLs using newspaper4k + PostgreSQL cache."""

from __future__ import annotations

import argparse
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

from .url_safety import assert_safe_public_url

logger = logging.getLogger(__name__)

MIN_USEFUL_LENGTH = 80
FETCH_DELAY_SECONDS = 0.7
RETRY_COOLDOWN_SECONDS = 15 * 60

# Modern desktop Chrome UA — applied to Article config (newspaper download path)
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

SKIP_URL_PREFIXES = (
    "https://www.sec.gov/",
    "https://sec.gov/",
    "https://efts.sec.gov/",
)


@dataclass
class ExtractionStats:
    attempted: int = 0
    extracted: int = 0
    failed: int = 0
    skipped: int = 0
    cache_hits: int = 0
    queued: int = 0

    def to_dict(self) -> dict:
        return {
            "attempted": self.attempted,
            "extracted": self.extracted,
            "failed": self.failed,
            "skipped": self.skipped,
            "cache_hits": self.cache_hits,
            "queued": self.queued,
        }


def _should_skip_url(url: str) -> bool:
    return any(url.startswith(prefix) for prefix in SKIP_URL_PREFIXES)


def normalize_cache_key(url: str) -> str:
    """Stable key for deduplication: scheme + host (lower) + path (trimmed), no fragment."""
    raw = (url or "").strip()
    if not raw:
        return ""
    p = urlparse(raw)
    scheme = (p.scheme or "https").lower()
    netloc = (p.netloc or "").lower()
    path = (p.path or "/").rstrip("/") or "/"
    return urlunparse((scheme, netloc, path, "", p.query, ""))


def _get_supabase_client():
    from supabase import create_client

    supa_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is required for full-text extraction.")
    if not supa_url:
        raise RuntimeError("NEXT_PUBLIC_SUPABASE_URL is required.")
    return create_client(supa_url, key)


def _configure_newspaper_article(url: str):
    """Return a configured Article instance using newspaper4k / newspaper."""
    try:
        from newspaper import Article
    except ImportError:
        logger.warning("newspaper4k/newspaper not installed — skipping full-text extraction")
        return None

    article = Article(url, language="en")
    # newspaper uses requests under the hood; set browser-like headers
    article.config.browser_user_agent = USER_AGENT
    article.config.request_timeout = 12
    return article


def _resolve_safe_fetch_url(url: str) -> tuple[str | None, str | None]:
    ok, reason = assert_safe_public_url(url)
    if not ok:
        return None, reason

    try:
        import requests
    except ImportError:
        return url, None

    session = requests.Session()
    current_url = url

    try:
        for _ in range(5):
            response = session.get(
                current_url,
                allow_redirects=False,
                timeout=8,
                stream=True,
                headers={"User-Agent": USER_AGENT},
            )
            response.close()

            if response.is_redirect or response.is_permanent_redirect:
                location = response.headers.get("location")
                if not location:
                    return current_url, None

                next_url = urljoin(current_url, location)
                ok, reason = assert_safe_public_url(next_url)
                if not ok:
                    return None, f"blocked_redirect:{reason}"

                current_url = next_url
                continue

            return current_url, None
    except Exception as exc:
        logger.debug("Safe redirect preflight failed for %s: %s", current_url, exc)
        return None, "redirect_preflight_failed"
    finally:
        session.close()

    return None, "redirect_hop_limit_exceeded"


def extract_article_text(url: str) -> tuple[str | None, str | None, str | None]:
    """
    Download and parse a single article URL.
    Returns (text, canonical_url_or_none, error_or_none).
    """
    safe_url, safe_error = _resolve_safe_fetch_url(url)
    if safe_error:
        return None, None, safe_error

    article = _configure_newspaper_article(safe_url or url)
    if article is None:
        return None, None, "extractor_not_available"

    try:
        article.download()
        article.parse()
        text = (article.text or "").strip()
        canon = getattr(article, "canonical_link", None) or None
        if text and len(text) >= MIN_USEFUL_LENGTH:
            return text, canon, None
        return None, canon, "insufficient_content"
    except Exception as exc:
        logger.debug("Extraction failed for %s: %s", url, exc)
        return None, None, "download_failed"


def _fetch_cache_row(client, cache_key: str) -> dict | None:
    res = (
        client.table("article_extractions")
        .select("*")
        .eq("cache_key", cache_key)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


def _should_retry_failed(row: dict | None) -> bool:
    if not row or row.get("status") != "failed":
        return True
    ts = row.get("last_attempt_at") or row.get("updated_at")
    if not ts:
        return True
    try:
        last = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - last).total_seconds() >= RETRY_COOLDOWN_SECONDS
    except Exception:
        return True


def _apply_cache_to_news_item(
    client,
    row_id: str,
    content: str,
    *,
    from_cache: bool,
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    client.table("news_items").update(
        {
            "extracted_content": content,
            "full_content": content,
            "extraction_status": "complete",
            "extraction_error": None,
            "extracted_at": now,
        }
    ).eq("id", row_id).execute()
    if from_cache:
        logger.info("Applied cached extraction to news_item %s", row_id[:8])


def process_one_row(client, row: dict, stats: ExtractionStats) -> None:
    row_id = row["id"]
    url = (row.get("url") or "").strip()
    if not url or _should_skip_url(url):
        stats.skipped += 1
        client.table("news_items").update(
            {
                "extraction_status": "skipped",
                "extraction_error": "SEC or unsupported URL",
            }
        ).eq("id", row_id).execute()
        return

    cache_key = normalize_cache_key(url)
    if not cache_key:
        stats.skipped += 1
        return

    ok, reason = assert_safe_public_url(url)
    if not ok:
        stats.skipped += 1
        client.table("news_items").update(
            {
                "extraction_status": "skipped",
                "extraction_error": f"Blocked publisher URL ({reason})",
            }
        ).eq("id", row_id).execute()
        return

    client.table("news_items").update({"extraction_cache_key": cache_key}).eq("id", row_id).execute()

    cached = _fetch_cache_row(client, cache_key)
    if cached and cached.get("status") == "complete" and (cached.get("content") or "").strip():
        stats.cache_hits += 1
        _apply_cache_to_news_item(client, row_id, cached["content"].strip(), from_cache=True)
        stats.extracted += 1
        return

    if cached and cached.get("status") == "failed" and not _should_retry_failed(cached):
        stats.skipped += 1
        client.table("news_items").update(
            {
                "extraction_status": "failed",
                "extraction_error": cached.get("error") or "Recent failure; retry later",
            }
        ).eq("id", row_id).execute()
        return

    stats.attempted += 1
    now_iso = datetime.now(timezone.utc).isoformat()

    client.table("news_items").update(
        {"extraction_status": "in_progress", "extraction_error": None}
    ).eq("id", row_id).execute()

    text, canonical, extraction_error = extract_article_text(url)

    if text:
        client.table("article_extractions").upsert(
            {
                "cache_key": cache_key,
                "canonical_url": canonical,
                "content": text[:50000],
                "status": "complete",
                "error": None,
                "extracted_at": now_iso,
                "last_attempt_at": now_iso,
            },
            on_conflict="cache_key",
        ).execute()
        _apply_cache_to_news_item(client, row_id, text, from_cache=False)
        stats.extracted += 1
        logger.info("Extracted %d chars for %s", len(text), url[:80])
    else:
        err_msg = {
            "blocked_redirect:unsupported_scheme": "Blocked redirect target",
            "blocked_redirect:blocked_hostname": "Blocked redirect target",
            "blocked_redirect:blocked_ip": "Blocked redirect target",
            "blocked_redirect:blocked_resolved_ip": "Blocked redirect target",
            "blocked_redirect:credentials_not_allowed": "Blocked redirect target",
            "blocked_redirect:missing_hostname": "Blocked redirect target",
            "download_failed": "Could not extract useful article text",
            "insufficient_content": "Could not extract useful article text",
            "redirect_preflight_failed": "Could not validate redirect chain",
            "redirect_hop_limit_exceeded": "Too many redirects",
        }.get(extraction_error or "", "Could not extract useful article text")
        client.table("article_extractions").upsert(
            {
                "cache_key": cache_key,
                "canonical_url": canonical,
                "content": None,
                "status": "failed",
                "error": err_msg,
                "last_attempt_at": now_iso,
            },
            on_conflict="cache_key",
        ).execute()
        client.table("news_items").update(
            {
                "extraction_status": "failed",
                "extraction_error": err_msg,
                "extracted_at": None,
            }
        ).eq("id", row_id).execute()
        stats.failed += 1

    time.sleep(FETCH_DELAY_SECONDS)


def extract_full_text_for_ids(article_ids: list[str]) -> ExtractionStats:
    """
    Extract full text for specific article IDs (typically freshly inserted).
    Uses article_extractions cache; writes to extracted_content on news_items.
    """
    stats = ExtractionStats()

    if not article_ids:
        return stats

    try:
        client = _get_supabase_client()
    except Exception as exc:
        logger.error("Supabase connection failed for extraction: %s", exc)
        stats.failed = len(article_ids)
        return stats

    try:
        client.table("news_items").update({"extraction_status": "queued"}).in_("id", article_ids).execute()
    except Exception as exc:
        logger.warning("Could not mark articles queued: %s", exc)

    result = (
        client.table("news_items")
        .select("id, url, source_type, extracted_content, extraction_status")
        .in_("id", article_ids)
        .execute()
    )

    rows = result.data or []

    for row in rows:
        # Skip if already have primary extracted content
        if (row.get("extracted_content") or "").strip():
            stats.skipped += 1
            continue
        st = row.get("extraction_status")
        if st in ("complete", "skipped"):
            stats.skipped += 1
            continue

        process_one_row(client, row, stats)

    return stats


def extract_full_text_for_queued(limit: int = 40) -> ExtractionStats:
    """Process news_items marked queued with a URL and no extracted_content yet."""
    stats = ExtractionStats()
    try:
        client = _get_supabase_client()
    except Exception as exc:
        logger.error("Supabase connection failed: %s", exc)
        return stats

    result = (
        client.table("news_items")
        .select("id, url, source_type, extracted_content, extraction_status")
        .eq("extraction_status", "queued")
        .not_.is_("url", "null")
        .order("published_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = result.data or []
    for row in rows:
        process_one_row(client, row, stats)
    return stats


def backfill_full_text(*, limit: int = 50) -> ExtractionStats:
    """Backfill extracted_content for rows missing body text."""
    stats = ExtractionStats()
    try:
        client = _get_supabase_client()
    except Exception as exc:
        logger.error("Supabase connection failed for backfill: %s", exc)
        return stats

    result = (
        client.table("news_items")
        .select("id, url, source_type, extracted_content, extraction_status")
        .is_("extracted_content", "null")
        .not_.is_("url", "null")
        .order("published_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = result.data or []
    logger.info("Backfill: found %d articles needing extraction", len(rows))

    for row in rows:
        if (row.get("extracted_content") or "").strip():
            continue
        process_one_row(client, row, stats)

    return stats


def spawn_extraction_worker(article_ids: list[str]) -> None:
    """
    Fire-and-forget: run extract_full_text_for_ids in a separate OS process so the
    ingestion worker / API can return without waiting for extraction.
    """
    if not article_ids:
        return
    import subprocess

    root = Path(__file__).resolve().parent.parent.parent
    ids_arg = ",".join(article_ids)
    cmd = [sys.executable, "-m", "workers.news_ingestion.extract_full_text", "--ids", ids_arg]
    kwargs: dict = {
        "cwd": str(root),
        "env": {**os.environ},
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if sys.platform == "win32":
        # Detach on Windows so the parent can exit
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    else:
        kwargs["start_new_session"] = True
    try:
        subprocess.Popen(cmd, **kwargs)
        logger.info("Spawned background extraction for %d article(s)", len(article_ids))
    except Exception as exc:
        logger.warning("Could not spawn extraction subprocess: %s", exc)


def main() -> None:
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description="Run newspaper4k extraction for news_items")
    parser.add_argument(
        "--ids",
        help="Comma-separated news_items UUIDs",
    )
    parser.add_argument(
        "--queued",
        action="store_true",
        help="Process rows with extraction_status=queued",
    )
    parser.add_argument("--limit", type=int, default=40)
    args = parser.parse_args()

    if args.ids:
        ids = [x.strip() for x in args.ids.split(",") if x.strip()]
        stats = extract_full_text_for_ids(ids)
        logger.info("Extraction done: %s", stats.to_dict())
        return

    if args.queued:
        stats = extract_full_text_for_queued(limit=args.limit)
        logger.info("Queued extraction done: %s", stats.to_dict())
        return

    parser.print_help()
    sys.exit(1)


if __name__ == "__main__":
    main()
