"""Tests for URLCreate's validation — making sure garbage input is rejected
before it ever reaches the database or the scheduler."""

import pytest
from pydantic import ValidationError

from app.schemas import URLCreate


def test_valid_https_url_is_accepted():
    payload = URLCreate(name="Example", url="https://example.com")
    assert payload.url == "https://example.com"


def test_valid_http_url_is_accepted():
    payload = URLCreate(name="Example", url="http://example.com")
    assert payload.url == "http://example.com"


@pytest.mark.parametrize(
    "bad_url",
    [
        "not a url",
        "example.com",  # missing scheme
        "ftp://example.com",  # wrong scheme
        "https://",  # scheme with no host
        "",
    ],
)
def test_invalid_url_is_rejected(bad_url):
    with pytest.raises(ValidationError):
        URLCreate(name="Example", url=bad_url)


def test_empty_name_is_rejected():
    with pytest.raises(ValidationError):
        URLCreate(name="", url="https://example.com")


def test_webhook_url_is_optional():
    payload = URLCreate(name="Example", url="https://example.com")
    assert payload.webhook_url is None


def test_invalid_webhook_url_is_rejected():
    with pytest.raises(ValidationError):
        URLCreate(name="Example", url="https://example.com", webhook_url="nonsense")


def test_valid_webhook_url_is_accepted():
    payload = URLCreate(
        name="Example", url="https://example.com", webhook_url="https://hooks.example.com/x"
    )
    assert payload.webhook_url == "https://hooks.example.com/x"