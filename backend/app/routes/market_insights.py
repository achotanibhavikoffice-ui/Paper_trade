"""Authenticated market-reference endpoints backed by IndianAPI (history, movers, company profile)."""

import re

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import JSONResponse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Instrument, User
from app.routes.auth import get_current_user
from app.services.indian_api import HISTORY_PERIODS, IndianApiError, indian_api

router = APIRouter(prefix="/api/market", tags=["market reference"])

# NSE symbols are alphanumeric with occasional '&', '-' or '.' (e.g. M&M, BAJAJ-AUTO).
_SYMBOL_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9&.\-]{0,24}$")
_PERIOD_PATTERN = "^(" + "|".join(HISTORY_PERIODS) + ")$"


def _error_response(error: IndianApiError) -> JSONResponse:
    return JSONResponse(status_code=error.status_code, content={"error": error.message, "code": error.code})


def _symbol(raw: str) -> str | JSONResponse:
    symbol = raw.strip().upper()
    if not _SYMBOL_RE.match(symbol):
        return JSONResponse(status_code=422, content={"error": "Invalid stock symbol.", "code": "invalid_parameter"})
    return symbol


@router.get("/history/{symbol}")
def get_price_history(
    symbol: str = Path(max_length=25),
    period: str = Query(default="1yr", pattern=_PERIOD_PATTERN),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Daily closes, volume and 50/200-day moving averages for an NSE symbol."""
    parsed = _symbol(symbol)
    if isinstance(parsed, JSONResponse):
        return parsed
    try:
        return indian_api.history(parsed, period)
    except IndianApiError as error:
        if error.code == "not_found":
            try:
                inst = db.scalars(select(Instrument).where(Instrument.symbol.ilike(parsed))).first()
                if inst and inst.name and inst.name != parsed:
                    try:
                        res = indian_api.history(inst.name, period)
                        res["symbol"] = parsed
                        return res
                    except IndianApiError:
                        pass
            except Exception:
                pass
        return _error_response(error)


@router.get("/profile/{symbol}")
def get_company_profile(
    symbol: str = Path(max_length=25),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Company snapshot: key ratios, 52-week range, analyst ratings, peers and shareholding."""
    parsed = _symbol(symbol)
    if isinstance(parsed, JSONResponse):
        return parsed
    try:
        return indian_api.profile(parsed)
    except IndianApiError as error:
        if error.code == "not_found":
            try:
                inst = db.scalars(select(Instrument).where(Instrument.symbol.ilike(parsed))).first()
                if inst and inst.name and inst.name != parsed:
                    try:
                        res = indian_api.profile(inst.name)
                        res["symbol"] = parsed
                        return res
                    except IndianApiError:
                        pass
            except Exception:
                pass
        return _error_response(error)


@router.get("/trending")
def get_trending(_user: User = Depends(get_current_user)):
    """Top gainers and losers of the latest session."""
    try:
        return indian_api.trending()
    except IndianApiError as error:
        return _error_response(error)


@router.get("/most-active")
def get_most_active(exchange: str = Query(default="NSE", pattern="^(NSE|BSE)$"), _user: User = Depends(get_current_user)):
    """Most actively traded stocks by volume on NSE or BSE."""
    try:
        return indian_api.most_active(exchange)
    except IndianApiError as error:
        return _error_response(error)


@router.get("/52-week")
def get_52_week_extremes(_user: User = Depends(get_current_user)):
    """Stocks hitting fresh 52-week highs or lows on NSE and BSE."""
    try:
        return indian_api.week_52()
    except IndianApiError as error:
        return _error_response(error)
