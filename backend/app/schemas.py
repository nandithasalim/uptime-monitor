from datetime import datetime
from pydantic import BaseModel, ConfigDict


class URLCreate(BaseModel):
    name: str
    url: str
    check_interval_seconds: int = 60


class CheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status_code: int | None
    response_time_ms: float | None
    is_up: bool
    error: str | None
    checked_at: datetime


class URLOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    url: str
    check_interval_seconds: int
    created_at: datetime
    latest_check: CheckOut | None = None
    uptime_percent_24h: float | None = None
