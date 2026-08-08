from datetime import datetime
from pydantic import BaseModel, ConfigDict


class URLCreate(BaseModel):
    name: str
    url: str
    check_interval_seconds: int = 60
    webhook_url: str | None = None


class CheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status_code: int | None
    response_time_ms: float | None
    is_up: bool
    error: str | None
    ssl_days_remaining: int | None
    checked_at: datetime


class IncidentOut(BaseModel):
    """The most recent up<->down transition for a URL. `is_up` is the state it
    transitioned TO: False means "went down at changed_at" (down since then, if
    still down), True means "recovered at changed_at"."""

    changed_at: datetime
    is_up: bool


class URLOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    url: str
    check_interval_seconds: int
    webhook_url: str | None = None
    created_at: datetime
    latest_check: CheckOut | None = None
    uptime_percent_24h: float | None = None
    last_incident: IncidentOut | None = None