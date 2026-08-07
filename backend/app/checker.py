import time
import httpx
from sqlalchemy import select
from .database import AsyncSessionLocal
from .models import URL, Check

CHECK_TIMEOUT_SECONDS = 5.0


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


async def check_all_urls():
    """Fetch every registered URL and ping it concurrently, storing a Check row each."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(URL))
        urls = result.scalars().all()

        if not urls:
            return

        results = []
        for u in urls:
            results.append((u.id, await ping_url(u.url)))

        for url_id, res in results:
            check = Check(url_id=url_id, **res)
            session.add(check)

        await session.commit()
