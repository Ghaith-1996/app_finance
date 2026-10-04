"""URL safety checks for publisher extraction (audit S1).

Mirrors lib/security/publisher-url.ts:
- IPv4 must be outside every special-purpose range.
- IPv6 must be global unicast (2000::/3) and outside the special ranges inside it, which rejects
  ::, ::1, IPv4-mapped (::ffff:0:0/96), NAT64, link-local fe80::/10 (incl. fe90::), fc00::/7, ff00::/8.
- http/https only, default ports only, no credentials, no single-label or localhost names.

`public_network_only()` binds the check to the connection: while active, every getaddrinfo call in
this thread (requests/urllib3/newspaper all resolve through it) fails unless every answer is public,
so a hostname that re-resolves to a private address between a preflight and the request is refused.
`no_network()` is stricter: every getaddrinfo call in this thread fails, for code (the HTML parser)
that must not reach the network at all.
"""

from __future__ import annotations

import contextlib
import ipaddress
import socket
import threading
from typing import Iterator
from urllib.parse import urlparse

SUPPORTED_SCHEMES = {"http", "https"}
ALLOWED_PORTS = {None, 80, 443}
BLOCKED_HOSTNAMES = {
    "localhost",
    "metadata",
    "metadata.google.internal",
}

_BLOCKED_IPV4 = [
    ipaddress.ip_network(network)
    for network in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.88.99.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "224.0.0.0/4",
        "240.0.0.0/4",
    )
]
_GLOBAL_UNICAST_IPV6 = ipaddress.ip_network("2000::/3")
_BLOCKED_GLOBAL_IPV6 = [
    ipaddress.ip_network(network)
    for network in ("2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20")
]


class UnsafeDestinationError(OSError):
    """Raised when a connection would reach a non-public address."""


def is_public_ip(raw: str | ipaddress._BaseAddress) -> bool:
    try:
        ip = raw if isinstance(raw, ipaddress._BaseAddress) else ipaddress.ip_address(str(raw).split("%", 1)[0].strip("[]"))
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv4Address):
        return not any(ip in network for network in _BLOCKED_IPV4)
    return ip in _GLOBAL_UNICAST_IPV6 and not any(ip in network for network in _BLOCKED_GLOBAL_IPV6)


# Backwards-compatible name used by older call sites/tests.
_is_public_ip = is_public_ip


def validate_public_url(url: str) -> tuple[bool, str | None]:
    try:
        parsed = urlparse((url or "").strip())
        port = parsed.port
    except Exception:
        return False, "invalid_url"

    if parsed.scheme.lower() not in SUPPORTED_SCHEMES:
        return False, "unsupported_scheme"
    if parsed.username or parsed.password:
        return False, "credentials_not_allowed"
    if port not in ALLOWED_PORTS:
        return False, "unsupported_port"

    hostname = (parsed.hostname or "").strip().lower().rstrip(".")
    if not hostname:
        return False, "missing_hostname"
    if hostname in BLOCKED_HOSTNAMES or hostname.endswith(".localhost"):
        return False, "blocked_hostname"

    try:
        ip = ipaddress.ip_address(hostname)
    except ValueError:
        if "." not in hostname:
            return False, "blocked_hostname"
        return True, None
    return (True, None) if is_public_ip(ip) else (False, "blocked_ip")


def _addresses_are_public(results) -> tuple[bool, str | None]:
    resolved_any = False
    for result in results:
        sockaddr = result[4]
        if not sockaddr:
            continue
        resolved_any = True
        if not is_public_ip(sockaddr[0]):
            return False, "blocked_resolved_ip"
    return (True, None) if resolved_any else (False, "dns_resolution_failed")


_original_getaddrinfo = socket.getaddrinfo
_guard = threading.local()
_install_lock = threading.Lock()
_installed = False


def _guarded_getaddrinfo(host, port, *args, **kwargs):
    if getattr(_guard, "offline", 0):
        raise UnsafeDestinationError(f"network_disabled: {host}")
    results = _original_getaddrinfo(host, port, *args, **kwargs)
    if getattr(_guard, "active", 0):
        ok, reason = _addresses_are_public(results)
        if not ok:
            raise UnsafeDestinationError(f"{reason}: {host}")
    return results


def _install_guard() -> None:
    global _installed
    with _install_lock:
        if not _installed:
            socket.getaddrinfo = _guarded_getaddrinfo
            _installed = True


@contextlib.contextmanager
def public_network_only() -> Iterator[None]:
    """Within this block, connections in this thread can only reach public addresses."""
    _install_guard()
    _guard.active = getattr(_guard, "active", 0) + 1
    try:
        yield
    finally:
        _guard.active -= 1


@contextlib.contextmanager
def no_network() -> Iterator[None]:
    """Within this block, no connection in this thread can resolve (and so reach) any host."""
    _install_guard()
    _guard.offline = getattr(_guard, "offline", 0) + 1
    try:
        yield
    finally:
        _guard.offline -= 1


def resolve_public_hostname(hostname: str, port: int) -> tuple[bool, str | None]:
    try:
        results = _original_getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False, "dns_resolution_failed"
    return _addresses_are_public(results)


def assert_safe_public_url(url: str) -> tuple[bool, str | None]:
    ok, reason = validate_public_url(url)
    if not ok:
        return False, reason

    parsed = urlparse(url)
    hostname = (parsed.hostname or "").strip()
    port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    return resolve_public_hostname(hostname, port)
