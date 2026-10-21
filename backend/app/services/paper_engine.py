from __future__ import annotations

import threading
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, contains_eager, joinedload

from app.database import SessionLocal
from app.config import settings
from app.models import Account, CashLedger, Instrument, Order, OrderEvent, Position, Trade, TradeCharge, User
from app.schemas import OrderCreateInput, OrderModifyInput

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


class PaperTradingEngine:
    """Local simulator. It intentionally never sends an order to the 021 order APIs."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._quotes: dict[str, dict[str, Any]] = {}

    def remember_quote(self, quote: dict[str, Any]) -> None:
        with self._lock:
            if quote.get("data_source") == "indianapi":
                self._quotes.pop(quote["symbol"], None)
                return
            self._quotes[quote["symbol"]] = quote
            with SessionLocal() as db:
                account_ids = db.scalars(select(Account.id)).all()
                for account_id in account_ids:
                    self._match_orders(db, account_id, quote["symbol"], quote)

    def create_order(self, db: Session, user: User, payload: OrderCreateInput, *, allow_stale_market: bool = False) -> Order:
        account = self._account(db, user)
        duplicate = db.scalar(select(Order).where(Order.idempotency_key == payload.idempotency_key))
        if duplicate:
            if duplicate.account_id != account.id:
                raise HTTPException(409, "This idempotency key has already been used.")
            return self._load_order(db, duplicate.id)
        instrument = db.get(Instrument, payload.instrument_id)
        if (instrument is None or not instrument.is_tradable
                or (instrument.provider_token is None and not settings.demo_market_data_enabled)):
            raise HTTPException(422, "Choose a tradable instrument from the current instrument list.")
        tick_paise = max(instrument.tick_size_paise or 1, 1)
        tick = Decimal(tick_paise) / Decimal(100)
        if payload.limit_price is not None:
            payload.limit_price = (round(payload.limit_price / tick) * tick).quantize(CENT)
        if payload.trigger_price is not None:
            payload.trigger_price = (round(payload.trigger_price / tick) * tick).quantize(CENT)
        self._validate_order(instrument, payload.side, payload.product, payload.order_type, payload.quantity, payload.limit_price, payload.trigger_price)
        quote = self._quotes.get(instrument.symbol)
        if quote and quote.get("data_source") == "indianapi" and payload.order_type == "MARKET":
            raise HTTPException(409, "IndianAPI provides price snapshots without market depth. Wait for a paper execution feed before placing a market order.")
        if payload.order_type == "MARKET" and not quote and not allow_stale_market:
            raise HTTPException(409, "Market data is not available for this instrument yet. Open its quote or watchlist first.")
        if payload.order_type == "MARKET" and quote and self._quote_is_stale(quote) and not allow_stale_market:
            raise HTTPException(409, "The latest market depth is stale. Wait for a fresh market update before placing a market order.")
        self._validate_stop_reference(payload.side, payload.order_type, payload.limit_price, payload.trigger_price, quote)
        reserve = self._reserve_estimate(payload, quote)
        if payload.side == "BUY" and money(account.cash_balance - account.reserved_cash) < reserve:
            raise HTTPException(422, "Insufficient available paper-trading funds for this order.")
        if payload.side == "SELL" and payload.product == "CNC":
            self._check_sellable_quantity(db, account.id, instrument.id, payload.product, payload.quantity)
        order = Order(
            account_id=account.id, instrument_id=instrument.id, side=payload.side,
            product=payload.product, order_type=payload.order_type, quantity=payload.quantity,
            limit_price=payload.limit_price, trigger_price=payload.trigger_price,
            status="OPEN", validity=payload.validity, idempotency_key=payload.idempotency_key,
            reserved_amount=reserve,
        )
        account.reserved_cash = money(account.reserved_cash + reserve)
        db.add(order)
        try:
            db.flush()
            self._event(db, order, "ACCEPTED", {"quantity": order.quantity, "side": order.side, "product": order.product, "order_type": order.order_type})
            db.commit()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(select(Order).where(Order.idempotency_key == payload.idempotency_key))
            if existing and existing.account_id == account.id:
                return self._load_order(db, existing.id)
            raise HTTPException(409, "This idempotency key has already been used.") from None
        if quote and not self._quote_is_stale(quote):
            try:
                self._match_orders(db, account.id, instrument.symbol, quote)
            except Exception:
                db.rollback()
        return self._load_order(db, order.id)

    def modify_order(self, db: Session, user: User, order_id: UUID, payload: OrderModifyInput) -> Order:
        account = self._account(db, user)
        order = self._load_order(db, order_id)
        if order.account_id != account.id:
            raise HTTPException(404, "Order not found.")
        if order.status not in {"OPEN", "PARTIALLY_FILLED", "PENDING"}:
            raise HTTPException(409, "Only open or partially filled orders can be modified.")
        remaining = order.quantity - order.filled_quantity
        if payload.quantity < order.filled_quantity:
            raise HTTPException(422, "New quantity cannot be less than the quantity already filled.")
        instrument = order.instrument
        tick_paise = max(instrument.tick_size_paise or 1, 1)
        tick = Decimal(tick_paise) / Decimal(100)
        if payload.limit_price is not None:
            payload.limit_price = (round(payload.limit_price / tick) * tick).quantize(CENT)
        if payload.trigger_price is not None:
            payload.trigger_price = (round(payload.trigger_price / tick) * tick).quantize(CENT)
        self._validate_order(instrument, order.side, order.product, order.order_type, payload.quantity, payload.limit_price, payload.trigger_price)
        self._validate_stop_reference(order.side, order.order_type, payload.limit_price, payload.trigger_price, self._quotes.get(instrument.symbol))
        if order.side == "SELL" and order.product == "CNC":
            self._check_sellable_quantity(db, account.id, instrument.id, order.product,
                                          payload.quantity - order.filled_quantity, ignore_order_id=order.id)
        simulated = OrderCreateInput(
            instrument_id=instrument.id, side=order.side, product=order.product,
            order_type=order.order_type, quantity=max(1, payload.quantity - order.filled_quantity),
            limit_price=payload.limit_price, trigger_price=payload.trigger_price,
            validity=payload.validity, idempotency_key=order.idempotency_key or "modify-order-key",
        )
        new_reserve = self._reserve_estimate(simulated, self._quotes.get(instrument.symbol)) if order.side == "BUY" else ZERO
        delta = new_reserve - order.reserved_amount
        if delta > ZERO and money(account.cash_balance - account.reserved_cash) < delta:
            raise HTTPException(422, "Insufficient available paper-trading funds for the modified order.")
        account.reserved_cash = money(account.reserved_cash + delta)
        order.reserved_amount = new_reserve
        order.quantity = payload.quantity
        order.limit_price = payload.limit_price
        order.trigger_price = payload.trigger_price
        order.validity = payload.validity
        if order.order_type in {"SL", "SL-M"}:
            order.triggered_at = None
        self._event(db, order, "MODIFIED", {"quantity": order.quantity, "limit_price": str(order.limit_price) if order.limit_price else None,
                                              "trigger_price": str(order.trigger_price) if order.trigger_price else None})
        db.commit()
        if order.instrument.symbol in self._quotes and not self._quote_is_stale(self._quotes[order.instrument.symbol]):
            try:
                self._match_orders(db, account.id, instrument.symbol, self._quotes[instrument.symbol])
            except Exception:
                db.rollback()
        return self._load_order(db, order.id)

    def cancel_order(self, db: Session, user: User, order_id: UUID) -> Order:
        account = self._account(db, user)
        order = self._load_order(db, order_id)
        if order.account_id != account.id:
            raise HTTPException(404, "Order not found.")
        if order.status not in {"OPEN", "PARTIALLY_FILLED", "PENDING"}:
            raise HTTPException(409, "This order is already closed.")
        self._release_reserve(account, order)
        order.status = "CANCELLED"
        self._event(db, order, "CANCELLED", {})
        db.commit()
        return self._load_order(db, order.id)

    def match_account(self, account_id: UUID, symbol: str, quote: dict[str, Any]) -> None:
        with self._lock, SessionLocal() as db:
            self._match_orders(db, account_id, symbol, quote)

    def square_off_mis_positions(self) -> int:
        """Submit local market exits for every open MIS position after the exchange cutoff."""
        from zoneinfo import ZoneInfo
        count = 0
        with self._lock, SessionLocal() as db:
            positions = db.scalars(select(Position)
                                   .where(Position.product == "MIS", Position.quantity != 0)
                                   .with_for_update()).all()
            for position in positions:
                local_date = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
                key = f"auto-squareoff:{local_date}:{position.id}"[:64]
                if db.scalar(select(Order.id).where(Order.idempotency_key == key)):
                    continue
                user = db.get(User, position.account.user_id)
                if not user:
                    continue
                payload = OrderCreateInput(instrument_id=position.instrument_id,
                    side="SELL" if position.quantity > 0 else "BUY", product="MIS", order_type="MARKET",
                    quantity=abs(position.quantity), validity="DAY", idempotency_key=key)
                try:
                    self.create_order(db, user, payload, allow_stale_market=True)
                    count += 1
                except HTTPException:
                    db.rollback()
                    continue
        return count

    def _match_orders(self, db: Session, account_id: UUID, symbol: str, quote: dict[str, Any]) -> None:
        with self._lock:
            instrument = db.scalar(select(Instrument).where(Instrument.symbol == symbol))
            if not instrument:
                return
            orders = db.scalars(
                select(Order)
                .where(Order.account_id == account_id, Order.instrument_id == instrument.id,
                       Order.status.in_(["OPEN", "PENDING", "PARTIALLY_FILLED"]))
                .order_by(Order.created_at.asc(), Order.id.asc()).with_for_update()
            ).all()
            if not orders:
                return
            account = db.get(Account, account_id)
            asks = [{"price": money(level["price"]), "quantity": int(level["quantity"])} for level in quote.get("asks", []) if level.get("quantity", 0) > 0]
            bids = [{"price": money(level["price"]), "quantity": int(level["quantity"])} for level in quote.get("bids", []) if level.get("quantity", 0) > 0]
            if account and account.stress_mode:
                mid = money(quote["last_price"])
                spread = Decimal(settings.paper_stress_spread_percent)
                liquidity = Decimal(settings.paper_stress_liquidity_factor)
                asks = [{"price": money(level["price"] + mid * spread), "quantity": max(0, int(Decimal(level["quantity"]) * liquidity))} for level in asks]
                bids = [{"price": money(max(Decimal("0.01"), level["price"] - mid * spread)), "quantity": max(0, int(Decimal(level["quantity"]) * liquidity))} for level in bids]
            for order in orders:
                remaining = order.quantity - order.filled_quantity
                if remaining <= 0:
                    order.status = "FILLED"
                    self._release_reserve(db.get(Account, account_id), order)
                    continue
                if order.order_type in {"SL", "SL-M"} and order.triggered_at is None:
                    last = money(quote["last_price"])
                    triggered = (order.side == "BUY" and last >= money(order.trigger_price)) or (order.side == "SELL" and last <= money(order.trigger_price))
                    if not triggered:
                        continue
                    order.triggered_at = datetime.now(timezone.utc)
                    self._event(db, order, "TRIGGERED", {"trigger_price": str(order.trigger_price), "last_price": str(last)})
                book = asks if order.side == "BUY" else bids
                if order.order_type == "MARKET" or (order.order_type == "SL-M" and order.triggered_at):
                    if not book and quote.get("last_price"):
                        book = [{"price": money(quote["last_price"]), "quantity": remaining}]
                elif order.order_type in {"LIMIT", "SL"}:
                    limit = money(order.limit_price)
                    book = [level for level in book if (level["price"] <= limit if order.side == "BUY" else level["price"] >= limit)]
                    if not book and quote.get("last_price"):
                        last = money(quote["last_price"])
                        if (order.side == "BUY" and last <= limit) or (order.side == "SELL" and last >= limit):
                            book = [{"price": last, "quantity": remaining}]
                else:
                    continue
                account = db.get(Account, account_id)
                for level in book:
                    if remaining <= 0:
                        break
                    if level["quantity"] <= 0:
                        continue
                    fill_qty = min(remaining, level["quantity"])
                    px = level["price"]
                    gross = money(px * fill_qty)
                    reserve_slice = min(order.reserved_amount, money(order.reserved_amount * Decimal(fill_qty) / Decimal(max(1, order.quantity - order.filled_quantity)))) if order.side == "BUY" else ZERO
                    next_sequence = (db.scalar(select(func.count(Trade.id)).where(Trade.order_id == order.id)) or 0) + 1
                    fees = self._estimate_charges(order, gross, next_sequence)
                    if order.side == "BUY" and money(account.cash_balance - gross - fees["total"]) < money(account.reserved_cash - reserve_slice):
                        break
                    self._apply_fill(db, account, order, fill_qty, px, gross)
                    level["quantity"] -= fill_qty
                    remaining -= fill_qty
                if order.quantity == order.filled_quantity:
                    order.status = "FILLED"
                    self._release_reserve(account, order)
                elif order.filled_quantity:
                    order.status = "PARTIALLY_FILLED"
                    if order.validity == "IOC":
                        self._release_reserve(account, order)
                        order.status = "CANCELLED"
                else:
                    order.status = "OPEN"
                    if order.validity == "IOC":
                        self._release_reserve(account, order)
                        order.status = "CANCELLED"
                if order.status in {"FILLED", "CANCELLED"}:
                    self._event(db, order, order.status, {"filled_quantity": order.filled_quantity})
                db.flush()
            db.commit()

    def _apply_fill(self, db: Session, account: Account, order: Order, quantity: int, price: Decimal, gross: Decimal) -> None:
        previous_filled = order.filled_quantity
        sequence = (db.scalar(select(Trade.sequence).where(Trade.order_id == order.id).order_by(Trade.sequence.desc()).limit(1)) or 0) + 1
        trade = Trade(account_id=account.id, order_id=order.id, instrument_id=order.instrument_id, sequence=sequence,
                      quantity=quantity, price=price, side=order.side, product=order.product)
        db.add(trade)
        db.flush()
        fees = self._estimate_charges(order, gross, sequence)
        db.add(TradeCharge(trade_id=trade.id, **fees))
        position = db.scalar(select(Position).where(
            Position.account_id == account.id, Position.instrument_id == order.instrument_id,
            Position.product == order.product,
        ).with_for_update())
        if position is None:
            position = Position(account_id=account.id, instrument_id=order.instrument_id, product=order.product)
            db.add(position)
            db.flush()
        signed = quantity if order.side == "BUY" else -quantity
        effective_price = money(price + fees["total"] / quantity if order.side == "BUY" else price - fees["total"] / quantity)
        cash_before = account.cash_balance
        old_qty = position.quantity
        new_qty = old_qty + signed
        if order.side == "BUY":
            position.buy_quantity += quantity
            position.buy_amount = money(position.buy_amount + gross + fees["total"])
            account.cash_balance = money(account.cash_balance - gross - fees["total"])
            entry_type, ledger_amount, description = "TRADE_DEBIT", -gross, f"Paper buy fill for {order.instrument.symbol}"
        else:
            position.sell_quantity += quantity
            position.sell_amount = money(position.sell_amount + gross - fees["total"])
            account.cash_balance = money(account.cash_balance + gross - fees["total"])
            entry_type, ledger_amount, description = "TRADE_CREDIT", gross, f"Paper sell fill for {order.instrument.symbol}"
        if old_qty == 0 or (old_qty > 0) == (signed > 0):
            position.average_price = money((abs(old_qty) * money(position.average_price) + quantity * effective_price) / abs(new_qty))
        else:
            closed = min(abs(old_qty), quantity)
            position.realized_pnl = money(position.realized_pnl + (effective_price - money(position.average_price)) * closed * (1 if old_qty > 0 else -1))
            if new_qty == 0:
                position.average_price = ZERO
            elif (new_qty > 0) != (old_qty > 0):
                position.average_price = effective_price
        position.quantity = new_qty
        order.filled_quantity += quantity
        prior_value = money(order.average_execution_price or ZERO) * previous_filled
        order.average_execution_price = money((prior_value + price * quantity) / order.filled_quantity)
        if order.side == "BUY":
            reserved_used = min(order.reserved_amount, money(order.reserved_amount * Decimal(quantity) / Decimal(max(1, order.quantity - previous_filled))))
            order.reserved_amount = money(order.reserved_amount - reserved_used)
            account.reserved_cash = max(ZERO, money(account.reserved_cash - reserved_used))
        db.add(CashLedger(account_id=account.id, entry_type=entry_type, amount=ledger_amount,
                          balance_after=money(cash_before + ledger_amount), reference_id=str(order.id), description=description,
                          idempotency_key=f"fill:{trade.id}"))
        if fees["total"] > ZERO:
            db.add(CashLedger(account_id=account.id, entry_type="CHARGE", amount=-fees["total"],
                              balance_after=account.cash_balance, reference_id=str(trade.id),
                              description=f"Paper trading charges for {order.instrument.symbol}",
                              idempotency_key=f"charge:{trade.id}"))
        self._event(db, order, "PARTIAL_FILL" if order.filled_quantity < order.quantity else "FILL",
                    {"trade_id": str(trade.id), "quantity": quantity, "price": str(price), "charges": str(fees["total"])})

    @staticmethod
    def _estimate_charges(order: Order, gross: Decimal, sequence: int) -> dict[str, Decimal]:
        exchange = money(gross * Decimal("0.0000325"))  # NSE 0.00325%
        sebi = money(gross * Decimal("0.000001"))      # SEBI Rs 10 per crore
        
        if order.product == "CNC":
            brokerage = ZERO
            stt = money(gross * Decimal("0.001"))      # 0.1% STT on both buy & sell
            stamp = money(gross * Decimal("0.00015")) if order.side == "BUY" else ZERO # 0.015% stamp on buy
        else:
            # MIS Brokerage: lower of ₹20 or 0.03% per executed order.
            # Using sequence == 1 to only charge brokerage once per fill session, or simplify to apply per fill.
            # Usually applied per order, here we apply per fill:
            brokerage = min(Decimal("20.00"), money(gross * Decimal("0.0003"))) if sequence == 1 else ZERO
            stt = money(gross * Decimal("0.00025")) if order.side == "SELL" else ZERO # 0.025% STT on sell
            stamp = money(gross * Decimal("0.00003")) if order.side == "BUY" else ZERO # 0.003% stamp on buy
            
        gst = money((brokerage + exchange + sebi) * Decimal("0.18"))
        total = money(brokerage + exchange + sebi + stt + stamp + gst)
        return {"brokerage": money(brokerage), "exchange_fee": exchange, "sebi_fee": sebi,
                "stt": stt, "stamp_duty": stamp, "gst": gst, "total": total}

    @staticmethod
    def _event(db: Session, order: Order, event_type: str, details: dict[str, Any]) -> None:
        status = {"PARTIAL_FILL": "PARTIALLY_FILLED", "FILL": "FILLED"}.get(event_type, order.status)
        db.add(OrderEvent(order_id=order.id, account_id=order.account_id, event_type=event_type,
                          status=status, details=details))

    @staticmethod
    def _quote_is_stale(quote: dict[str, Any]) -> bool:
        timestamp = quote.get("timestamp")
        if isinstance(timestamp, str):
            try:
                timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except ValueError:
                return True
        if not isinstance(timestamp, datetime):
            return True
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - timestamp).total_seconds() > settings.market_quote_max_age_seconds

    @staticmethod
    def _release_reserve(account: Account | None, order: Order) -> None:
        if account is None or order.reserved_amount <= ZERO:
            return
        account.reserved_cash = max(ZERO, money(account.reserved_cash - order.reserved_amount))
        order.reserved_amount = ZERO

    @staticmethod
    def _reserve_estimate(payload: OrderCreateInput, quote: dict[str, Any] | None) -> Decimal:
        if payload.side != "BUY":
            return ZERO
        if payload.limit_price:
            price = money(payload.limit_price)
        elif quote and quote.get("asks"):
            price = max(money(level["price"]) for level in quote["asks"])
        elif quote:
            price = money(quote["last_price"])
        else:
            return ZERO
        gross = money(price * payload.quantity)
        ratio = max(Decimal(settings.paper_stt_delivery_rate) + Decimal(settings.paper_stamp_delivery_rate),
                    Decimal(settings.paper_stt_intraday_sell_rate) + Decimal(settings.paper_stamp_intraday_rate))
        ratio += Decimal(settings.paper_exchange_fee_rate) + Decimal(settings.paper_sebi_fee_rate)
        ratio *= Decimal(1) + Decimal(settings.paper_gst_rate)
        return money(gross * (Decimal(1) + ratio) + Decimal(settings.paper_brokerage_per_order))

    @staticmethod
    def _validate_order(instrument: Instrument, side: str, product: str, order_type: str, quantity: int,
                        limit_price: Decimal | None, trigger_price: Decimal | None) -> None:
        if quantity <= 0:
            raise HTTPException(422, "Quantity must be a positive whole number.")
        if instrument.freeze_quantity and quantity > instrument.freeze_quantity:
            raise HTTPException(422, f"Quantity exceeds the exchange freeze limit of {instrument.freeze_quantity}.")
        lot = max(instrument.board_lot_quantity or instrument.lot_size or 1, 1)
        if quantity % lot:
            raise HTTPException(422, f"Quantity must be a multiple of the instrument lot size ({lot}).")
        if product == "CNC" and instrument.exchange not in {"NSE", "BSE"}:
            raise HTTPException(422, "CNC delivery is only supported for NSE/BSE cash instruments.")
        if order_type in {"LIMIT", "SL"} and limit_price is None:
            raise HTTPException(422, "A limit price is required for this order type.")
        if order_type in {"SL", "SL-M"} and trigger_price is None:
            raise HTTPException(422, "A trigger price is required for stop-loss orders.")
        if order_type not in {"SL", "SL-M"} and trigger_price is not None:
            raise HTTPException(422, "A trigger price is only valid for stop-loss orders.")
        tick_paise = max(instrument.tick_size_paise or 1, 1)
        for label, price in (("Limit", limit_price), ("Trigger", trigger_price)):
            if price is None:
                continue
            paise = price * 100
            if paise != paise.to_integral_value() or int(paise) % tick_paise:
                # Silently round it to the nearest tick instead of throwing 422
                pass
            if instrument.lower_circuit_paise and int(paise) < instrument.lower_circuit_paise:
                raise HTTPException(422, f"{label} price is below the instrument's lower circuit.")
            if instrument.upper_circuit_paise and int(paise) > instrument.upper_circuit_paise:
                raise HTTPException(422, f"{label} price is above the instrument's upper circuit.")

    @staticmethod
    def _validate_stop_reference(side: str, order_type: str, limit_price: Decimal | None,
                                 trigger_price: Decimal | None, quote: dict[str, Any] | None) -> None:
        if order_type not in {"SL", "SL-M"} or trigger_price is None:
            return
        if order_type == "SL" and limit_price is not None:
            if side == "BUY" and limit_price < trigger_price:
                raise HTTPException(422, "For a buy stop-limit, limit price must be at or above the trigger price.")
            if side == "SELL" and limit_price > trigger_price:
                raise HTTPException(422, "For a sell stop-limit, limit price must be at or below the trigger price.")
        if quote:
            last = money(quote["last_price"])
            if side == "BUY" and trigger_price <= last:
                raise HTTPException(422, "A buy stop trigger must be above the current last price.")
            if side == "SELL" and trigger_price >= last:
                raise HTTPException(422, "A sell stop trigger must be below the current last price.")

    @staticmethod
    def _check_sellable_quantity(db: Session, account_id: UUID, instrument_id: UUID, product: str, quantity: int,
                                 ignore_order_id: UUID | None = None) -> None:
        position = db.scalar(select(Position).where(Position.account_id == account_id,
                                                    Position.instrument_id == instrument_id,
                                                    Position.product == product).with_for_update())
        held = max(position.quantity if position else 0, 0)
        reserved_query = select(func.coalesce(func.sum(Order.quantity - Order.filled_quantity), 0)).where(
            Order.account_id == account_id, Order.instrument_id == instrument_id,
            Order.product == product, Order.side == "SELL",
            Order.status.in_(["OPEN", "PENDING", "PARTIALLY_FILLED"]),
        )
        if ignore_order_id:
            reserved_query = reserved_query.where(Order.id != ignore_order_id)
        reserved = db.scalar(reserved_query) or 0
        if held - reserved < quantity:
            raise HTTPException(422, "You do not have enough available shares to place this delivery sell order.")

    @staticmethod
    def _account(db: Session, user: User) -> Account:
        account = db.scalar(select(Account).where(Account.user_id == user.id).with_for_update())
        if account is None:
            raise HTTPException(404, "Paper-trading account not found.")
        return account

    @staticmethod
    def _load_order(db: Session, order_id: UUID) -> Order:
        order = db.scalar(select(Order).options(joinedload(Order.instrument)).where(Order.id == order_id))
        if order is None:
            raise HTTPException(404, "Order not found.")
        return order


paper_engine = PaperTradingEngine()
