"""IndianAPI (stock.indianapi.in) market-reference service.

Responsibilities: call the provider with the server-side ``x-api-key`` header (the key never
appears in URLs, logs or responses), normalize payloads into Quantx's schema, cache results
(fresh TTL + stale fallback), dedupe concurrent identical requests, and translate provider
failures into :class:`IndianApiError`.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from typing import Any, Callable

from app.config import settings

logger = logging.getLogger("quantx.indian_api")

HISTORY_PERIODS = ("1m", "6m", "1yr", "3yr", "5yr", "10yr", "max")
EXCHANGES = ("NSE", "BSE")
_MAX_CACHE_ENTRIES = 512
_MAX_LIST_ITEMS = 25
_TRANSIENT_CODES = ("rate_limited", "usage_limit", "provider_unavailable", "provider_timeout")
_TICKER_SUFFIXES = (".NS", ".BO")

HttpGet = Callable[[str, dict[str, str], float], tuple[int, bytes]]


class IndianApiError(Exception):
    """A sanitized, user-presentable failure. Never carries the API key or raw upstream bodies."""

    def __init__(self, code: str, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


# -- value helpers ----------------------------------------------------------------------------


def _num(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, str):
        value = value.replace(",", "").strip()
        if not value:
            return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _int(value: Any) -> int | None:
    number = _num(value)
    return int(number) if number is not None else None


def _text(value: Any, limit: int = 2000) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text[:limit] if text else None


def _iso_date(value: Any) -> str | None:
    if not isinstance(value, str) or len(value) < 10:
        return None
    try:
        return date.fromisoformat(value[:10]).isoformat()
    except ValueError:
        return None


def _ticker(value: Any) -> str | None:
    text = _text(value, 40)
    if text is None:
        return None
    upper = text.upper()
    for suffix in _TICKER_SUFFIXES:
        if upper.endswith(suffix):
            upper = upper[: -len(suffix)]
    return upper or None


def _dicts(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


# -- normalizers ------------------------------------------------------------------------------


def normalize_history(payload: Any, symbol: str, period: str) -> dict[str, Any]:
    """Daily (or weekly, for long periods) closes with volume and 50/200-day moving averages."""
    if not isinstance(payload, dict) or not isinstance(payload.get("datasets"), list):
        raise IndianApiError("provider_unavailable", "The market-data provider returned an unexpected response.", 502)

    datasets: dict[str, dict[str, Any]] = {}
    for dataset in _dicts(payload["datasets"]):
        metric = str(dataset.get("metric") or "").strip().lower()
        if metric:
            datasets[metric] = dataset

    price = datasets.get("price", {})
    points: dict[str, dict[str, Any]] = {}
    for row in price.get("values") or []:
        if not isinstance(row, list) or len(row) < 2:
            continue
        day, close = _iso_date(row[0]), _num(row[1])
        if day and close is not None and close > 0:
            points[day] = {"date": day, "close": close, "volume": None, "delivery_percent": None, "dma50": None, "dma200": None}

    for metric in ("dma50", "dma200"):
        for row in datasets.get(metric, {}).get("values") or []:
            if isinstance(row, list) and len(row) >= 2 and (day := _iso_date(row[0])) in points:
                points[day][metric] = _num(row[1])

    for row in datasets.get("volume", {}).get("values") or []:
        if isinstance(row, list) and len(row) >= 2 and (day := _iso_date(row[0])) in points:
            volume = _int(row[1])
            points[day]["volume"] = volume if volume is not None and volume >= 0 else None
            if len(row) >= 3 and isinstance(row[2], dict):
                points[day]["delivery_percent"] = _num(row[2].get("delivery"))

    ordered = [points[day] for day in sorted(points)]
    meta = price.get("meta") if isinstance(price.get("meta"), dict) else {}
    return {
        "symbol": symbol,
        "period": period,
        "interval": "1W" if meta.get("is_weekly") else "1D",
        "points": ordered,
        "count": len(ordered),
        "first_date": ordered[0]["date"] if ordered else None,
        "last_date": ordered[-1]["date"] if ordered else None,
        "source": "indianapi",
    }


def normalize_mover(raw: dict[str, Any]) -> dict[str, Any] | None:
    """One row from /trending or /NSE_most_active style payloads. ``close`` there is the previous close."""
    symbol = _ticker(raw.get("ticker_id") or raw.get("ticker") or raw.get("ric"))
    name = _text(raw.get("company_name") or raw.get("company"), 120)
    price = _num(raw.get("price"))
    if (symbol is None and name is None) or price is None:
        return None
    return {
        "symbol": symbol,
        "name": name,
        "exchange": _text(raw.get("exchange_type"), 10),
        "price": price,
        "change": _num(raw.get("net_change")),
        "percent_change": _num(raw.get("percent_change")),
        "open": _num(raw.get("open")),
        "high": _num(raw.get("high")),
        "low": _num(raw.get("low")),
        "previous_close": _num(raw.get("close")),
        "volume": _int(raw.get("volume")),
        "year_high": _num(raw.get("year_high") if raw.get("year_high") not in (None, "") else raw.get("52_week_high")),
        "year_low": _num(raw.get("year_low") if raw.get("year_low") not in (None, "") else raw.get("52_week_low")),
        "rating": _text(raw.get("overall_rating"), 40),
        "short_term_trend": _text(raw.get("short_term_trends") or raw.get("short_term_trend"), 40),
        "long_term_trend": _text(raw.get("long_term_trends") or raw.get("long_term_trend"), 40),
    }


def _movers(value: Any) -> list[dict[str, Any]]:
    return [m for m in (normalize_mover(r) for r in _dicts(value)) if m][:_MAX_LIST_ITEMS]


def normalize_trending(payload: Any) -> dict[str, Any]:
    block = payload.get("trending_stocks") if isinstance(payload, dict) else None
    if not isinstance(block, dict):
        raise IndianApiError("provider_unavailable", "The market-data provider returned an unexpected response.", 502)
    return {"gainers": _movers(block.get("top_gainers")), "losers": _movers(block.get("top_losers"))}


def normalize_most_active(payload: Any, exchange: str) -> dict[str, Any]:
    if not isinstance(payload, list):
        raise IndianApiError("provider_unavailable", "The market-data provider returned an unexpected response.", 502)
    return {"exchange": exchange, "items": _movers(payload)}


def _extreme(raw: dict[str, Any], field: str) -> dict[str, Any] | None:
    symbol = _ticker(raw.get("ticker"))
    price = _num(raw.get("price"))
    if symbol is None or price is None:
        return None
    return {"symbol": symbol, "name": _text(raw.get("company"), 120), "price": price, "value": _num(raw.get(field))}


def normalize_52_week(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise IndianApiError("provider_unavailable", "The market-data provider returned an unexpected response.", 502)
    result: dict[str, Any] = {}
    for exchange in EXCHANGES:
        block = payload.get(f"{exchange}_52WeekHighLow")
        block = block if isinstance(block, dict) else {}
        result[exchange.lower()] = {
            "highs": [e for e in (_extreme(r, "52_week_high") for r in _dicts(block.get("high52Week"))) if e][:_MAX_LIST_ITEMS],
            "lows": [e for e in (_extreme(r, "52_week_low") for r in _dicts(block.get("low52Week"))) if e][:_MAX_LIST_ITEMS],
        }
    return result


def normalize_profile(payload: Any, symbol: str) -> dict[str, Any]:
    if not isinstance(payload, dict) or not (payload.get("companyName") or payload.get("currentPrice")):
        raise IndianApiError("not_found", f"No company profile was found for {symbol}.", 404)

    metrics = payload.get("keyMetrics") if isinstance(payload.get("keyMetrics"), dict) else {}

    def metric(group: str, key: str) -> float | None:
        for item in _dicts(metrics.get(group)):
            if item.get("key") == key:
                return _num(item.get("value"))
        return None

    profile = payload.get("companyProfile") if isinstance(payload.get("companyProfile"), dict) else {}
    current = payload.get("currentPrice") if isinstance(payload.get("currentPrice"), dict) else {}
    risk = payload.get("riskMeter") if isinstance(payload.get("riskMeter"), dict) else {}
    recos = payload.get("recosBar") if isinstance(payload.get("recosBar"), dict) else {}

    moving_averages = []
    for item in _dicts(payload.get("stockTechnicalData")):
        days = _int(item.get("days"))
        if days:
            moving_averages.append({"days": days, "nse": _num(item.get("nsePrice")), "bse": _num(item.get("bsePrice"))})

    ratings = []
    for item in _dicts(recos.get("stockAnalyst")):
        label = _text(item.get("ratingName"), 30)
        if label:
            ratings.append({"rating": label, "rank": _int(item.get("ratingValue")), "count": _int(item.get("numberOfAnalysts")) or 0})
    ratings.sort(key=lambda r: r["rank"] if r["rank"] is not None else 99)

    peers = []
    for item in _dicts(profile.get("peerCompanyList"))[:8]:
        name = _text(item.get("companyName"), 120)
        if name:
            peers.append({
                "name": name,
                "price": _num(item.get("price")),
                "percent_change": _num(item.get("percentChange")),
                "pe": _num(item.get("priceToEarningsValueRatio")),
                "pb": _num(item.get("priceToBookValueRatio")),
                "market_cap_cr": _num(item.get("marketCap")),
                "rating": _text(item.get("overallRating"), 40),
            })

    shareholding = []
    for item in _dicts(payload.get("shareholding")):
        history = [h for h in _dicts(item.get("categories")) if _iso_date(h.get("holdingDate"))]
        if not history:
            continue
        latest = max(history, key=lambda h: h["holdingDate"])
        shareholding.append({
            "category": _text(item.get("displayName") or item.get("categoryName"), 60),
            "percentage": _num(latest.get("percentage")),
            "as_of": _iso_date(latest.get("holdingDate")),
        })

    return {
        "symbol": symbol,
        "name": _text(payload.get("companyName"), 160),
        "industry": _text(payload.get("industry"), 120),
        "description": _text(profile.get("companyDescription"), 1500),
        "isin": _text(profile.get("isInId"), 20),
        "nse_code": _text(profile.get("exchangeCodeNse"), 30),
        "bse_code": _text(profile.get("exchangeCodeBse"), 30),
        "price": {"nse": _num(current.get("NSE")), "bse": _num(current.get("BSE"))},
        "percent_change": _num(payload.get("percentChange")),
        "year_high": _num(payload.get("yearHigh")),
        "year_low": _num(payload.get("yearLow")),
        "moving_averages": moving_averages,
        "stats": {
            "market_cap_cr": metric("priceandVolume", "marketCap"),
            "pe_ttm": metric("valuation", "pPerEBasicExcludingExtraordinaryItemsTTM"),
            "pb": metric("valuation", "priceToBookMostRecentQuarter"),
            "dividend_yield": metric("valuation", "currentDividendYieldCommonStockPrimaryIssueLTM"),
            "eps_ttm": metric("persharedata", "ePSIncludingExtraOrdinaryItemsTrailing12Month"),
            "book_value_per_share": metric("persharedata", "bookValuePerShareMostRecentQuarter"),
            "beta": metric("priceandVolume", "beta"),
            "roe_ttm": metric("mgmtEffectiveness", "returnOnAverageEquityTrailing12Month"),
            "net_margin_ttm": metric("margins", "netProfitMarginPercentTrailing12Month"),
            "change_52w_percent": metric("priceandVolume", "price52WeekPricePercentChange"),
        },
        "risk": {"category": _text(risk.get("categoryName"), 60), "std_dev": _num(risk.get("stdDev"))} if risk else None,
        "analyst_ratings": ratings,
        "peers": peers,
        "shareholding": shareholding,
    }


# -- transport --------------------------------------------------------------------------------


def _http_get(url: str, headers: dict[str, str], timeout: float) -> tuple[int, bytes]:
    """Single GET against the configured provider. Isolated so tests can mock it."""
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - configured https endpoint
            return response.status, response.read(8_000_000)
    except urllib.error.HTTPError as error:
        try:
            return error.code, error.read(100_000)
        finally:
            error.close()


class IndianApiService:
    def __init__(self, http_get: HttpGet | None = None) -> None:
        self._http_get = http_get
        self._cache: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}
        self._cache_lock = threading.Lock()
        self._inflight: dict[tuple[Any, ...], threading.Lock] = {}
        self._cooldown_until = 0.0
        self._cooldown_error: IndianApiError | None = None

    def clear(self) -> None:
        with self._cache_lock:
            self._cache.clear()
            self._inflight.clear()
            self._cooldown_until = 0.0
            self._cooldown_error = None

    @property
    def configured(self) -> bool:
        return bool(settings.indian_api_key.strip())

    # -- public API ---------------------------------------------------------------------------

    def history(self, symbol: str, period: str) -> dict[str, Any]:
        return self._cached(
            ("history", symbol, period),
            settings.indian_api_history_ttl_seconds,
            "/historical_data",
            {"stock_name": symbol, "period": period, "filter": "price"},
            lambda payload: normalize_history(payload, symbol, period),
        )

    def profile(self, symbol: str) -> dict[str, Any]:
        return self._cached(
            ("profile", symbol),
            settings.indian_api_profile_ttl_seconds,
            "/stock",
            {"name": symbol},
            lambda payload: normalize_profile(payload, symbol),
        )

    def quote_snapshot(self, symbol: str) -> dict[str, Any]:
        """Current price snapshot from /stock, cached for one polling interval."""
        ttl = max(15, settings.indian_api_quote_poll_seconds - 5)
        return self._cached(
            ("quote_snapshot", symbol), ttl, "/stock", {"name": symbol},
            lambda payload: normalize_profile(payload, symbol),
        )

    def trending(self) -> dict[str, Any]:
        return self._cached(("trending",), settings.indian_api_lists_ttl_seconds, "/trending", {}, normalize_trending)

    def most_active(self, exchange: str) -> dict[str, Any]:
        return self._cached(
            ("most_active", exchange),
            settings.indian_api_lists_ttl_seconds,
            f"/{exchange}_most_active",
            {},
            lambda payload: normalize_most_active(payload, exchange),
        )

    def week_52(self) -> dict[str, Any]:
        return self._cached(("52week",), settings.indian_api_lists_ttl_seconds, "/fetch_52_week_high_low_data", {}, normalize_52_week)

    # -- internals ----------------------------------------------------------------------------

    def _cached(
        self,
        key: tuple[Any, ...],
        ttl: int,
        path: str,
        params: dict[str, str],
        normalize: Callable[[Any], dict[str, Any]],
    ) -> dict[str, Any]:
        if not self.configured:
            raise IndianApiError("not_configured", "Market reference data is not configured. Set INDIAN_API_KEY on the server.", 503)

        cached = self._lookup(key)
        if cached and time.time() - cached[0] < ttl:
            if isinstance(cached[1], dict) and cached[1].get("__not_found__"):
                raise IndianApiError("not_found", str(cached[1].get("error", "The market-data provider has no data for this request.")), 404)
            return self._present(cached, stale=False, from_cache=True)

        with self._inflight_lock(key):
            cached = self._lookup(key)
            if cached and time.time() - cached[0] < ttl:
                if isinstance(cached[1], dict) and cached[1].get("__not_found__"):
                    raise IndianApiError("not_found", str(cached[1].get("error", "The market-data provider has no data for this request.")), 404)
                return self._present(cached, stale=False, from_cache=True)
            try:
                result = normalize(self._request(path, params))
            except IndianApiError as error:
                if error.code in _TRANSIENT_CODES and cached:
                    return self._present(
                        cached,
                        stale=True,
                        from_cache=True,
                        notice="Live market data is temporarily unavailable. Showing previously retrieved data.",
                    )
                if error.code == "not_found":
                    self._store(key, (time.time(), {"__not_found__": True, "error": error.message}))
                raise
            entry = (time.time(), result)
            self._store(key, entry)
            return self._present(entry, stale=False, from_cache=False)

    def _request(self, path: str, params: dict[str, str]) -> Any:
        now = time.time()
        if now < self._cooldown_until and self._cooldown_error is not None:
            raise self._cooldown_error

        url = settings.indian_api_base_url.rstrip("/") + path
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        headers = {
            "Accept": "application/json",
            "User-Agent": "Quantx/0.1",
            "x-api-key": settings.indian_api_key.strip(),
        }
        http_get = self._http_get or _http_get
        logger.info("IndianAPI request path=%s params=%s", path, ",".join(f"{k}={v}" for k, v in params.items()) or "-")
        try:
            status_code, body = http_get(url, headers, settings.indian_api_timeout_seconds)
        except TimeoutError:
            logger.warning("IndianAPI request timed out path=%s", path)
            raise IndianApiError("provider_timeout", "The market-data provider took too long to respond.", 504) from None
        except (urllib.error.URLError, OSError):
            logger.warning("IndianAPI request failed (network error) path=%s", path)
            raise IndianApiError("provider_unavailable", "The market-data provider is temporarily unreachable.", 502) from None

        payload = self._parse_json(body)
        if status_code != 200:
            raise self._error_for_status(status_code)
        if payload is None:
            raise IndianApiError("provider_unavailable", "The market-data provider returned an unexpected response.", 502)
        if isinstance(payload, dict) and payload and set(payload) <= {"error", "message", "detail", "status", "code"}:
            # Some endpoints answer HTTP 200 with only an error message for unknown stocks.
            raise IndianApiError("not_found", "The market-data provider has no data for this request.", 404)
        return payload

    @staticmethod
    def _parse_json(body: bytes) -> Any:
        try:
            return json.loads(body.decode("utf-8")) if body else None
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def _error_for_status(self, status_code: int) -> IndianApiError:
        logger.warning("IndianAPI responded with HTTP %s", status_code)
        if status_code in (401, 403):
            return IndianApiError("provider_auth", "The market-data provider rejected the configured API key or plan.", 502)
        if status_code == 402:
            error = IndianApiError("usage_limit", "The market-data request allowance has been used up. Try again later.", 429)
            self._set_cooldown(error, 900)
            return error
        if status_code == 429:
            error = IndianApiError("rate_limited", "The market-data provider is rate limiting requests. Please wait a moment.", 429)
            self._set_cooldown(error, 60)
            return error
        if status_code in (400, 404, 422):
            return IndianApiError("not_found", "The market-data provider has no data for this request.", 404)
        return IndianApiError("provider_unavailable", "The market-data provider is temporarily unavailable.", 502)

    def _set_cooldown(self, error: IndianApiError, seconds: int) -> None:
        self._cooldown_until = time.time() + seconds
        self._cooldown_error = error

    def _lookup(self, key: tuple[Any, ...]) -> tuple[float, dict[str, Any]] | None:
        with self._cache_lock:
            entry = self._cache.get(key)
            if entry and time.time() - entry[0] > settings.indian_api_stale_ttl_seconds:
                self._cache.pop(key, None)
                return None
            return entry

    def _store(self, key: tuple[Any, ...], entry: tuple[float, dict[str, Any]]) -> None:
        with self._cache_lock:
            if key not in self._cache and len(self._cache) >= _MAX_CACHE_ENTRIES:
                oldest = min(self._cache, key=lambda k: self._cache[k][0])
                self._cache.pop(oldest, None)
            self._cache[key] = entry

    def _inflight_lock(self, key: tuple[Any, ...]) -> threading.Lock:
        with self._cache_lock:
            return self._inflight.setdefault(key, threading.Lock())

    @staticmethod
    def _present(
        entry: tuple[float, dict[str, Any]], *, stale: bool, from_cache: bool, notice: str | None = None
    ) -> dict[str, Any]:
        fetched_ts, result = entry
        return {
            **result,
            "fetched_at": datetime.fromtimestamp(fetched_ts, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
            "cached": from_cache,
            "stale": stale,
            "notice": notice,
        }


indian_api = IndianApiService()
