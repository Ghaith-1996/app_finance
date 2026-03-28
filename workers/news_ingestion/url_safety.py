"""URL safety checks for publisher extraction."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

SUPPORTED_SCHEMES = {"http", "https"}
BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata",
    "metadata.google.internal",
}
BLOCKED_METADATA_IPS = {
    "100.100.100.200",
    "169.254.169.254",
    "169.254.170.2",
}


def _is_public_ip(ip: ipaddress._BaseAddress) -> bool:
    if ip.exploded in BLOCKED_METADATA_IPS:
        return False
    if (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return False
    return True


def validate_public_url(url: str) -> tuple[bool, str | None]:
    try:
        parsed = urlparse((url or "").strip())
    except Exception:
        return False, "invalid_url"

    if parsed.scheme.lower() not in SUPPORTED_SCHEMES:
        return False, "unsupported_scheme"
    if parsed.username or parsed.password:
        return False, "credentials_not_allowed"

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        return False, "missing_hostname"
    if hostname in BLOCKED_HOSTNAMES or hostname.endswith(".localhost"):
        return False, "blocked_hostname"

    try:
        ip = ipaddress.ip_address(hostname)
        return (_is_public_ip(ip), None if _is_public_ip(ip) else "blocked_ip")
    except ValueError:
        return True, None


def resolve_public_hostname(hostname: str, port: int) -> tuple[bool, str | None]:
    try:
        results = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False, "dns_resolution_failed"

    resolved_any = False
    for result in results:
        sockaddr = result[4]
        if not sockaddr:
            continue
        addr = sockaddr[0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        resolved_any = True
        if not _is_public_ip(ip):
            return False, "blocked_resolved_ip"

    if not resolved_any:
        return False, "dns_resolution_failed"
    return True, None


def assert_safe_public_url(url: str) -> tuple[bool, str | None]:
    ok, reason = validate_public_url(url)
    if not ok:
        return False, reason

    parsed = urlparse(url)
    hostname = (parsed.hostname or "").strip()
    port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    return resolve_public_hostname(hostname, port)
