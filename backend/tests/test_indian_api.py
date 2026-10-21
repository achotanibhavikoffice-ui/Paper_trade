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
from app.routes.auth import get_current_user
from app.services.indian_api import indian_api, normalize_history, normalize_mover

KEY = "sk-test-key-not-real"


def history_payload(weekly=False):
    return {
        "datasets": [
            {"metric": "Price", "label": "Price on NSE", "values": [["2026-10-08", "2076.00"], ["2026-10-07", "2080.30"], ["2026-10-09", "2156.00"], ["bad", "1"], ["2026-10-06", ""]], "meta": {"is_weekly": weekly}},
            {"metric": "DMA50", "label": "50 DMA", "values": [["2026-10-07", "2203.28"], ["2026-10-08", "2198.29"], ["2026-10-09", "2196.63"]], "meta": {}},
            {"metric": "DMA200", "label": "200 DMA", "values": [["2026-10-09", "2473.88"]], "meta": {}},
            {"metric": "Volume", "label": "Volume", "values": [["2026-10-07", 1417335, {"delivery": 38}], ["2026-10-08", 4910832, {"delivery": 33}], ["2026-10-09", 3000000]]},
        ]
    }


MOVER = {
    "ticker_id": "COROENGG", "company_name": "COROMANDEL ENGINEERING", "price": "78.90", "percent_change": "20.00",
    "net_change": "13.15", "high": "78.90", "low": "63.11", "open": "63.11", "volume": "75906", "close": "65.75",
    "exchange_type": "BSE", "overall_rating": "Bullish", "short_term_trends": "Bullish", "long_term_trends": "Bullish",
    "year_low": "48.72", "year_high": "78.9",
}


class FakeHttp:
    def __init__(self, status=200, body=None, exc=None):
        self.status = status
        self.body = body if body is not None else history_payload()
        self.exc = exc
        self.calls = []

    def __call__(self, url, headers, timeout):
        self.calls.append((url, headers))
        if self.exc:
            raise self.exc
        raw = self.body if isinstance(self.body, bytes) else json.dumps(self.body).encode()
        return self.status, raw

    def url(self, index=-1):
        return urlparse(self.calls[index][0])

    def params(self, index=-1):
        return {k: v[0] for k, v in parse_qs(self.url(index).query).items()}


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "indian_api_key", KEY)
    monkeypatch.setattr(settings, "indian_api_history_ttl_seconds", 3600)
    monkeypatch.setattr(settings, "indian_api_lists_ttl_seconds", 300)
    indian_api.clear()
    app.dependency_overrides[get_current_user] = lambda: User(name="T", email="t@example.com", password_hash="x")
    yield
    app.dependency_overrides.pop(get_current_user, None)
    indian_api.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def http(monkeypatch):
    fake = FakeHttp()
    monkeypatch.setattr(indian_api, "_http_get", fake)
    return fake


def test_history_normalized_sorted_and_key_only_in_header(client, http):
    res = client.get("/api/market/history/tcs?period=1yr")
    assert res.status_code == 200
    body = res.json()
    assert body["symbol"] == "TCS" and body["interval"] == "1D" and body["source"] == "indianapi"
    assert [p["date"] for p in body["points"]] == ["2026-10-07", "2026-10-08", "2026-10-09"]
    last = body["points"][-1]
    assert last["close"] == 2156.0 and last["dma50"] == 2196.63 and last["dma200"] == 2473.88
    assert last["volume"] == 3000000 and last["delivery_percent"] is None
    assert body["points"][0]["delivery_percent"] == 38
    assert body["first_date"] == "2026-10-07" and body["last_date"] == "2026-10-09"
    assert http.url().path == "/historical_data"
    assert http.params() == {"stock_name": "TCS", "period": "1yr", "filter": "price"}
    url, headers = http.calls[-1]
    assert headers["x-api-key"] == KEY and KEY not in url
    assert KEY not in res.text


def test_history_is_cached(client, http):
    first = client.get("/api/market/history/TCS").json()
    second = client.get("/api/market/history/TCS").json()
    assert len(http.calls) == 1
    assert first["cached"] is False and second["cached"] is True


def test_weekly_flag(http):
    assert normalize_history(history_payload(weekly=True), "TCS", "5yr")["interval"] == "1W"


def test_stale_cache_served_when_rate_limited(client, http, monkeypatch):
    client.get("/api/market/history/TCS")
    monkeypatch.setattr(settings, "indian_api_history_ttl_seconds", 0)
    http.status, http.body = 429, {"message": "Too many requests"}
    res = client.get("/api/market/history/TCS")
    assert res.status_code == 200
    body = res.json()
    assert body["stale"] is True and body["notice"] and body["count"] == 3


def test_errors_are_sanitized(client, http):
    http.status, http.body = 401, {"message": f"invalid key {KEY}"}
    res = client.get("/api/market/history/TCS")
    assert res.status_code == 502 and res.json()["code"] == "provider_auth"
    assert KEY not in res.text


def test_quota_exhausted_sets_cooldown(client, http):
    http.status, http.body = 402, {"message": "quota"}
    assert client.get("/api/market/trending").status_code == 429
    assert client.get("/api/market/most-active").status_code == 429
    assert len(http.calls) == 1


def test_network_failure_and_timeout(client, http):
    http.exc = urllib.error.URLError("down")
    assert client.get("/api/market/history/TCS").json()["code"] == "provider_unavailable"
    http.exc = TimeoutError()
    res = client.get("/api/market/history/INFY")
    assert res.status_code == 504 and res.json()["code"] == "provider_timeout"


def test_error_only_body_is_not_found(client, http):
    http.body = {"error": "Stock not found"}
    res = client.get("/api/market/history/NOPE")
    assert res.status_code == 404 and res.json()["code"] == "not_found"


def test_not_configured(client, http, monkeypatch):
    monkeypatch.setattr(settings, "indian_api_key", "")
    res = client.get("/api/market/trending")
    assert res.status_code == 503 and res.json()["code"] == "not_configured"
    assert http.calls == []


def test_validation(client, http):
    assert client.get("/api/market/history/TCS?period=2d").status_code == 422
    assert client.get("/api/market/history/%3Cscript%3E").status_code == 422
    assert client.get("/api/market/most-active?exchange=NYSE").status_code == 422
    assert http.calls == []


def test_symbol_with_ampersand_allowed(client, http):
    assert client.get("/api/market/history/M%26M").status_code == 200
    assert http.params()["stock_name"] == "M&M"


def test_requires_login(client, http):
    app.dependency_overrides.pop(get_current_user, None)
    assert client.get("/api/market/trending").status_code == 401


def test_trending_and_most_active(client, http):
    http.body = {"trending_stocks": {"top_gainers": [MOVER, {"junk": True}], "top_losers": []}}
    body = client.get("/api/market/trending").json()
    gainer = body["gainers"][0]
    assert gainer["symbol"] == "COROENGG" and gainer["previous_close"] == 65.75 and gainer["volume"] == 75906
    assert len(body["gainers"]) == 1 and body["losers"] == []

    http.body = [{"ticker": "PCJEWELLER", "company": "PC Jeweller", "price": 14.81, "percent_change": 6.5, "net_change": 0.91,
                  "volume": 895898449, "close": 13.9, "52_week_low": 7.47, "52_week_high": 15.0, "short_term_trend": "Bullish"}]
    active = client.get("/api/market/most-active?exchange=NSE").json()
    assert http.url().path == "/NSE_most_active"
    item = active["items"][0]
    assert active["exchange"] == "NSE" and item["year_high"] == 15.0 and item["short_term_trend"] == "Bullish"


def test_52_week_strips_exchange_suffix(client, http):
    http.body = {
        "NSE_52WeekHighLow": {"high52Week": [{"ticker": "DSKULKARNI.NS", "company": "DS K", "price": 28.77, "52_week_high": 28.77}], "low52Week": []},
        "BSE_52WeekHighLow": {"high52Week": [], "low52Week": [{"ticker": "AEIM.BO", "company": "AE", "price": 44.57, "52_week_low": 44.57}]},
    }
    body = client.get("/api/market/52-week").json()
    assert body["nse"]["highs"][0]["symbol"] == "DSKULKARNI"
    assert body["bse"]["lows"][0] == {"symbol": "AEIM", "name": "AE", "price": 44.57, "value": 44.57}


def test_profile_normalization(client, http):
    http.body = {
        "companyName": "Tata Consultancy Services",
        "industry": "Software & Programming",
        "companyProfile": {"companyDescription": "IT services", "isInId": "INE467B01029", "exchangeCodeNse": "TCS",
                           "peerCompanyList": [{"companyName": "Infosys", "price": 1023.4, "priceToEarningsValueRatio": 13.84, "marketCap": 414512.16}]},
        "currentPrice": {"BSE": "2163.00", "NSE": "2156.00"},
        "percentChange": "4.23", "yearHigh": "3336.70", "yearLow": "1976.00",
        "stockTechnicalData": [{"days": 50, "bsePrice": "2273.78", "nsePrice": "2275.20"}],
        "keyMetrics": {"priceandVolume": [{"key": "marketCap", "value": "781676.18"}, {"key": "beta", "value": "1.03"}],
                       "valuation": [{"key": "pPerEBasicExcludingExtraordinaryItemsTTM", "value": "14.76"}]},
        "riskMeter": {"categoryName": "Balanced risk", "stdDev": 32.53},
        "recosBar": {"stockAnalyst": [{"ratingName": "Hold", "ratingValue": 3, "numberOfAnalysts": 12}, {"ratingName": "Buy", "ratingValue": 2, "numberOfAnalysts": 14}]},
        "shareholding": [{"displayName": "Promoter", "categories": [{"holdingDate": "2026-03-31", "percentage": "71.70"}, {"holdingDate": "2026-06-30", "percentage": "71.77"}]}],
    }
    body = client.get("/api/market/profile/TCS").json()
    assert http.params() == {"name": "TCS"}
    assert body["name"] == "Tata Consultancy Services" and body["price"]["nse"] == 2156.0
    assert body["stats"]["market_cap_cr"] == 781676.18 and body["stats"]["pe_ttm"] == 14.76 and body["stats"]["pb"] is None
    assert [r["rating"] for r in body["analyst_ratings"]] == ["Buy", "Hold"]
    assert body["shareholding"][0] == {"category": "Promoter", "percentage": 71.77, "as_of": "2026-06-30"}
    assert body["moving_averages"][0] == {"days": 50, "nse": 2275.2, "bse": 2273.78}
    assert body["peers"][0]["name"] == "Infosys" and body["risk"]["category"] == "Balanced risk"


def test_mover_without_price_dropped():
    assert normalize_mover({"ticker": "X", "price": ""}) is None
