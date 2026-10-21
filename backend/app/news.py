"""Marketaux financial-news service.

Responsibilities: build provider requests (token is read from backend settings only),
normalize responses, cache results (TTL + stale fallback), dedupe concurrent identical
requests, and translate provider failures into :class:`NewsError`.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from app.config import settings

logger = logging.getLogger("tradeo.news")

SENTIMENT_TYPES = ("positive", "negative", "neutral")
_MAX_CACHE_ENTRIES = 256
# Marketaux scores are floats in [-1, 1]; "strictly positive/negative" bounds for provider filters.
_EPSILON = 0.0001


class NewsError(Exception):
    """A sanitized, user-presentable failure. Never carries tokens or raw upstream bodies."""

    def __init__(self, code: str, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class NewsQuery:
    symbols: tuple[str, ...] = ()
    search: str | None = None
    sentiment: str | None = None
    published_after: str | None = None
    published_before: str | None = None
    page: int = 1
    limit: int = 3

    def cache_key(self) -> tuple[Any, ...]:
        return (
            self.symbols,
            self.search,
            self.sentiment,
            self.published_after,
            self.published_before,
            self.page,
            self.limit,
        )


def sentiment_label(score: float | None) -> str | None:
    """Positive >0, negative <0, neutral ==0; ``None`` when unavailable."""
    if score is None:
        return None
    if score > 0:
        return "positive"
    if score < 0:
        return "negative"
    return "neutral"


def _to_float(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def _safe_http_url(value: Any) -> str | None:
    """Only pass through absolute http(s) links (blocks javascript:/data: URLs)."""
    if not isinstance(value, str):
        return None
    candidate = value.strip()
    parsed = urllib.parse.urlparse(candidate)
    if parsed.scheme in ("http", "https") and parsed.netloc:
        return candidate
    return None


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    return text or None


def _normalize_entity(raw: dict[str, Any]) -> dict[str, Any] | None:
    symbol = _clean_text(raw.get("symbol"))
    name = _clean_text(raw.get("name"))
    if symbol is None and name is None:
        return None
    score = _to_float(raw.get("sentiment_score"))
    return {
        "symbol": symbol,
        "name": name,
        "exchange": _clean_text(raw.get("exchange")),
        "country": _clean_text(raw.get("country")),
        "type": _clean_text(raw.get("type")),
        "industry": _clean_text(raw.get("industry")),
        "match_score": _to_float(raw.get("match_score")),
        "sentiment_score": score,
        "sentiment_label": sentiment_label(score),
    }


def normalize_article(raw: dict[str, Any], requested_symbols: tuple[str, ...] = ()) -> dict[str, Any] | None:
    """Convert a provider article into Tradeo's schema; ``None`` if it lacks a title or safe URL."""
    title = _clean_text(raw.get("title"))
    url = _safe_http_url(raw.get("url"))
    if title is None or url is None:
        return None

    entities = [
        e for e in (_normalize_entity(item) for item in raw.get("entities") or [] if isinstance(item, dict)) if e
    ]

    # Article-level sentiment is only reported when it is unambiguous: either a single scored
    # entity, or the mean of the entities the user asked about. Otherwise per-entity scores apply.
    requested = {s.upper() for s in requested_symbols}
    relevant = [e for e in entities if e["sentiment_score"] is not None and (e["symbol"] or "").upper() in requested]
    scored = relevant or [e for e in entities if e["sentiment_score"] is not None]
    article_score: float | None = None
    if relevant:
        article_score = sum(e["sentiment_score"] for e in relevant) / len(relevant)
    elif len(scored) == 1:
        article_score = scored[0]["sentiment_score"]

    return {
        "id": _clean_text(raw.get("uuid")) or url,
        "title": title,
        "description": _clean_text(raw.get("description")),
        "snippet": _clean_text(raw.get("snippet")),
        "source": _clean_text(raw.get("source")),
        "url": url,
        "image_url": _safe_http_url(raw.get("image_url")),
        "published_at": _clean_text(raw.get("published_at")),
        "language": _clean_text(raw.get("language")),
        "entities": entities,
        "sentiment_score": article_score,
        "sentiment_label": sentiment_label(article_score),
    }


def _matches_sentiment(article: dict[str, Any], wanted: str) -> bool:
    return any(e["sentiment_label"] == wanted for e in article["entities"])


def _http_get(url: str, timeout: float) -> tuple[int, bytes]:
    """Single GET against the configured provider URL. Isolated so tests can mock it."""
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Tradeo/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - fixed https endpoint
            return response.status, response.read(2_000_000)
    except urllib.error.HTTPError as error:
        try:
            return error.code, error.read(100_000)
        finally:
            error.close()


class NewsService:
    def __init__(self, http_get: Callable[[str, float], tuple[int, bytes]] | None = None) -> None:
        self._http_get = http_get
        self._cache: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}
        self._cache_lock = threading.Lock()
        self._inflight: dict[tuple[Any, ...], threading.Lock] = {}
        self._cooldown_until = 0.0
        self._cooldown_error: NewsError | None = None

    def clear(self) -> None:
        with self._cache_lock:
            self._cache.clear()
            self._inflight.clear()
            self._cooldown_until = 0.0
            self._cooldown_error = None

    # -- public API ---------------------------------------------------------------------------

    def get_news(self, query: NewsQuery) -> dict[str, Any]:
        if not settings.marketaux_api_token.strip():
            raise NewsError(
                "not_configured",
                "Market news is not configured. Set MARKETAUX_API_TOKEN on the server.",
                503,
            )

        key = query.cache_key()
        ttl = max(0, settings.marketaux_cache_ttl_seconds)
        cached = self._lookup(key)
        if cached and time.time() - cached[0] < ttl:
            return self._present(cached, stale=False, from_cache=True)

        with self._inflight_lock(key):
            # Another thread may have populated the cache while we waited for the lock.
            cached = self._lookup(key)
            if cached and time.time() - cached[0] < ttl:
                return self._present(cached, stale=False, from_cache=True)
            try:
                result = self._fetch_from_provider(query)
            except NewsError as error:
                if error.code in ("rate_limited", "usage_limit", "provider_unavailable", "provider_timeout"):
                    if cached:
                        return self._present(
                            cached,
                            stale=True,
                            from_cache=True,
                            notice="Live news is temporarily unavailable. Showing previously retrieved articles.",
                        )
                raise
            entry = (time.time(), result)
            self._store(key, entry)
            return self._present(entry, stale=False, from_cache=False)

    # -- internals ----------------------------------------------------------------------------

    def _lookup(self, key: tuple[Any, ...]) -> tuple[float, dict[str, Any]] | None:
        with self._cache_lock:
            entry = self._cache.get(key)
            if entry and time.time() - entry[0] > settings.marketaux_stale_ttl_seconds:
                self._cache.pop(key, None)
                return None
            return entry

    def _store(self, key: tuple[Any, ...], entry: tuple[float, dict[str, Any]]) -> None:
        with self._cache_lock:
            if len(self._cache) >= _MAX_CACHE_ENTRIES:
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

    def _build_url(self, query: NewsQuery) -> str:
        limit = max(1, min(query.limit, settings.marketaux_max_limit))
        params: dict[str, str] = {
            "api_token": settings.marketaux_api_token.strip(),
            "language": "en",
            "limit": str(limit),
            "page": str(max(1, query.page)),
            "must_have_entities": "true",
            "group_similar": "true",
        }
        if query.symbols:
            params["symbols"] = ",".join(query.symbols)
            params["filter_entities"] = "true"
        if query.search:
            params["search"] = query.search
        if query.published_after:
            params["published_after"] = query.published_after
        if query.published_before:
            params["published_before"] = query.published_before
        if query.sentiment == "positive":
            params["sentiment_gte"] = str(_EPSILON)
        elif query.sentiment == "negative":
            params["sentiment_lte"] = str(-_EPSILON)
        elif query.sentiment == "neutral":
            params["sentiment_gte"] = "0"
            params["sentiment_lte"] = "0"
        return f"{settings.marketaux_base_url}?{urllib.parse.urlencode(params)}"

    def _fetch_from_provider(self, query: NewsQuery) -> dict[str, Any]:
        now = time.time()
        if now < self._cooldown_until and self._cooldown_error is not None:
            raise self._cooldown_error

        limit = max(1, min(query.limit, settings.marketaux_max_limit))
        url = self._build_url(query)
        http_get = self._http_get or _http_get
        logger.info(
            "Marketaux request page=%s limit=%s symbols=%s search=%s sentiment=%s",
            query.page,
            limit,
            ",".join(query.symbols) or "-",
            "yes" if query.search else "no",
            query.sentiment or "-",
        )
        try:
            status_code, body = http_get(url, settings.marketaux_timeout_seconds)
        except TimeoutError:
            logger.warning("Marketaux request timed out")
            raise NewsError("provider_timeout", "The news provider took too long to respond.", 504) from None
        except (urllib.error.URLError, OSError):
            logger.warning("Marketaux request failed (network error)")
            raise NewsError("provider_unavailable", "The news provider is temporarily unreachable.", 502) from None

        payload = self._parse_json(body)
        if status_code != 200:
            raise self._error_for_status(status_code, payload)
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            logger.warning("Marketaux returned an unexpected payload shape")
            raise NewsError("provider_unavailable", "The news provider returned an unexpected response.", 502)

        articles = [a for a in (normalize_article(r, query.symbols) for r in payload["data"] if isinstance(r, dict)) if a]
        meta = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}
        returned = int(meta.get("returned") or len(payload["data"]))
        found = meta.get("found") if isinstance(meta.get("found"), int) else None
        # Provider-side sentiment bounds act on entities; re-check so labels always agree with filters.
        if query.sentiment:
            articles = [a for a in articles if _matches_sentiment(a, query.sentiment)]
        has_more = returned >= limit and (found is None or found > query.page * limit)
        return {
            "items": articles,
            "page": query.page,
            "limit": limit,
            "returned": len(articles),
            "found": found,
            "has_more": bool(has_more),
        }

    @staticmethod
    def _parse_json(body: bytes) -> Any:
        try:
            return json.loads(body.decode("utf-8")) if body else None
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None

    def _error_for_status(self, status_code: int, payload: Any) -> NewsError:
        provider_code = ""
        if isinstance(payload, dict) and isinstance(payload.get("error"), dict):
            provider_code = str(payload["error"].get("code") or "")
        logger.warning("Marketaux responded with HTTP %s code=%s", status_code, provider_code or "-")

        if status_code == 401 or provider_code in ("invalid_api_token", "missing_api_token"):
            return NewsError("provider_auth", "The news provider rejected the configured API token.", 502)
        if status_code == 402 or provider_code == "usage_limit_reached":
            error = NewsError("usage_limit", "The daily news request allowance has been used up. Try again later.", 429)
            self._set_cooldown(error, 900)
            return error
        if status_code == 429 or provider_code == "rate_limit_reached":
            error = NewsError("rate_limited", "The news provider is rate limiting requests. Please wait a moment.", 429)
            self._set_cooldown(error, 60)
            return error
        if status_code == 403:
            return NewsError("provider_forbidden", "The current news plan does not allow this request.", 502)
        if status_code in (400, 404, 422):
            return NewsError("provider_bad_request", "The news provider could not process this query.", 502)
        return NewsError("provider_unavailable", "The news provider is temporarily unavailable.", 502)

    def _set_cooldown(self, error: NewsError, seconds: int) -> None:
        self._cooldown_until = time.time() + seconds
        self._cooldown_error = error


news_service = NewsService()
