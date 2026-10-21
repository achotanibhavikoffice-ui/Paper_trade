from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Account, Instrument, Order, Position, User
from app.routes.auth import create_initial_account_for_user, get_current_user
from app.schemas import (
    OrderCreateInput,
    OrderFillResponse,
    OrderModifyInput,
    OrderResponse,
    PositionResponse,
)
from app.services.market_data import market_store
from app.services.matching_engine import (
    cancel_order,
    evaluate_all_open_orders,
    execute_order_matching,
    modify_order,
    place_order,
)
from app.services.squareoff_service import execute_mis_squareoff

router = APIRouter(prefix="/api", tags=["orders"])


def serialize_order_response(order: Order, db: Session) -> OrderResponse:
    inst = db.scalar(select(Instrument).where(Instrument.id == order.instrument_id))
    fills_resp = [
        OrderFillResponse(
            id=fill.id,
            order_id=fill.order_id,
            quantity=fill.quantity,
            price=fill.price,
            value=fill.value,
            charges=fill.charges,
            filled_at=fill.filled_at,
        )
        for fill in order.fills
    ]

    return OrderResponse(
        id=order.id,
        account_id=order.account_id,
        instrument_id=order.instrument_id,
        symbol=inst.symbol if inst else "UNKNOWN",
        instrument_name=inst.name if inst else "Unknown Instrument",
        side=order.side,
        product=order.product,
        order_type=order.order_type,
        quantity=order.quantity,
        filled_quantity=order.filled_quantity,
        remaining_quantity=order.quantity - order.filled_quantity,
        limit_price=order.limit_price,
        trigger_price=order.trigger_price,
        average_execution_price=order.average_execution_price,
        status=order.status,
        rejection_reason=order.rejection_reason,
        created_at=order.created_at,
        updated_at=order.updated_at,
        fills=fills_resp,
    )


@router.post("/orders", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
def create_user_order(
    payload: OrderCreateInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderResponse:
    """Places a new paper-trading Buy/Sell order (CNC or MIS)."""
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    if not account:
        account = create_initial_account_for_user(user, db)

    # Resolve instrument
    instrument: Optional[Instrument] = None
    if payload.instrument_id:
        instrument = db.scalar(select(Instrument).where(Instrument.id == payload.instrument_id))
    elif payload.symbol:
        sym_upper = payload.symbol.upper()
        instrument = db.scalar(select(Instrument).where(Instrument.symbol == sym_upper))

    if not instrument and payload.symbol:
        sym_upper = payload.symbol.upper()
        instrument = Instrument(
            symbol=sym_upper,
            name=f"{sym_upper} Equity",
            exchange="NSE",
            instrument_type="EQUITY",
            is_tradable=True,
            lot_size=1,
        )
        db.add(instrument)
        db.commit()
        db.refresh(instrument)

    if not instrument:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Instrument not found. Provide a valid symbol or instrument_id.",
        )

    # Evaluate all existing orders first
    evaluate_all_open_orders(db)

    new_order = place_order(
        account=account,
        instrument=instrument,
        side=payload.side,
        product=payload.product,
        order_type=payload.order_type,
        quantity=payload.quantity,
        limit_price=payload.limit_price,
        trigger_price=payload.trigger_price,
        idempotency_key=payload.idempotency_key,
        db=db,
    )

    return serialize_order_response(new_order, db)


@router.get("/orders", response_model=List[OrderResponse])
def list_user_orders(
    product: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    symbol: Optional[str] = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[OrderResponse]:
    """Lists the authenticated user's submitted orders."""
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    if not account:
        account = create_initial_account_for_user(user, db)

    # Run matching pass on open orders
    evaluate_all_open_orders(db)

    stmt = select(Order).where(Order.account_id == account.id).order_by(Order.created_at.desc())
    if product:
        stmt = stmt.where(Order.product == product.upper())
    if status_filter:
        stmt = stmt.where(Order.status == status_filter.upper())

    orders = db.scalars(stmt).all()
    if symbol:
        sym_upper = symbol.upper()
        orders = [o for o in orders if o.instrument and o.instrument.symbol == sym_upper]

    return [serialize_order_response(o, db) for o in orders]


@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_user_order_details(
    order_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderResponse:
    """Retrieves single order details and fill execution history."""
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    if not account:
        account = create_initial_account_for_user(user, db)

    order = db.scalar(select(Order).where(Order.id == order_id, Order.account_id == account.id))
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    execute_order_matching(order, db)
    return serialize_order_response(order, db)


@router.patch("/orders/{order_id}", response_model=OrderResponse)
def modify_user_order(
    order_id: UUID,
    payload: OrderModifyInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderResponse:
    """Modifies an open or pending order's quantity, limit price, or trigger price."""
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    if not account:
        account = create_initial_account_for_user(user, db)

    order = db.scalar(select(Order).where(Order.id == order_id, Order.account_id == account.id))
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    updated_order = modify_order(
        order=order,
        new_quantity=payload.quantity,
        new_limit_price=payload.limit_price,
        new_trigger_price=payload.trigger_price,
        db=db,
    )

    return serialize_order_response(updated_order, db)


@router.post("/orders/{order_id}/cancel", response_model=OrderResponse)
@router.delete("/orders/{order_id}", response_model=OrderResponse)
def cancel_user_order(
    order_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrderResponse:
    """Cancels an open or pending order, preserving any partial fills."""
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    if not account:
        account = create_initial_account_for_user(user, db)

    order = db.scalar(select(Order).where(Order.id == order_id, Order.account_id == account.id))
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    cancelled = cancel_order(order, db)
    return serialize_order_response(cancelled, db)


@router.get("/portfolio/positions", response_model=List[PositionResponse])
def list_user_positions(
    product: Optional[str] = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[PositionResponse]:
    """Lists user's open intraday (MIS) and delivery (CNC) positions with live valuation."""
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    if not account:
        account = create_initial_account_for_user(user, db)

    evaluate_all_open_orders(db)

    stmt = select(Position).where(Position.account_id == account.id, Position.quantity != 0)
    if product:
        stmt = stmt.where(Position.product == product.upper())

    positions = db.scalars(stmt).all()
    results: List[PositionResponse] = []

    for pos in positions:
        inst = db.scalar(select(Instrument).where(Instrument.id == pos.instrument_id))
        symbol = inst.symbol if inst else "UNKNOWN"
        quote = market_store.get_quote(symbol)

        curr_price = Decimal(str(quote.price)) if (quote and quote.price > 0) else Decimal(str(pos.average_price))
        if curr_price <= Decimal("0"):
            curr_price = Decimal("100.00")

        curr_value = Decimal(str(pos.quantity)) * curr_price
        cost_basis = Decimal(str(pos.quantity)) * pos.average_price
        unrealized = curr_value - cost_basis
        unrealized_pct = (unrealized / cost_basis * Decimal("100")) if cost_basis > Decimal("0") else Decimal("0.00")

        results.append(
            PositionResponse(
                id=pos.id,
                account_id=pos.account_id,
                instrument_id=pos.instrument_id,
                symbol=symbol,
                instrument_name=inst.name if inst else "Unknown",
                product=pos.product,
                quantity=pos.quantity,
                buy_quantity=pos.buy_quantity,
                sell_quantity=pos.sell_quantity,
                buy_amount=pos.buy_amount,
                sell_amount=pos.sell_amount,
                average_price=pos.average_price,
                current_price=curr_price,
                current_value=curr_value,
                realized_pnl=pos.realized_pnl,
                unrealized_pnl=unrealized,
                unrealized_pnl_percent=unrealized_pct,
                quote_source=quote.source if quote else "cached",
                created_at=pos.created_at,
                updated_at=pos.updated_at,
            )
        )

    return results


@router.get("/portfolio/holdings", response_model=List[PositionResponse])
def list_user_holdings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[PositionResponse]:
    """Lists user's CNC delivery holdings."""
    return list_user_positions(product="CNC", user=user, db=db)


@router.post("/square-off")
def trigger_squareoff(
    force: bool = Query(default=False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Manually or automatically triggers 3:20 PM IST MIS square-off."""
    res = execute_mis_squareoff(db, force=force)
    return {"status": "ok", "message": "MIS Square-Off completed.", **res}
