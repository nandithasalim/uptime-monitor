import asyncio
import socket
import ssl
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from sqlalchemy import select
from .database import AsyncSessionLocal
from .models import URL, Check

CHECK_TIMEOUT_SECONDS = 5.0

# Some sites treat headerless requests as bot/scanner traffic and reject them
# outright (connection reset, no response) even though they're perfectly up.
# A normal-looking User-Agent avoids false "down" readings from that behavior.
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; UptimeMonitor/1.0; +https://github.com/)"
}


def _get_ssl_days_remaining(hostname: str, port: int = 443, timeout: float = 5.0) -> int | None:
    """Connect to hostname:port, pull the TLS certificate, and return how many
    days remain until it expires. Returns None for non-TLS URLs or if the
    connection/handshake fails for any reason (that failure will already be
    reflected in the check's is_up/error from ping_url, so we don't need to
    report it twice here). This is a blocking, synchronous call by nature
    (Python's ssl/socket modules don't have async equivalents), so callers
    should run it via asyncio.to_thread rather than calling it directly on
    the event loop.
    """
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((hostname, port), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
        expires_at = datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z").replace(
            tzinfo=timezone.utc
        )
        return (expires_at - datetime.now(timezone.utc)).days
    except Exception:
        return None


async def ping_url(url: str) -> dict:
    """Ping a single URL and return the check result. Treats timeouts,
    connection errors, and non-2xx/3xx status codes as 'down'. For https://
    URLs, also reports how many days remain on the TLS certificate."""
    start = time.perf_counter()
    parsed = urlparse(url)

    ssl_days_remaining = None
    if parsed.scheme == "https" and parsed.hostname:
        ssl_days_remaining = await asyncio.to_thread(
            _get_ssl_days_remaining, parsed.hostname, parsed.port or 443
        )

    try:
        async with httpx.AsyncClient(
            timeout=CHECK_TIMEOUT_SECONDS,
            follow_redirects=True,
            trust_env=False,  # ignore ambient HTTP(S)_PROXY/ALL_PROXY env vars so
            # checks never silently depend on (or break on) the host's proxy config
            headers=DEFAULT_HEADERS,
        ) as client:
            resp = await client.get(url)
        elapsed_ms = (time.perf_counter() - start) * 1000
        is_up = 200 <= resp.status_code < 400
        return {
            "status_code": resp.status_code,
            "response_time_ms": round(elapsed_ms, 2),
            "is_up": is_up,
            "error": None,
            "ssl_days_remaining": ssl_days_remaining,
        }
    except httpx.TimeoutException:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "status_code": None,
            "response_time_ms": round(elapsed_ms, 2),
            "is_up": False,
            "error": f"Timed out after {CHECK_TIMEOUT_SECONDS}s",
            "ssl_days_remaining": ssl_days_remaining,
        }
    except httpx.RequestError as exc:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "status_code": None,
            "response_time_ms": round(elapsed_ms, 2),
            "is_up": False,
            "error": str(exc)[:500],
            "ssl_days_remaining": ssl_days_remaining,
        }


async def _send_webhook_alert(webhook_url: str, url_obj: URL, result: dict, went_down: bool):
    """Best-effort POST to the user-configured webhook when a URL's status
    flips. Failures here are swallowed on purpose: a broken/unreachable
    webhook shouldn't ever cause a monitoring check itself to fail or roll
    back — alerting is a side effect of monitoring, not the core job."""
    payload = {
        "event": "down" if went_down else "recovered",
        "name": url_obj.name,
        "url": url_obj.url,
        "status_code": result.get("status_code"),
        "error": result.get("error"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=5.0, trust_env=False) as client:
            await client.post(webhook_url, json=payload)
    except Exception:
        pass


async def save_check_and_maybe_alert(session, url_obj: URL, result: dict):
    """Persist a Check row for url_obj and, if this check's is_up differs from
    the URL's previous is_up (i.e. it just flipped), fire a webhook alert if
    one is configured. Centralizing this (rather than duplicating "insert a
    Check row" in every endpoint/scheduler path) is what guarantees alerts
    fire consistently whether the check came from the schedule, a manual
    "check now" click, or the immediate check on URL creation.
    """
    prev_result = await session.execute(
        select(Check.is_up)
        .where(Check.url_id == url_obj.id)
        .order_by(Check.checked_at.desc())
        .limit(1)
    )
    prev_is_up = prev_result.scalar_one_or_none()

    check = Check(url_id=url_obj.id, **result)
    session.add(check)

    if url_obj.webhook_url and prev_is_up is not None and prev_is_up != result["is_up"]:
        await _send_webhook_alert(url_obj.webhook_url, url_obj, result, went_down=not result["is_up"])

    return check


async def _is_due(session, u: URL) -> bool:
    """A URL is due for a check if it's never been checked, or its own
    check_interval_seconds has elapsed since its last check. This is what makes
    the per-URL interval setting actually mean something, rather than every URL
    being force-checked on one global 60s tick regardless of what it's set to."""
    latest_result = await session.execute(
        select(Check.checked_at).where(Check.url_id == u.id).order_by(Check.checked_at.desc()).limit(1)
    )
    latest = latest_result.scalar_one_or_none()
    if latest is None:
        return True
    if latest.tzinfo is None:
        latest = latest.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - latest).total_seconds()
    return elapsed >= u.check_interval_seconds


async def check_all_urls():
    """Ping every URL that is currently due for a check, all at once, and store
    a Check row for each (alerting via webhook if a URL's status just flipped).
    Runs on a short scheduler tick (see main.py); which URLs actually get
    pinged on a given tick depends on each URL's own interval.

    Pinging is done concurrently via asyncio.gather instead of one at a time in
    a loop: pinging N URLs sequentially means total time scales with N (and with
    how slow/unresponsive each site is, up to the 5s timeout each) which can
    make a check round take longer than the interval it's supposed to run on.
    Running them concurrently means the whole round takes roughly as long as the
    single slowest check, not the sum of all of them.
    """
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(URL))
        urls = result.scalars().all()

        if not urls:
            return

        due_urls = [u for u in urls if await _is_due(session, u)]
        if not due_urls:
            return

        results = await asyncio.gather(*(ping_url(u.url) for u in due_urls))

        for u, res in zip(due_urls, results):
            await save_check_and_maybe_alert(session, u, res)

        await session.commit()