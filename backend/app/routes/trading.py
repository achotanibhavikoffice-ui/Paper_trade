from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import hmac
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import SessionLocal, get_db
from app.models import Account, Instrument, Order, OrderEvent, Position, ScenarioRun, Trade, TradeCharge, User
from app.routes.auth import get_current_user
from app.schemas import MarketStressInput, OrderCreateInput, OrderModifyInput, ScenarioCreateInput
from app.security import password_fingerprint, read_session_identity
from app.services.market_data import market_data
from app.services.paper_engine import paper_engine

router = APIRouter(prefix="/api", tags=["paper trading"])


def _order_response(order: Order) -> dict[str, Any]:
    return {
        "id": str(order.id), "account_id": str(order.account_id), "instrument_id": str(order.instrument_id),
        "symbol": order.instrument.symbol, "company_name": order.instrument.name,
        "side": order.side, "product": order.product, "order_type": order.order_type,
        "quantity": order.quantity, "filled_quantity": order.filled_quantity,
        "limit_price": str(order.limit_price) if order.limit_price is not None else None,
        "trigger_price": str(order.trigger_price) if order.trigger_price is not None else None,
        "average_execution_price": str(order.average_execution_price) if order.average_execution_price is not None else None,
        "status": order.status, "rejection_reason": order.rejection_reason,
        "validity": order.validity, "idempotency_key": order.idempotency_key,
        "created_at": order.created_at.isoformat(), "updated_at": order.updated_at.isoformat(),
    }


def _position_response(position: Position) -> dict[str, Any]:
    instrument = position.instrument
    quote = market_data.quotes.get(instrument.symbol, {})
    current = Decimal(str(quote.get("last_price", position.average_price or 0)))
    unrealized = (current - Decimal(position.average_price or 0)) * position.quantity
    return {
        "id": str(position.id), "account_id": str(position.account_id), "instrument_id": str(position.instrument_id),
        "symbol": instrument.symbol, "company_name": instrument.name, "product": position.product,
        "quantity": position.quantity, "buy_quantity": position.buy_quantity, "sell_quantity": position.sell_quantity,
        "buy_amount": str(position.buy_amount), "sell_amount": str(position.sell_amount),
        "average_price": str(position.average_price), "current_price": float(current),
        "realized_pnl": str(position.realized_pnl), "unrealized_pnl": str(unrealized),
        "updated_at": position.updated_at.isoformat(),
    }


def _account(db: Session, user: User) -> Account:
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    if account is None:
        raise HTTPException(404, "Paper-trading account not found.")
    return account


@router.post("/orders", status_code=201)
async def place_order(payload: OrderCreateInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    order = paper_engine.create_order(db, user, payload)
    try:
        await market_data.retain_symbols([order.instrument.symbol])
    except Exception:
        pass
    return _order_response(order)


@router.get("/orders")
def list_orders(
    limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> dict[str, Any]:
    account = _account(db, user)
    query = select(Order).options(joinedload(Order.instrument)).where(Order.account_id == account.id)
    if status_filter:
        valid = {"PENDING", "OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED"}
        if status_filter.upper() not in valid:
            raise HTTPException(422, "Unknown order status filter.")
        query = query.where(Order.status == status_filter.upper())
    count_query = select(func.count(Order.id)).where(Order.account_id == account.id)
    if status_filter:
        count_query = count_query.where(Order.status == status_filter.upper())
    total = db.scalar(count_query) or 0
    orders = db.scalars(query.order_by(Order.created_at.desc()).limit(limit).offset(offset)).unique().all()
    return {"items": [_order_response(order) for order in orders], "total": total, "limit": limit, "offset": offset}


@router.get("/orders/{order_id}")
def get_order(order_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    account = _account(db, user)
    order = db.scalar(select(Order).options(joinedload(Order.instrument)).where(Order.id == order_id, Order.account_id == account.id))
    if order is None:
        raise HTTPException(404, "Order not found.")
    return _order_response(order)


@router.put("/orders/{order_id}")
async def modify_order(order_id: UUID, payload: OrderModifyInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    order = paper_engine.modify_order(db, user, order_id, payload)
    try:
        await market_data.retain_symbols([order.instrument.symbol])
    except Exception:
        pass
    return _order_response(order)


@router.delete("/orders/{order_id}")
async def cancel_order(order_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    order = paper_engine.cancel_order(db, user, order_id)
    await market_data.reconcile_retained_symbols()
    return _order_response(order)


@router.get("/orders/{order_id}/trades")
def order_trades(order_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    account = _account(db, user)
    exists = db.scalar(select(Order.id).where(Order.id == order_id, Order.account_id == account.id))
    if not exists:
        raise HTTPException(404, "Order not found.")
    trades = db.scalars(select(Trade).where(Trade.order_id == order_id).order_by(Trade.created_at.asc(), Trade.sequence.asc())).all()
    return [_trade_response(trade) for trade in trades]


@router.get("/orders/{order_id}/events")
def order_events(order_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    account = _account(db, user)
    exists = db.scalar(select(Order.id).where(Order.id == order_id, Order.account_id == account.id))
    if not exists:
        raise HTTPException(404, "Order not found.")
    events = db.scalars(select(OrderEvent).where(OrderEvent.order_id == order_id).order_by(OrderEvent.created_at, OrderEvent.id)).all()
    return [{"id": str(row.id), "order_id": str(row.order_id), "event_type": row.event_type,
             "status": row.status, "details": row.details, "created_at": row.created_at.isoformat()} for row in events]


@router.get("/account/trading-settings")
def get_trading_settings(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    account = _account(db, user)
    return {"stress_mode": account.stress_mode,
            "stress_spread_percent": float(Decimal(settings.paper_stress_spread_percent) * 100),
            "stress_liquidity_percent": float(Decimal(settings.paper_stress_liquidity_factor) * 100)}


@router.put("/account/trading-settings/stress-mode")
def set_market_stress(payload: MarketStressInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, bool]:
    account = _account(db, user)
    account.stress_mode = payload.enabled
    db.commit()
    return {"stress_mode": account.stress_mode}


@router.post("/scenarios", status_code=201)
def create_scenario(payload: ScenarioCreateInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    account = _account(db, user)
    positions = db.scalars(select(Position).options(joinedload(Position.instrument)).where(
        Position.account_id == account.id, Position.quantity != 0)).unique().all()
    rows = []
    total_current = Decimal("0")
    total_projected = Decimal("0")
    for position in positions:
        symbol = position.instrument.symbol
        quote = market_data.quotes.get(symbol, {})
        current = Decimal(str(quote.get("last_price", position.average_price)))
        shock = payload.shocks.get(symbol, Decimal("0"))
        projected = (current * (Decimal("1") + shock / Decimal("100"))).quantize(Decimal("0.01"))
        current_value = current * position.quantity
        projected_value = projected * position.quantity
        current_pnl = current_value - Decimal(position.average_price) * position.quantity
        projected_pnl = projected_value - Decimal(position.average_price) * position.quantity
        total_current += current_value
        total_projected += projected_value
        rows.append({"symbol": symbol, "quantity": position.quantity, "current_price": str(current),
                     "shock_percent": str(shock), "projected_price": str(projected),
                     "current_pnl": str(current_pnl.quantize(Decimal("0.01"))),
                     "projected_pnl": str(projected_pnl.quantize(Decimal("0.01")))})
    result = {"positions": rows, "current_market_value": str(total_current.quantize(Decimal("0.01"))),
              "projected_market_value": str(total_projected.quantize(Decimal("0.01"))),
              "projected_value_change": str((total_projected - total_current).quantize(Decimal("0.01"))),
              "note": "Scenario only; it does not place orders or change cash, positions, or live quotes."}
    run = ScenarioRun(account_id=account.id, name=payload.name.strip(),
                      shocks={key: str(value) for key, value in payload.shocks.items()}, result=result)
    db.add(run)
    db.commit()
    return {"id": str(run.id), "name": run.name, "shocks": run.shocks, "result": run.result,
            "created_at": run.created_at.isoformat()}


@router.get("/scenarios")
def list_scenarios(limit: int = Query(default=20, ge=1, le=100), db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    account = _account(db, user)
    rows = db.scalars(select(ScenarioRun).where(ScenarioRun.account_id == account.id)
                      .order_by(ScenarioRun.created_at.desc()).limit(limit)).all()
    return [{"id": str(row.id), "name": row.name, "shocks": row.shocks, "result": row.result,
             "created_at": row.created_at.isoformat()} for row in rows]


def _trade_response(trade: Trade) -> dict[str, Any]:
    return {"id": str(trade.id), "account_id": str(trade.account_id), "order_id": str(trade.order_id),
            "instrument_id": str(trade.instrument_id), "sequence": trade.sequence, "quantity": trade.quantity,
            "price": str(trade.price), "side": trade.side, "product": trade.product,
            "charges": ({"brokerage": str(trade.charges[0].brokerage), "exchange_fee": str(trade.charges[0].exchange_fee),
                         "sebi_fee": str(trade.charges[0].sebi_fee), "stt": str(trade.charges[0].stt),
                         "stamp_duty": str(trade.charges[0].stamp_duty), "gst": str(trade.charges[0].gst),
                         "total": str(trade.charges[0].total)} if trade.charges else None),
            "created_at": trade.created_at.isoformat()}


@router.get("/trades")
def list_trades(limit: int = Query(default=100, ge=1, le=500), offset: int = Query(default=0, ge=0),
                db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    account = _account(db, user)
    total = db.scalar(select(func.count(Trade.id)).where(Trade.account_id == account.id)) or 0
    trades = db.scalars(select(Trade).where(Trade.account_id == account.id)
                        .order_by(Trade.created_at.desc(), Trade.sequence.desc()).limit(limit).offset(offset)).all()
    return {"items": [_trade_response(trade) for trade in trades], "total": total, "limit": limit, "offset": offset}


@router.get("/portfolio/positions")
def list_positions(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    account = _account(db, user)
    positions = db.scalars(select(Position).options(joinedload(Position.instrument))
                           .where(Position.account_id == account.id, Position.quantity != 0)
                           .order_by(Position.updated_at.desc())).unique().all()
    return [_position_response(position) for position in positions]


@router.get("/portfolio/summary")
def portfolio_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, Any]:
    account = _account(db, user)
    positions = db.scalars(select(Position).options(joinedload(Position.instrument)).where(
        Position.account_id == account.id)).unique().all()
    realized = Decimal("0")
    unrealized = Decimal("0")
    market_value = Decimal("0")
    for position in positions:
        realized += Decimal(position.realized_pnl)
        if position.quantity:
            quote = market_data.quotes.get(position.instrument.symbol, {})
            current = Decimal(str(quote.get("last_price", position.average_price)))
            market_value += current * position.quantity
            unrealized += (current - Decimal(position.average_price)) * position.quantity
    open_order_count = db.scalar(select(func.count(Order.id)).where(
        Order.account_id == account.id, Order.status.in_(("OPEN", "PENDING", "PARTIALLY_FILLED")))) or 0
    open_positions = sum(1 for position in positions if position.quantity)
    equity = Decimal(account.cash_balance) + market_value
    return {"cash_balance": str(account.cash_balance), "reserved_cash": str(account.reserved_cash),
            "market_value": str(market_value.quantize(Decimal("0.01"))), "equity": str(equity.quantize(Decimal("0.01"))),
            "realized_pnl": str(realized.quantize(Decimal("0.01"))), "unrealized_pnl": str(unrealized.quantize(Decimal("0.01"))),
            "total_pnl": str((realized + unrealized).quantize(Decimal("0.01"))),
            "open_positions": open_positions, "open_orders": int(open_order_count),
            "stress_mode": account.stress_mode}


@router.get("/portfolio/holdings")
def list_holdings(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    account = _account(db, user)
    positions = db.scalars(select(Position).options(joinedload(Position.instrument))
                           .where(Position.account_id == account.id, Position.product == "CNC", Position.quantity > 0)
                           .order_by(Position.updated_at.desc())).unique().all()
    response = []
    for position in positions:
        quote = market_data.quotes.get(position.instrument.symbol, {})
        current = Decimal(str(quote.get("last_price", position.average_price)))
        invested = Decimal(position.average_price) * position.quantity
        value = current * position.quantity
        pnl = value - invested
        response.append({"id": str(position.id), "symbol": position.instrument.symbol,
                         "company_name": position.instrument.name, "shares": position.quantity,
                         "average_price": float(position.average_price), "current_price": float(current),
                         "invested_amount": float(invested), "current_value": float(value),
                         "unrealized_pnl": float(pnl),
                         "unrealized_pnl_percent": float((pnl / invested * 100) if invested else 0),
                         "day_change_percent": 0.0})
    return response


@router.get("/market/quotes")
def get_quotes(symbols: str | None = Query(default=None), user: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    requested = [s.strip().upper() for s in symbols.split(",") if s.strip()] if symbols else None
    return market_data.get_quotes(requested)


@router.get("/market/status")
def get_market_status(user: User = Depends(get_current_user)) -> dict[str, Any]:
    timestamps = []
    for quote in market_data.quotes.values():
        value = quote.get("timestamp")
        if isinstance(value, str):
            try:
                value = datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                continue
        if isinstance(value, datetime):
            timestamps.append(value)
    latest = max(timestamps, default=None)
    return {"enabled": market_data.provider.configured or settings.demo_market_data_enabled, "connected": market_data.connected,
            "quote_count": len(market_data.quotes), "last_update": latest.isoformat() if latest else None,
            "mode": market_data.mode, "order_execution": "local paper simulator",
            "quote_max_age_seconds": settings.market_quote_max_age_seconds}


def _websocket_user(websocket: WebSocket) -> User | None:
    token = websocket.cookies.get(settings.session_cookie_name)
    identity = read_session_identity(token) if token else None
    if identity is None:
        return None
    user_id, fingerprint = identity
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None or not hmac.compare_digest(fingerprint, password_fingerprint(user.password_hash)):
            return None
        # Return a detached identity record for use after this short-lived session closes.
        db.expunge(user)
        return user


@router.websocket("/market/ws")
async def market_socket(websocket: WebSocket) -> None:
    user = _websocket_user(websocket)
    if user is None:
        await websocket.close(code=4401, reason="Sign in to access market data.")
        return
    await websocket.accept()
    await websocket.send_json({"type": "ready", "data": {"message": "Send {\"task\":\"subscribe\",\"symbols\":[\"RELIANCE\"]} to start a quote subscription."}})
    try:
        while True:
            message = await websocket.receive_json()
            task = str(message.get("task", "")).lower()
            symbols = message.get("symbols", [])
            if not isinstance(symbols, list) or any(not isinstance(item, str) for item in symbols):
                await websocket.send_json({"type": "error", "message": "symbols must be an array of instrument symbols."})
                continue
            try:
                if task == "subscribe":
                    snapshots = await market_data.subscribe(websocket, symbols)
                    await websocket.send_json(jsonable_encoder({"type": "subscribed", "symbols": [s.upper() for s in symbols], "snapshots": snapshots}))
                elif task == "unsubscribe":
                    await market_data.unsubscribe(websocket, symbols)
                    await websocket.send_json({"type": "unsubscribed", "symbols": [s.upper() for s in symbols]})
                else:
                    await websocket.send_json({"type": "error", "message": "task must be subscribe or unsubscribe."})
            except ValueError as exc:
                await websocket.send_json({"type": "error", "message": str(exc)})
    except WebSocketDisconnect:
        pass
    finally:
        await market_data.remove_client(websocket)
