from fastapi import APIRouter, Depends, HTTPException, Query, status
from decimal import Decimal
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, CashLedger, Instrument, Order, OrderEvent, PortfolioSafePoint, Position, ScenarioRun, User
from app.routes.auth import create_initial_account_for_user, get_current_user
from app.schemas import (
    AccountResponse,
    AccountResetInput,
    FeeSettingsInput,
    CapitalSetupInput,
    InstrumentResponse,
    LedgerEntryResponse,
    PaginatedLedgerResponse,
)

router = APIRouter(prefix="/api", tags=["account"])


@router.get("/account/fee-settings")
def get_fee_settings(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, str | None]:
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    if account is None:
        account = create_initial_account_for_user(user, db)
    return {
        "commission_per_order": str(account.commission_per_order) if account.commission_per_order is not None else None,
        "regulatory_fee_percent": str(account.regulatory_fee_percent),
    }


@router.put("/account/fee-settings")
def update_fee_settings(
    payload: FeeSettingsInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str | None]:
    account = db.scalar(select(Account).where(Account.user_id == user.id).with_for_update())
    if account is None:
        account = create_initial_account_for_user(user, db)
    account.commission_per_order = payload.commission_per_order.quantize(Decimal("0.01")) if payload.commission_per_order is not None else None
    account.regulatory_fee_percent = payload.regulatory_fee_percent.quantize(Decimal("0.001"))
    db.commit()
    return {
        "commission_per_order": str(account.commission_per_order) if account.commission_per_order is not None else None,
        "regulatory_fee_percent": str(account.regulatory_fee_percent),
    }


@router.put("/account/reset-balance", response_model=AccountResponse)
def reset_account_balance(
    payload: AccountResetInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccountResponse:
    account = db.scalar(select(Account).where(Account.user_id == user.id).with_for_update())
    if account is None:
        raise HTTPException(status_code=404, detail="Practice account not found.")
    balance = payload.balance.quantize(Decimal("0.01"))
    if balance < account.reserved_cash:
        raise HTTPException(status_code=422, detail="The selected balance cannot be lower than cash reserved by open orders.")
    delta = balance - account.cash_balance
    account.cash_balance = balance
    if delta:
        db.add(CashLedger(
            account_id=account.id,
            entry_type="RESET",
            amount=delta,
            balance_after=balance,
            description="Practice cash balance reset",
        ))
    db.commit()
    db.refresh(account)
    return AccountResponse.model_validate(account)


@router.post("/account/reset", response_model=AccountResponse)
def reset_practice_account(
    payload: AccountResetInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccountResponse:
    account = db.scalar(select(Account).where(Account.user_id == user.id).with_for_update())
    if account is None:
        raise HTTPException(status_code=404, detail="Practice account not found.")
    balance = payload.balance.quantize(Decimal("0.01"))

    # Clear the simulation's dependent activity in FK-safe order. The user and
    # practice account identity remain intact; performance ratios derive from
    # the now-empty trade history.
    db.execute(delete(OrderEvent).where(OrderEvent.account_id == account.id))
    db.execute(delete(Order).where(Order.account_id == account.id))
    db.execute(delete(Position).where(Position.account_id == account.id))
    db.execute(delete(ScenarioRun).where(ScenarioRun.account_id == account.id))
    db.execute(delete(PortfolioSafePoint).where(PortfolioSafePoint.account_id == account.id))
    db.execute(delete(CashLedger).where(CashLedger.account_id == account.id))

    account.initial_capital = balance
    account.cash_balance = balance
    account.reserved_cash = Decimal("0.00")
    account.capital_configured = True
    account.stress_mode = False
    db.add(CashLedger(
        account_id=account.id,
        entry_type="INITIAL_CAPITAL",
        amount=balance,
        balance_after=balance,
        description="Initial virtual capital grant",
        idempotency_key=f"INIT_CAPITAL_{user.id}",
    ))
    db.commit()
    db.refresh(account)
    return AccountResponse.model_validate(account)


def _has_trading_activity(db: Session, account: Account) -> bool:
    if account.reserved_cash != 0:
        return True
    has_trade_ledger = db.scalar(
        select(CashLedger.id)
        .where(
            CashLedger.account_id == account.id,
            CashLedger.entry_type.notin_(("INITIAL_CAPITAL", "ADJUSTMENT")),
        )
        .limit(1)
    ) is not None
    has_orders = db.scalar(select(Order.id).where(Order.account_id == account.id).limit(1)) is not None
    has_positions = db.scalar(select(Position.id).where(Position.account_id == account.id).limit(1)) is not None
    return has_trade_ledger or has_orders or has_positions


def _consolidate_unused_setup_ledger(db: Session, account: Account) -> bool:
    """Repair old setup-only adjustments so the chosen balance is the grant."""
    if account.cash_balance != account.initial_capital or _has_trading_activity(db, account):
        return False

    initial_entry = db.scalar(
        select(CashLedger)
        .where(
            CashLedger.account_id == account.id,
            CashLedger.entry_type == "INITIAL_CAPITAL",
        )
        .order_by(CashLedger.created_at.asc())
        .limit(1)
    )
    setup_adjustments = db.scalars(
        select(CashLedger).where(
            CashLedger.account_id == account.id,
            CashLedger.entry_type == "ADJUSTMENT",
            CashLedger.description == "Virtual starting capital adjusted",
        )
    ).all()
    changed = bool(setup_adjustments)
    if initial_entry is None:
        db.add(CashLedger(
            account_id=account.id,
            entry_type="INITIAL_CAPITAL",
            amount=account.initial_capital,
            balance_after=account.initial_capital,
            description="Initial virtual capital grant",
        ))
        changed = True
    elif initial_entry.amount != account.initial_capital or initial_entry.balance_after != account.initial_capital:
        initial_entry.amount = account.initial_capital
        initial_entry.balance_after = account.initial_capital
        initial_entry.description = "Initial virtual capital grant"
        changed = True
    for entry in setup_adjustments:
        db.delete(entry)
    return changed


@router.put("/account/initial-capital", response_model=AccountResponse)
def configure_initial_capital(
    payload: CapitalSetupInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AccountResponse:
    amount = payload.initial_capital.quantize(Decimal("0.01"))
    account = db.scalar(select(Account).where(Account.user_id == user.id).with_for_update())
    if account is None:
        account = create_initial_account_for_user(user, db, amount, capital_configured=True)
        return AccountResponse.model_validate(account)

    # Registration creates an unconfigured placeholder account so the user can
    # sign in and choose a balance. Replace that placeholder grant in place;
    # the selected amount is the initial grant, not a later cash adjustment.
    if not account.capital_configured:
        account.initial_capital = amount
        account.cash_balance = amount
        account.capital_configured = True
        initial_entry = db.scalar(
            select(CashLedger)
            .where(
                CashLedger.account_id == account.id,
                CashLedger.entry_type == "INITIAL_CAPITAL",
            )
            .order_by(CashLedger.created_at.asc())
            .limit(1)
        )
        if initial_entry is None:
            db.add(CashLedger(
                account_id=account.id,
                entry_type="INITIAL_CAPITAL",
                amount=amount,
                balance_after=amount,
                description="Initial virtual capital grant",
                idempotency_key=f"INIT_CAPITAL_{user.id}",
            ))
        else:
            initial_entry.amount = amount
            initial_entry.balance_after = amount
            initial_entry.description = "Initial virtual capital grant"
        db.commit()
        db.refresh(account)
        return AccountResponse.model_validate(account)

    if account.capital_configured and account.initial_capital == amount:
        return AccountResponse.model_validate(account)

    # If the account has never been used for paper trading, changing the amount
    # on the post-login setup screen is still setup: revise the original grant
    # instead of recording a misleading adjustment entry.
    if not _has_trading_activity(db, account):
        account.initial_capital = amount
        account.cash_balance = amount
        account.capital_configured = True
        initial_entry = db.scalar(
            select(CashLedger)
            .where(
                CashLedger.account_id == account.id,
                CashLedger.entry_type == "INITIAL_CAPITAL",
            )
            .order_by(CashLedger.created_at.asc())
            .limit(1)
        )
        if initial_entry is None:
            db.add(CashLedger(
                account_id=account.id,
                entry_type="INITIAL_CAPITAL",
                amount=amount,
                balance_after=amount,
                description="Initial virtual capital grant",
                idempotency_key=f"INIT_CAPITAL_{user.id}",
            ))
        else:
            initial_entry.amount = amount
            initial_entry.balance_after = amount
            initial_entry.description = "Initial virtual capital grant"
        setup_adjustments = db.scalars(
            select(CashLedger).where(
                CashLedger.account_id == account.id,
                CashLedger.entry_type == "ADJUSTMENT",
                CashLedger.description == "Virtual starting capital adjusted",
            )
        ).all()
        for entry in setup_adjustments:
            db.delete(entry)
        db.commit()
        db.refresh(account)
        return AccountResponse.model_validate(account)

    change = amount - account.initial_capital
    new_cash_balance = account.cash_balance + change
    if new_cash_balance < account.reserved_cash:
        minimum = account.initial_capital + account.reserved_cash - account.cash_balance
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Choose at least ₹{minimum:,.2f} to cover existing paper trades and reserved orders.",
        )

    account.initial_capital = amount
    account.cash_balance = new_cash_balance
    account.capital_configured = True
    if change:
        db.add(CashLedger(
            account_id=account.id,
            entry_type="ADJUSTMENT",
            amount=change,
            balance_after=new_cash_balance,
            description="Virtual starting capital adjusted",
        ))
    db.commit()
    db.refresh(account)
    return AccountResponse.model_validate(account)


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

    if _consolidate_unused_setup_ledger(db, account):
        db.commit()

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
