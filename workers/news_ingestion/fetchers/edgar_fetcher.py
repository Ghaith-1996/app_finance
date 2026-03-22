"""Fetch SEC filing events via edgartools and normalize into NormalizedArticle."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from ..schema import NormalizedArticle
from .result import SourceFetchBundle

logger = logging.getLogger(__name__)

# Map SEC form types to category hints that AI enrichment can refine.
_FORM_CATEGORY: dict[str, str] = {
    "8-K": "regulation",
    "10-K": "earnings",
    "10-Q": "earnings",
    "6-K": "regulation",
    "4": "other",          # insider transaction
    "DEF 14A": "other",    # proxy statement
    "S-1": "deals",
    "S-11": "deals",
    "424B3": "deals",
    "424B4": "deals",
    "SC 13D": "other",
    "SC 13G": "other",
}

_FORM_DESCRIPTION: dict[str, str] = {
    "8-K": "Material Event Disclosure",
    "10-K": "Annual Report",
    "10-Q": "Quarterly Report",
    "6-K": "Foreign Private Issuer Report",
    "4": "Insider Transaction",
    "DEF 14A": "Proxy Statement",
    "S-1": "Registration Statement",
    "SC 13D": "Beneficial Ownership Report",
    "SC 13G": "Beneficial Ownership Report",
}

_INGESTED_FORMS = [
    "8-K", "10-K", "10-Q", "6-K", "4",
    "DEF 14A", "S-1", "424B3", "424B4",
    "SC 13D", "SC 13G",
]


def _set_edgar_identity() -> None:
    identity = os.getenv("EDGAR_IDENTITY", "").strip()
    if not identity:
        raise RuntimeError(
            "EDGAR_IDENTITY env var is required (format: 'Full Name email@example.com'). "
            "SEC fair-access policy requires a valid contact identity."
        )
    import edgar
    edgar.set_identity(identity)


def _filing_url(cik: int, accession_no: str) -> str:
    acc_folder = accession_no.replace("-", "")
    return (
        f"https://www.sec.gov/Archives/edgar/data/{cik}/"
        f"{acc_folder}/{accession_no}-index.htm"
    )


def _build_article(
    ticker: str,
    filing,
    *,
    company_name: str,
    cik: int,
) -> Optional[NormalizedArticle]:
    try:
        form = str(getattr(filing, "form", "")).strip()
        filing_date = getattr(filing, "filing_date", None)
        accession_no = str(getattr(filing, "accession_no", "")).strip()

        if not form or not accession_no:
            return None

        if isinstance(filing_date, datetime):
            pub_dt = filing_date.replace(tzinfo=timezone.utc)
        else:
            pub_dt = datetime(
                filing_date.year, filing_date.month, filing_date.day,
                tzinfo=timezone.utc,
            )

        form_desc = _FORM_DESCRIPTION.get(form, form)
        headline = f"{company_name}: {form_desc} ({form})"
        url = _filing_url(cik, accession_no)
        external_id = f"edgar_{accession_no.replace('-', '_')}"

        raw_content = (
            f"{form_desc} filed by {company_name} on "
            f"{pub_dt.strftime('%Y-%m-%d')}. "
            f"Accession: {accession_no}. Form type: {form}."
        )

        for attr in ("description", "items", "document"):
            val = getattr(filing, attr, None)
            if val and isinstance(val, str) and len(val) > 10:
                raw_content = val[:2000]
                break

        return NormalizedArticle(
            source_type="edgar",
            external_id=external_id,
            headline=headline,
            url=url,
            published_at=pub_dt,
            source="SEC/EDGAR",
            stock_tags=[ticker.upper()],
            category_hint=_FORM_CATEGORY.get(form, "regulation"),
            raw_content=raw_content,
            metadata={
                "filing_type": form,
                "accession_no": accession_no,
                "cik": str(cik),
                "company_name": company_name,
            },
        )
    except Exception as exc:
        logger.debug("Failed to build article for %s filing: %s", ticker, exc)
        return None


def fetch_edgar_news(
    tickers: list[str],
    *,
    lookback_hours: int = 24,
    max_articles: int = 20,
) -> SourceFetchBundle:
    """
    Fetch recent SEC filings for each ticker.

    Distinguishes:
      - failed: cannot reach SEC / edgartools (network, WinError 10013, etc.)
      - empty_window: requests succeeded but no filings in lookback
      - success: at least one article
    """
    warnings: list[str] = []
    ticker_errors: list[str] = []

    try:
        _set_edgar_identity()
    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        logger.error("edgar identity/setup failed: %s", msg)
        return SourceFetchBundle(
            outcome="failed",
            error=f"EDGAR setup failed: {msg}",
        )

    try:
        import edgar
    except Exception as exc:
        msg = f"{type(exc).__name__}: {exc}"
        logger.error("edgartools import failed: %s", msg)
        return SourceFetchBundle(
            outcome="failed",
            error=f"edgartools not available: {msg}",
        )

    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=lookback_hours)
    articles: list[NormalizedArticle] = []
    seen_ids: set[str] = set()
    tickers_ok = 0  # tickers processed without exception

    for ticker in tickers:
        if len(articles) >= max_articles:
            break
        try:
            company = edgar.Company(ticker)
            company_name = getattr(company, "name", ticker)
            cik = getattr(company, "cik", 0)

            filings = company.get_filings(form=_INGESTED_FORMS)
            tickers_ok += 1

            for filing in filings:
                if len(articles) >= max_articles:
                    break

                filing_date = getattr(filing, "filing_date", None)
                if filing_date is None:
                    continue

                if isinstance(filing_date, datetime):
                    filing_dt = filing_date.replace(tzinfo=timezone.utc)
                else:
                    filing_dt = datetime(
                        filing_date.year, filing_date.month, filing_date.day,
                        tzinfo=timezone.utc,
                    )

                if filing_dt < cutoff:
                    break

                article = _build_article(
                    ticker, filing,
                    company_name=company_name,
                    cik=cik,
                )
                if article and article.external_id not in seen_ids:
                    seen_ids.add(article.external_id)
                    articles.append(article)

        except Exception as exc:
            err = f"{ticker}: {type(exc).__name__}: {exc}"
            logger.warning("edgar fetch failed for %s", err)
            ticker_errors.append(err)

    if articles:
        outcome = "success"
        if ticker_errors:
            warnings.extend(ticker_errors)
        return SourceFetchBundle(
            articles=articles,
            outcome=outcome,
            warnings=warnings,
        )

    # Zero articles
    if ticker_errors and tickers_ok == 0:
        joined = "; ".join(ticker_errors[:5])
        if len(ticker_errors) > 5:
            joined += f" (+{len(ticker_errors) - 5} more)"
        return SourceFetchBundle(
            outcome="failed",
            error=(
                "SEC EDGAR fetch failed for all tickers (network/firewall, socket denied, or SEC blocked). "
                f"Details: {joined}"
            ),
            warnings=ticker_errors,
        )

    # No filings in window; optionally some tickers failed while others returned OK but empty
    if ticker_errors:
        return SourceFetchBundle(
            outcome="empty_window",
            error=None,
            articles=[],
            warnings=ticker_errors,
        )

    return SourceFetchBundle(
        outcome="empty_window",
        error=None,
        articles=[],
    )
