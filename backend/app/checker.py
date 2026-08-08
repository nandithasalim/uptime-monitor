import asyncio
import time
from datetime import datetime, timezone

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


async def ping_url(url: str) -> dict:
    """Ping a single URL and return the check result. Treats timeouts,
    connection errors, and non-2xx/3xx status codes as 'down'."""
    start = time.perf_counter()
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
        }
    except httpx.TimeoutException:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "status_code": None,
            "response_time_ms": round(elapsed_ms, 2),
            "is_up": False,
            "error": f"Timed out after {CHECK_TIMEOUT_SECONDS}s",
        }
    except httpx.RequestError as exc:
        elapsed_ms = (time.perf_counter() - start) * 1000
        return {
            "status_code": None,
            "response_time_ms": round(elapsed_ms, 2),
            "is_up": False,
            "error": str(exc)[:500],
        }


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
    a Check row for each. Runs on a short scheduler tick (see main.py); which
    URLs actually get pinged on a given tick depends on each URL's own interval.
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
            check = Check(url_id=u.id, **res)
            session.add(check)

        await session.commit()