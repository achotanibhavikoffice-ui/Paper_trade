from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, CashLedger, Instrument, User
from app.routes.auth import create_initial_account_for_user, get_current_user
from app.schemas import (
    AccountResponse,
    InstrumentResponse,
    LedgerEntryResponse,
    PaginatedLedgerResponse,
)

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/account/me", response_model=AccountResponse)
def get_my_account(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccountResponse:
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    if account is None:
        account = create_initial_account_for_user(user, db)
    return AccountResponse.model_validate(account)


@router.get("/account/ledger", response_model=PaginatedLedgerResponse)
def get_my_ledger(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PaginatedLedgerResponse:
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    if account is None:
        account = create_initial_account_for_user(user, db)

    total = db.scalar(
        select(func.count(CashLedger.id)).where(CashLedger.account_id == account.id)
    ) or 0

    entries = db.scalars(
        select(CashLedger)
        .where(CashLedger.account_id == account.id)
        .order_by(CashLedger.created_at.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    items = [LedgerEntryResponse.model_validate(entry) for entry in entries]
    return PaginatedLedgerResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/instruments", response_model=list[InstrumentResponse])
def list_instruments(
    q: str | None = Query(default=None, min_length=1, max_length=40),
    exchange: str | None = Query(default=None, max_length=10),
    tradable_only: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[InstrumentResponse]:
    query = select(Instrument)
    if tradable_only or not q:
        # Default browse view emphasizes tradable equities
        query = query.where(Instrument.is_tradable.is_(True))
    if q:
        query = query.where(Instrument.symbol.ilike(f"%{q.strip()}%") | Instrument.name.ilike(f"%{q.strip()}%"))
    if exchange:
        query = query.where(Instrument.exchange == exchange.upper())
    instruments = db.scalars(query.order_by(Instrument.is_tradable.desc(), Instrument.symbol.asc()).limit(limit).offset(offset)).all()

    from app.services.market_data import market_data, market_store
    result = []
    for inst in instruments:
        resp = InstrumentResponse.model_validate(inst)
        mq = market_data.quotes.get(inst.symbol)
        quote = market_store.get_quote(inst.symbol)
        if mq:
            lp = float(mq.get("last_price") or 0.0)
            prev = float(mq.get("previous_close") or lp)
            pct = ((lp - prev) / prev * 100.0) if prev > 0 else 0.0
            resp.price = lp
            resp.change = f"{'+' if pct >= 0 else ''}{pct:.2f}%"
            resp.change_percent = pct
            resp.up = pct >= 0
            resp.is_live = mq.get("data_source") == "021"
        elif quote and quote.price > 0:
            resp.price = quote.price
            resp.change = f"{'+' if quote.change_percent >= 0 else ''}{quote.change_percent:.2f}%"
            resp.change_percent = quote.change_percent
            resp.up = quote.change_percent >= 0
            resp.is_live = quote.source == "live"
        result.append(resp)
    return result


@router.get("/instruments/{symbol}", response_model=InstrumentResponse)
def get_instrument_by_symbol(symbol: str, db: Session = Depends(get_db)) -> InstrumentResponse:
    target = symbol.strip().upper()
    inst = db.scalars(
        select(Instrument).where(Instrument.symbol.ilike(target)).order_by(Instrument.is_tradable.desc())
    ).first()
    if inst:
        return InstrumentResponse.model_validate(inst)

    import uuid
    return InstrumentResponse(
        id=uuid.uuid5(uuid.NAMESPACE_DNS, f"stock:{target}"),
        symbol=target,
        name=target,
        exchange="NSE",
        instrument_type="EQUITY",
        sector="Indian Market",
        is_tradable=False,
        lot_size=1,
        provider_token=None,
        provider_exchange=None,
        tick_size_paise=5,
    )
