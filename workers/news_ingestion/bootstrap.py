"""
Worker environment bootstrap — run before any `edgar` import.

edgartools reads cache paths at import time; EDGAR_LOCAL_DATA_DIR must point to a
writable directory. Default user home (~/.edgar) may be blocked in some
environments, so we use a project-owned path under the app workspace.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

_WORKSPACE_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_EDGAR_DIR = _WORKSPACE_ROOT / ".edgar_data"


def workspace_root() -> Path:
    return _WORKSPACE_ROOT


def configure_worker_environment() -> str:
    """
    Ensure EDGAR local data dir exists and is set before importing edgartools.

    Returns the resolved data directory path (for diagnostics).
    """
    raw = os.environ.get("EDGAR_LOCAL_DATA_DIR", "").strip()
    if raw:
        data_path = Path(raw).expanduser().resolve()
    else:
        data_path = _DEFAULT_EDGAR_DIR.resolve()

    data_path.mkdir(parents=True, exist_ok=True)
    os.environ["EDGAR_LOCAL_DATA_DIR"] = str(data_path)
    logger.debug("EDGAR_LOCAL_DATA_DIR=%s", data_path)
    return str(data_path)


def prepare_worker_runtime() -> dict[str, str]:
    """Set up writable EDGAR cache before importing edgartools."""
    ed = configure_worker_environment()
    return {"EDGAR_LOCAL_DATA_DIR": ed}
