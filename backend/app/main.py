from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from .checker import check_all_urls, ping_url
from .database import get_db, init_db
from .models import Check, URL
from .schemas import CheckOut, URLCreate, URLOut

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    scheduler.add_job(check_all_urls, "interval", seconds=60, id="check_all_urls")
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
    )
    db.add(url)
    await db.commit()
    await db.refresh(url)

    # Run an immediate check so the new URL doesn't sit with no data for up to 60s
    result = await ping_url(url.url)
    check = Check(url_id=url.id, **result)
    db.add(check)
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
    check = Check(url_id=url.id, **result)
    db.add(check)
    await db.commit()
    return await _to_url_out(url_id, db)


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

    return URLOut(
        id=url.id,
        name=url.name,
        url=url.url,
        check_interval_seconds=url.check_interval_seconds,
        created_at=url.created_at,
        latest_check=CheckOut.model_validate(latest) if latest else None,
        uptime_percent_24h=uptime_pct,
    )
