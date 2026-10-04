"""Audit S1: outbound URL policy for publisher extraction.

No network access: DNS is replaced with fixed answers and socket.connect is spied on.

Run from repo root:
  python -m unittest workers.news_ingestion.tests.test_url_safety
"""

from __future__ import annotations

import socket
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

_ROOT = Path(__file__).resolve().parents[3]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from workers.news_ingestion import url_safety  # noqa: E402
from workers.news_ingestion.url_safety import (  # noqa: E402
    UnsafeDestinationError,
    is_public_ip,
    public_network_only,
    validate_public_url,
)


def _answers(*addresses: str):
    result = []
    for address in addresses:
        family = socket.AF_INET6 if ":" in address else socket.AF_INET
        sockaddr = (address, 443, 0, 0) if family == socket.AF_INET6 else (address, 443)
        result.append((family, socket.SOCK_STREAM, 6, "", sockaddr))
    return result


class TestIpClassification(unittest.TestCase):
    def test_public_addresses(self):
        for address in ("8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"):
            self.assertTrue(is_public_ip(address), address)

    def test_non_public_addresses(self):
        for address in (
            "127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "100.64.0.1", "169.254.169.254",
            "0.0.0.0", "224.0.0.1", "240.0.0.1", "::", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1",
            "::ffff:a9fe:a9fe", "::ffff:8.8.8.8", "fe80::1", "fe90::1", "fc00::1", "fd00::1", "ff02::1",
            "64:ff9b::7f00:1", "2002:7f00:1::1", "2001:0:4136:e378::1", "2001:db8::1", "fe80::1%eth0",
            "not-an-ip",
        ):
            self.assertFalse(is_public_ip(address), address)


class TestValidatePublicUrl(unittest.TestCase):
    def test_rejections(self):
        cases = {
            "http://[::ffff:127.0.0.1]/": "blocked_ip",
            "http://[fe90::1]/": "blocked_ip",
            "http://localhost./": "blocked_hostname",
            "http://intranet/": "blocked_hostname",
            "https://example.com:8443/": "unsupported_port",
            "ftp://example.com/": "unsupported_scheme",
            "https://u:p@example.com/": "credentials_not_allowed",
            "https://example.com:99999/": "invalid_url",
        }
        for url, reason in cases.items():
            self.assertEqual(validate_public_url(url), (False, reason), url)

    def test_allowed(self):
        for url in ("https://news.example.com/a", "http://example.com:80/", "https://[2606:4700:4700::1111]/"):
            self.assertEqual(validate_public_url(url), (True, None), url)


class TestConnectionBoundGuard(unittest.TestCase):
    def test_guard_blocks_private_answers_only_inside_block(self):
        with patch.object(url_safety, "_original_getaddrinfo", return_value=_answers("10.0.0.5")):
            url_safety._install_guard()
            # Outside the guarded block, unrelated resolution (e.g. a local Supabase) is unaffected.
            self.assertEqual(socket.getaddrinfo("internal.example", 443)[0][4][0], "10.0.0.5")
            with public_network_only():
                with self.assertRaises(UnsafeDestinationError):
                    socket.getaddrinfo("internal.example", 443)

    def test_rebinding_answer_never_reaches_connect(self):
        """Preflight sees a public answer; the connection-time lookup sees a private one."""
        try:
            import requests
        except ImportError:  # pragma: no cover - requirements always include requests
            self.skipTest("requests not installed")

        from workers.news_ingestion import extract_full_text

        answers = [_answers("93.184.216.34"), _answers("169.254.169.254")]
        connects: list = []

        def fake_resolver(host, port, *args, **kwargs):
            return answers.pop(0) if answers else _answers("169.254.169.254")

        original_connect = socket.socket.connect

        def spy_connect(sock, address):
            connects.append(address)
            raise ConnectionRefusedError("test transport: no real connections")

        with patch.object(url_safety, "_original_getaddrinfo", side_effect=fake_resolver), patch.object(
            socket.socket, "connect", spy_connect
        ):
            final_url, html, error = extract_full_text.fetch_public_html("https://rebind.example.com/story")

        self.assertIsNone(html)
        self.assertEqual(error, "blocked_resolved_ip")
        self.assertEqual(connects, [])
        self.assertIs(socket.socket.connect, original_connect)
        del requests

    def test_blocked_literal_never_resolves_or_connects(self):
        from workers.news_ingestion import extract_full_text

        with patch.object(url_safety, "_original_getaddrinfo") as resolver:
            final_url, html, error = extract_full_text.fetch_public_html("http://[::ffff:7f00:1]/private")
        self.assertEqual(error, "blocked_ip")
        resolver.assert_not_called()


class TestParserIsOffline(unittest.TestCase):
    """Review R1: newspaper's parse() used to download images after the guarded fetch had ended."""

    def test_no_network_blocks_every_lookup(self):
        with patch.object(url_safety, "_original_getaddrinfo", return_value=_answers("93.184.216.34")) as resolver:
            with url_safety.no_network():
                with self.assertRaises(UnsafeDestinationError):
                    socket.getaddrinfo("public.example.com", 443)
        resolver.assert_not_called()

    def test_real_parser_makes_no_request_for_referenced_images(self):
        try:
            import newspaper  # noqa: F401
        except ImportError:  # pragma: no cover - requirements always include newspaper4k
            self.skipTest("newspaper4k not installed")

        from workers.news_ingestion import extract_full_text

        paragraph = (
            "Shares of the company rose after it reported quarterly revenue above expectations, "
            "and management raised its outlook for the remainder of the fiscal year. "
        )
        html = (
            "<html><head><title>Earnings beat</title>"
            '<meta property="og:image" content="http://10.0.0.5/og.png"></head><body><article>'
            '<h1>Earnings beat</h1><img src="http://10.0.0.5/pixel.png" width="800" height="600">'
            '<img src="http://169.254.169.254/latest/meta-data/x.jpg">'
            + "".join(f"<p>{paragraph * 3}</p>" for _ in range(6))
            + "</article></body></html>"
        )
        connects: list = []

        def spy_connect(sock, address):
            connects.append(address)
            raise ConnectionRefusedError("test transport: no real connections")

        with patch.object(
            extract_full_text, "fetch_public_html", return_value=("https://news.example.com/a", html, None)
        ), patch.object(url_safety, "_original_getaddrinfo", return_value=_answers("10.0.0.5")) as resolver, patch.object(
            socket.socket, "connect", spy_connect
        ):
            text, _canonical, error = extract_full_text.extract_article_text("https://news.example.com/a")

        self.assertIsNone(error)
        self.assertIn("quarterly revenue", text or "")
        resolver.assert_not_called()
        self.assertEqual(connects, [])


if __name__ == "__main__":
    unittest.main()
