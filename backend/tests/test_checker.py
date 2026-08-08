"""Tests for ping_url()'s up/down classification — the core piece of logic this
whole app depends on getting right. These mock httpx (via respx) rather than
hitting real sites, so they run deterministically and offline: no flaky
third-party services, no network dependency, no waiting on real timeouts.
"""

import httpx
import pytest
import respx

from app.checker import ping_url


@pytest.fixture(autouse=True)
def no_real_ssl_check(monkeypatch):
    """ping_url() also reads the TLS certificate for https:// URLs, which is a
    real (blocking) network call — see _get_ssl_days_remaining. These tests are
    about HTTP status/timeout/connection-error classification, not certificate
    parsing, so we stub that call out to keep the tests fast and offline."""
    monkeypatch.setattr("app.checker._get_ssl_days_remaining", lambda *a, **k: None)


@respx.mock
async def test_2xx_status_is_up():
    respx.get("https://example.com").mock(return_value=httpx.Response(200))
    result = await ping_url("https://example.com")
    assert result["is_up"] is True
    assert result["status_code"] == 200
    assert result["error"] is None


@respx.mock
async def test_3xx_redirect_is_treated_as_up():
    # httpx follows redirects (follow_redirects=True in ping_url), so a 301
    # that ultimately lands on a 200 should read as up with the final status.
    respx.get("https://example.com/old").mock(
        return_value=httpx.Response(301, headers={"Location": "https://example.com/new"})
    )
    respx.get("https://example.com/new").mock(return_value=httpx.Response(200))
    result = await ping_url("https://example.com/old")
    assert result["is_up"] is True
    assert result["status_code"] == 200


@respx.mock
async def test_404_is_down():
    respx.get("https://example.com").mock(return_value=httpx.Response(404))
    result = await ping_url("https://example.com")
    assert result["is_up"] is False
    assert result["status_code"] == 404
    assert result["error"] is None  # a clean 404 isn't an "error", just "down"


@respx.mock
async def test_500_is_down():
    respx.get("https://example.com").mock(return_value=httpx.Response(500))
    result = await ping_url("https://example.com")
    assert result["is_up"] is False
    assert result["status_code"] == 500


@respx.mock
async def test_timeout_is_down_with_explainable_error():
    respx.get("https://slow.example.com").mock(side_effect=httpx.TimeoutException("timed out"))
    result = await ping_url("https://slow.example.com")
    assert result["is_up"] is False
    assert result["status_code"] is None
    assert "Timed out" in result["error"]


@respx.mock
async def test_connection_error_is_down_with_explainable_error():
    respx.get("https://this-domain-does-not-exist.invalid").mock(
        side_effect=httpx.ConnectError("Name or service not known")
    )
    result = await ping_url("https://this-domain-does-not-exist.invalid")
    assert result["is_up"] is False
    assert result["status_code"] is None
    assert result["error"]  # some explanation is present, not just a blank failure


@respx.mock
async def test_response_time_is_recorded_and_non_negative():
    respx.get("https://example.com").mock(return_value=httpx.Response(200))
    result = await ping_url("https://example.com")
    assert result["response_time_ms"] is not None
    assert result["response_time_ms"] >= 0