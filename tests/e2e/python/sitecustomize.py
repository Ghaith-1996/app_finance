"""E2E transport adapters only. All application, Supabase and parser code stays real."""
import io
import json
import os
import socket
import urllib.request
import httpx
import requests
from urllib.parse import urlsplit

_counts = {}


def _ledger(**entry):
    with open(os.environ["E2E_LEDGER"], "a", encoding="utf8") as output:
        output.write(json.dumps({"transport": "python", "pid": os.getpid(), **entry}) + "\n")


def _response(method, url):
    parsed = urlsplit(str(url))
    origin = f"{parsed.scheme}://{parsed.netloc}"
    if origin == "http://supabase:8000":
        return None
    with open(os.environ["E2E_HTTP_FIXTURES"], encoding="utf8") as source:
        fixture = json.load(source)
    key = (fixture["scenario"], method, origin, parsed.path)
    ordinal = _counts[key] = _counts.get(key, 0) + 1
    row = next((r for r in fixture["responses"] if r["origin"] == origin and r["method"] == method and r["path"] == parsed.path and r.get("ordinal", ordinal) == ordinal), None)
    _ledger(scenario=fixture["scenario"], method=method, path=parsed.path, ordinal=ordinal, status=row.get("status", 200) if row else "blocked")
    if row is None or row.get("networkError"):
        raise OSError("E2E external transport refused")
    body = row.get("body", "")
    return row.get("status", 200), row.get("headers", {"content-type": "application/json"}), (body if isinstance(body, str) else json.dumps(body)).encode()


_requests_send = requests.Session.send


def _send_requests(self, request, **kwargs):
    result = _response(request.method, request.url)
    if result is None:
        return _requests_send(self, request, **kwargs)
    status, headers, body = result
    response = requests.Response()
    response.status_code, response.url, response.request = status, request.url, request
    response.headers.update(headers)
    response._content, response.raw = body, io.BytesIO(body)
    return response


requests.Session.send = _send_requests
_httpx_send = httpx.Client.send
_httpx_async_send = httpx.AsyncClient.send


def _send_httpx(self, request, **kwargs):
    result = _response(request.method, request.url)
    if result is None:
        return _httpx_send(self, request, **kwargs)
    status, headers, body = result
    return httpx.Response(status, headers=headers, content=body, request=request)


async def _send_httpx_async(self, request, **kwargs):
    result = _response(request.method, request.url)
    if result is None:
        return await _httpx_async_send(self, request, **kwargs)
    status, headers, body = result
    return httpx.Response(status, headers=headers, content=body, request=request)


httpx.Client.send, httpx.AsyncClient.send = _send_httpx, _send_httpx_async
_urlopen = urllib.request.urlopen


def _open_url(request, *args, **kwargs):
    url = request.full_url if isinstance(request, urllib.request.Request) else request
    method = request.get_method() if isinstance(request, urllib.request.Request) else "GET"
    result = _response(method, url)
    if result is None:
        return _urlopen(request, *args, **kwargs)
    status, headers, body = result
    from email.message import Message
    message = Message()
    for key, value in headers.items():
        message[key] = value
    response = urllib.response.addinfourl(io.BytesIO(body), message, url, status)
    if status >= 400:
        raise urllib.error.HTTPError(url, status, "E2E fixture", message, response)
    return response


urllib.request.urlopen = _open_url
_getaddrinfo = socket.getaddrinfo


def _resolve(host, port, *args, **kwargs):
    if host == "publisher.e2e.invalid":
        return _getaddrinfo("93.184.216.34", port, *args, **kwargs)
    return _getaddrinfo(host, port, *args, **kwargs)


socket.getaddrinfo = _resolve
_ledger(event="sitecustomize-loaded")
