import json
import os
import sys
import urllib.error
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("JWT_SECRET", "test-secret-key-that-is-at-least-32-characters-long")
os.environ.setdefault("APP_ENV", "development")

from app.config import settings
from app.main import app
from app.models import User
from app.news import NewsQuery, news_service, normalize_article, sentiment_label
from app.routes.auth import get_current_user

TOKEN = "test-token-not-real"


def article(uuid="a1", entities=None, **overrides):
    base = {
        "uuid": uuid,
        "title": f"Headline {uuid}",
        "description": "Desc",
        "snippet": "Snippet",
        "url": f"https://example.com/{uuid}",
        "image_url": "https://example.com/i.jpg",
        "language": "en",
        "published_at": "2026-10-09T01:00:00.000000Z",
        "source": "example.com",
        "entities": entities
        if entities is not None
        else [{"symbol": "TSLA", "name": "Tesla, Inc.", "sentiment_score": 0.5, "match_score": 3.2}],
    }
    base.update(overrides)
    return base


def payload(items, found=10, returned=None, limit=3, page=1):
    return {"meta": {"found": found, "returned": len(items) if returned is None else returned, "limit": limit, "page": page}, "data": items}


class FakeHttp:
    def __init__(self, status=200, body=None, exc=None):
        self.status = status
        self.body = body if body is not None else payload([article()])
        self.exc = exc
        self.urls = []

    def __call__(self, url, timeout):
        self.urls.append(url)
        if self.exc:
            raise self.exc
        return self.status, json.dumps(self.body).encode()

    def params(self, index=-1):
        return {k: v[0] for k, v in parse_qs(urlparse(self.urls[index]).query).items()}


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "marketaux_api_token", TOKEN)
    monkeypatch.setattr(settings, "marketaux_cache_ttl_seconds", 900)
    monkeypatch.setattr(settings, "marketaux_max_limit", 3)
    news_service.clear()
    app.dependency_overrides[get_current_user] = lambda: User(name="T", email="t@example.com", password_hash="x")
    yield
    app.dependency_overrides.pop(get_current_user, None)
    news_service.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def http(monkeypatch):
    fake = FakeHttp()
    monkeypatch.setattr(news_service, "_http_get", fake)
    return fake


# 1 & 2: success + normalization
def test_success_and_normalization(client, http):
    res = client.get("/api/news")
    assert res.status_code == 200
    body = res.json()
    item = body["items"][0]
    assert item["id"] == "a1" and item["title"] == "Headline a1"
    assert item["source"] == "example.com" and item["published_at"].startswith("2026-10-09")
    assert item["entities"][0]["symbol"] == "TSLA"
    assert item["entities"][0]["sentiment_label"] == "positive"
    assert body["fetched_at"] and body["cached"] is False and body["stale"] is False
    params = http.params()
    assert params["language"] == "en" and params["must_have_entities"] == "true"
    assert params["group_similar"] == "true" and params["limit"] == "3"
    assert TOKEN not in res.text


# 3: missing optional fields, empty results
def test_missing_optional_fields_not_fabricated(client, http):
    http.body = payload([{"uuid": "x", "title": "Only title", "url": "https://example.com/x", "entities": [{"symbol": "AAPL", "name": "Apple", "sentiment_score": None}]}])
    item = client.get("/api/news").json()["items"][0]
    assert item["description"] is None and item["image_url"] is None and item["source"] is None
    assert item["sentiment_score"] is None and item["sentiment_label"] is None
    assert item["entities"][0]["sentiment_label"] is None


def test_empty_results(client, http):
    http.body = payload([], found=0)
    body = client.get("/api/news").json()
    assert body["items"] == [] and body["has_more"] is False


def test_articles_without_safe_url_are_dropped(client, http):
    http.body = payload([article("bad", url="javascript:alert(1)"), article("ok", image_url="data:text/html,x")])
    items = client.get("/api/news").json()["items"]
    assert [i["id"] for i in items] == ["ok"]
    assert items[0]["image_url"] is None


def test_per_entity_sentiment_not_shared():
    entities = [
        {"symbol": "A", "name": "A", "sentiment_score": 0.4},
        {"symbol": "B", "name": "B", "sentiment_score": -0.6},
    ]
    normalized = normalize_article(article(entities=entities))
    labels = {e["symbol"]: e["sentiment_label"] for e in normalized["entities"]}
    assert labels == {"A": "positive", "B": "negative"}
    assert normalized["sentiment_score"] is None  # ambiguous at article level
    focused = normalize_article(article(entities=entities), ("B",))
    assert focused["sentiment_label"] == "negative"


def test_sentiment_label_mapping():
    assert sentiment_label(0.01) == "positive"
    assert sentiment_label(-0.01) == "negative"
    assert sentiment_label(0) == "neutral"
    assert sentiment_label(None) is None


# 4: missing token
def test_missing_token(client, monkeypatch):
    monkeypatch.setattr(settings, "marketaux_api_token", "")
    fake = FakeHttp()
    monkeypatch.setattr(news_service, "_http_get", fake)
    res = client.get("/api/news")
    assert res.status_code == 503 and res.json()["code"] == "not_configured"
    assert fake.urls == []


# 5, 6, 7: provider failures
@pytest.mark.parametrize(
    "status,code,expected",
    [(401, "provider_auth", 502), (402, "usage_limit", 429), (429, "rate_limited", 429), (500, "provider_unavailable", 502)],
)
def test_provider_errors(client, http, status, code, expected):
    http.status = status
    http.body = {"error": {"code": "x", "message": f"secret detail {TOKEN}"}}
    res = client.get("/api/news")
    assert res.status_code == expected and res.json()["code"] == code
    assert TOKEN not in res.text and "secret detail" not in res.text


def test_timeout_and_network_errors(client, http):
    http.exc = TimeoutError()
    res = client.get("/api/news")
    assert res.status_code == 504 and res.json()["code"] == "provider_timeout"
    http.exc = urllib.error.URLError("boom")
    res = client.get("/api/news?page=2")
    assert res.status_code == 502 and res.json()["code"] == "provider_unavailable"
    assert "boom" not in res.text


def test_rate_limit_cooldown_prevents_repeated_calls(client, http):
    http.status = 429
    assert client.get("/api/news").status_code == 429
    assert client.get("/api/news?page=2").status_code == 429
    assert len(http.urls) == 1


# 8: ticker filtering
def test_ticker_filtering(client, http):
    res = client.get("/api/news/company/tsla")
    assert res.status_code == 200 and res.json()["symbol"] == "TSLA"
    params = http.params()
    assert params["symbols"] == "TSLA" and params["filter_entities"] == "true"


def test_nse_symbol_mapping(client, http):
    client.get("/api/news/company/RELIANCE?exchange=NSE")
    assert http.params()["symbols"] == "RELIANCE.NS"


def test_symbol_validation(client, http):
    assert client.get("/api/news?symbols=TSLA;DROP").status_code == 422
    assert client.get("/api/news?symbols=A,B,C,D,E,F").status_code == 422
    assert http.urls == []


# 9: sentiment filtering
def test_sentiment_filter_params(client, http):
    client.get("/api/news/sentiment?type=positive")
    assert float(http.params()["sentiment_gte"]) > 0
    client.get("/api/news/sentiment?type=negative")
    assert float(http.params()["sentiment_lte"]) < 0
    client.get("/api/news/sentiment?type=neutral")
    assert http.params()["sentiment_gte"] == "0" and http.params()["sentiment_lte"] == "0"
    assert client.get("/api/news/sentiment?type=bullish").status_code == 422


def test_sentiment_results_are_rechecked(client, http):
    http.body = payload([
        article("pos", entities=[{"symbol": "A", "name": "A", "sentiment_score": 0.3}]),
        article("neg", entities=[{"symbol": "B", "name": "B", "sentiment_score": -0.3}]),
    ])
    items = client.get("/api/news/sentiment?type=positive").json()["items"]
    assert [i["id"] for i in items] == ["pos"]


# search
def test_search_and_limit_clamped(client, http):
    assert client.get("/api/news/search?q=x").status_code == 422
    client.get("/api/news/search?q=earnings&limit=50")
    assert http.params()["search"] == "earnings" and http.params()["limit"] == "3"


def test_date_validation(client, http):
    assert client.get("/api/news?published_after=nonsense").status_code == 422
    client.get("/api/news?published_after=2026-10-01T00:00:00Z")
    assert http.params()["published_after"] == "2026-10-01T00:00:00"


# 10: cache
def test_cache_prevents_duplicate_requests(client, http):
    first = client.get("/api/news?symbols=TSLA").json()
    second = client.get("/api/news?symbols=tsla").json()
    assert len(http.urls) == 1
    assert first["cached"] is False and second["cached"] is True
    assert first["fetched_at"] == second["fetched_at"]
    client.get("/api/news?symbols=TSLA&page=2")
    assert len(http.urls) == 2


def test_stale_cache_served_on_provider_failure(client, http, monkeypatch):
    monkeypatch.setattr(settings, "marketaux_cache_ttl_seconds", 0)
    assert client.get("/api/news").status_code == 200
    http.exc = urllib.error.URLError("down")
    res = client.get("/api/news")
    assert res.status_code == 200
    body = res.json()
    assert body["stale"] is True and body["notice"] and body["items"]


def test_stale_not_used_for_auth_errors(client, http, monkeypatch):
    monkeypatch.setattr(settings, "marketaux_cache_ttl_seconds", 0)
    client.get("/api/news")
    http.status = 401
    assert client.get("/api/news").status_code == 502


def test_requires_authentication(http):
    app.dependency_overrides.pop(get_current_user, None)
    res = TestClient(app).get("/api/news")
    assert res.status_code == 401
    assert http.urls == []


def test_query_cache_key_is_stable():
    assert NewsQuery(symbols=("A",)).cache_key() == NewsQuery(symbols=("A",)).cache_key()
