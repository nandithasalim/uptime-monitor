from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _validate_http_url(v: str) -> str:
    """Basic sanity check, not full RFC validation: must have an http(s) scheme
    and a non-empty host. This is deliberately loose (it won't catch every
    malformed edge case, e.g. it doesn't verify the host actually resolves —
    that's what the check itself discovers) but it stops obviously-garbage
    input (empty strings, missing scheme, "not a url") from being silently
    saved and pinged forever."""
    v = v.strip()
    parsed = urlparse(v)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError(
            "must be a valid http:// or https:// URL, e.g. https://example.com"
        )
    return v


class URLCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    url: str
    check_interval_seconds: int = 60
    webhook_url: str | None = None

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        return _validate_http_url(v)

    @field_validator("webhook_url")
    @classmethod
    def validate_webhook_url(cls, v: str | None) -> str | None:
        if not v:
            return None
        return _validate_http_url(v)


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