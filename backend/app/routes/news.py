import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import JSONResponse

from app.config import settings
from app.models import User
from app.news import SENTIMENT_TYPES, NewsError, NewsQuery, news_service
from app.routes.auth import get_current_user

router = APIRouter(prefix="/api/news", tags=["news"])

_SYMBOL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9.\-]{0,19}$")
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
_MAX_SYMBOLS = 5


def _error_response(error: NewsError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content={"error": error.message, "code": error.code})


def _bad_request(message: str) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": message, "code": "invalid_parameter"})


def _parse_symbols(raw: str | None, exchange: str | None = None) -> tuple[str, ...] | JSONResponse:
    if not raw:
        return ()
    symbols: list[str] = []
    for part in raw.split(","):
        symbol = part.strip().upper()
        if not _SYMBOL_RE.match(symbol):
            return _bad_request(f"Invalid ticker symbol: {part.strip()[:20]!r}.")
        if exchange and exchange.upper() == "NSE" and settings.marketaux_nse_symbol_suffix and "." not in symbol:
            symbol = f"{symbol}{settings.marketaux_nse_symbol_suffix}"
        if symbol not in symbols:
            symbols.append(symbol)
    if len(symbols) > _MAX_SYMBOLS:
        return _bad_request(f"At most {_MAX_SYMBOLS} symbols can be requested at once.")
    return tuple(symbols)


def _parse_search(raw: str | None) -> str | None | JSONResponse:
    if raw is None:
        return None
    text = _CONTROL_RE.sub(" ", raw).strip()
    if not text:
        return None
    if len(text) < 2:
        return _bad_request("Search text must be at least 2 characters.")
    return text[:100]


def _parse_date(raw: str | None, label: str) -> str | None | JSONResponse:
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return _bad_request(f"{label} must be an ISO-8601 date or datetime.")
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc)
    return parsed.strftime("%Y-%m-%dT%H:%M:%S")


def _run(
    *,
    symbols: str | None,
    exchange: str | None,
    q: str | None,
    sentiment: str | None,
    published_after: str | None,
    published_before: str | None,
    page: int,
    limit: int | None,
):
    parsed_symbols = _parse_symbols(symbols, exchange)
    if isinstance(parsed_symbols, JSONResponse):
        return parsed_symbols
    parsed_search = _parse_search(q)
    if isinstance(parsed_search, JSONResponse):
        return parsed_search
    after = _parse_date(published_after, "published_after")
    if isinstance(after, JSONResponse):
        return after
    before = _parse_date(published_before, "published_before")
    if isinstance(before, JSONResponse):
        return before
    if sentiment is not None and sentiment not in SENTIMENT_TYPES:
        return _bad_request("sentiment must be positive, negative, or neutral.")

    query = NewsQuery(
        symbols=parsed_symbols,
        search=parsed_search,
        sentiment=sentiment,
        published_after=after,
        published_before=before,
        page=page,
        limit=min(limit or settings.marketaux_max_limit, settings.marketaux_max_limit),
    )
    try:
        return news_service.get_news(query)
    except NewsError as error:
        return _error_response(error)


@router.get("")
def get_news(
    symbols: str | None = Query(default=None, max_length=120),
    exchange: str | None = Query(default=None, max_length=10),
    q: str | None = Query(default=None, max_length=200),
    sentiment: str | None = Query(default=None, max_length=10),
    published_after: str | None = Query(default=None, max_length=40),
    published_before: str | None = Query(default=None, max_length=40),
    page: int = Query(default=1, ge=1, le=100),
    limit: int | None = Query(default=None, ge=1, le=100),
    _user: User = Depends(get_current_user),
):
    """General financial news, with optional ticker, keyword, sentiment and time filters."""
    return _run(
        symbols=symbols,
        exchange=exchange,
        q=q,
        sentiment=sentiment,
        published_after=published_after,
        published_before=published_before,
        page=page,
        limit=limit,
    )


@router.get("/company/{symbol}")
def get_company_news(
    symbol: str = Path(max_length=20),
    exchange: str | None = Query(default=None, max_length=10),
    sentiment: str | None = Query(default=None, max_length=10),
    page: int = Query(default=1, ge=1, le=100),
    limit: int | None = Query(default=None, ge=1, le=100),
    _user: User = Depends(get_current_user),
):
    """News mentioning a single company. Pass ``exchange=NSE`` for Quantx (NSE) symbols."""
    result = _run(
        symbols=symbol,
        exchange=exchange,
        q=None,
        sentiment=sentiment,
        published_after=None,
        published_before=None,
        page=page,
        limit=limit,
    )
    if isinstance(result, dict):
        result = {**result, "symbol": symbol.upper()}
    return result


@router.get("/search")
def search_news(
    q: str = Query(min_length=2, max_length=200),
    sentiment: str | None = Query(default=None, max_length=10),
    page: int = Query(default=1, ge=1, le=100),
    limit: int | None = Query(default=None, ge=1, le=100),
    _user: User = Depends(get_current_user),
):
    """Keyword search across article titles and text."""
    return _run(
        symbols=None,
        exchange=None,
        q=q,
        sentiment=sentiment,
        published_after=None,
        published_before=None,
        page=page,
        limit=limit,
    )


@router.get("/sentiment")
def get_news_by_sentiment(
    type: str = Query(pattern="^(positive|negative|neutral)$"),
    symbols: str | None = Query(default=None, max_length=120),
    exchange: str | None = Query(default=None, max_length=10),
    page: int = Query(default=1, ge=1, le=100),
    limit: int | None = Query(default=None, ge=1, le=100),
    _user: User = Depends(get_current_user),
):
    """News where at least one identified entity has the requested sentiment."""
    return _run(
        symbols=symbols,
        exchange=exchange,
        q=None,
        sentiment=type,
        published_after=None,
        published_before=None,
        page=page,
        limit=limit,
    )
