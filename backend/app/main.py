from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from .checker import check_all_urls, ping_url, save_check_and_maybe_alert
from .database import get_db, init_db
from .models import Check, URL
from .schemas import CheckOut, IncidentOut, URLCreate, URLOut

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Tick every 15s and let check_all_urls() decide, per URL, whether that URL's
    # own check_interval_seconds has actually elapsed. Ticking faster than the
    # default 60s interval is what makes a URL configured for e.g. 30s actually
    # get checked that often, instead of everything being locked to one global
    # 60s cadence regardless of what each URL is set to.
    scheduler.add_job(check_all_urls, "interval", seconds=15, id="check_all_urls")
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Uptime Monitor API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/urls", response_model=URLOut, status_code=201)
async def create_url(payload: URLCreate, db: AsyncSession = Depends(get_db)):
    url = URL(
        name=payload.name,
        url=payload.url,
        check_interval_seconds=payload.check_interval_seconds,
        webhook_url=payload.webhook_url,
    )
    db.add(url)
    await db.commit()
    await db.refresh(url)

    # Run an immediate check so the new URL doesn't sit with no data for up to 60s
    result = await ping_url(url.url)
    await save_check_and_maybe_alert(db, url, result)
    await db.commit()

    return await _to_url_out(url.id, db)


@app.get("/urls", response_model=list[URLOut])
async def list_urls(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(URL).order_by(URL.created_at))
    urls = result.scalars().all()
    return [await _to_url_out(u.id, db, preloaded=u) for u in urls]


@app.get("/urls/{url_id}", response_model=URLOut)
async def get_url(url_id: int, db: AsyncSession = Depends(get_db)):
    url = await db.get(URL, url_id)
    if not url:
        raise HTTPException(404, "URL not found")
    return await _to_url_out(url_id, db, preloaded=url)


@app.delete("/urls/{url_id}", status_code=204)
async def delete_url(url_id: int, db: AsyncSession = Depends(get_db)):
    url = await db.get(URL, url_id)
    if not url:
        raise HTTPException(404, "URL not found")
    await db.delete(url)
    await db.commit()


@app.get("/urls/{url_id}/checks", response_model=list[CheckOut])
async def get_checks(url_id: int, limit: int = 50, db: AsyncSession = Depends(get_db)):
    url = await db.get(URL, url_id)
    if not url:
        raise HTTPException(404, "URL not found")
    result = await db.execute(
        select(Check).where(Check.url_id == url_id).order_by(Check.checked_at.desc()).limit(limit)
    )
    checks = result.scalars().all()
    return list(reversed(checks))  # chronological order for charting


@app.post("/urls/{url_id}/check-now", response_model=URLOut)
async def check_now(url_id: int, db: AsyncSession = Depends(get_db)):
    url = await db.get(URL, url_id)
    if not url:
        raise HTTPException(404, "URL not found")
    result = await ping_url(url.url)
    await save_check_and_maybe_alert(db, url, result)
    await db.commit()
    return await _to_url_out(url_id, db)


async def _get_last_incident(db: AsyncSession, url_id: int) -> IncidentOut | None:
    """Find the most recent moment this URL's status flipped (up->down or
    down->up), by walking its recent check history in chronological order and
    watching for the point where is_up differs from the previous check.

    This is deliberately computed on the fly from existing Check rows rather
    than stored in its own table: at MVP scale (a few dozen URLs, checked every
    ~minute) this query is cheap, and it avoids a second table that has to be
    kept in sync with `checks` every time a status changes.
    """
    result = await db.execute(
        select(Check.checked_at, Check.is_up)
        .where(Check.url_id == url_id)
        .order_by(Check.checked_at.asc())
        .limit(200)
    )
    rows = result.all()

    last_transition = None
    prev_is_up = None
    for checked_at, is_up in rows:
        if prev_is_up is not None and is_up != prev_is_up:
            last_transition = (checked_at, is_up)
        prev_is_up = is_up

    if last_transition is None:
        return None
    return IncidentOut(changed_at=last_transition[0], is_up=last_transition[1])


async def _to_url_out(url_id: int, db: AsyncSession, preloaded: URL | None = None) -> URLOut:
    url = preloaded or await db.get(URL, url_id)

    latest_result = await db.execute(
        select(Check).where(Check.url_id == url_id).order_by(Check.checked_at.desc()).limit(1)
    )
    latest = latest_result.scalar_one_or_none()

    since = datetime.now(timezone.utc) - timedelta(hours=24)
    total_result = await db.execute(
        select(func.count(Check.id)).where(Check.url_id == url_id, Check.checked_at >= since)
    )
    total = total_result.scalar_one()
    up_result = await db.execute(
        select(func.count(Check.id)).where(
            Check.url_id == url_id, Check.checked_at >= since, Check.is_up.is_(True)
        )
    )
    up = up_result.scalar_one()
    uptime_pct = round((up / total) * 100, 1) if total > 0 else None
    last_incident = await _get_last_incident(db, url_id)

    return URLOut(
        id=url.id,
        name=url.name,
        url=url.url,
        check_interval_seconds=url.check_interval_seconds,
        webhook_url=url.webhook_url,
        created_at=url.created_at,
        latest_check=CheckOut.model_validate(latest) if latest else None,
        uptime_percent_24h=uptime_pct,
        last_incident=last_incident,
    )