import logging
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, CashLedger, Instrument, Order, OrderFill, Position, User
from app.services.charge_engine import calculate_trade_charges, quantize_money
from app.services.market_data import market_store

logger = logging.getLogger("quantx.matching_engine")


def validate_order_inputs(
    side: str,
    product: str,
    order_type: str,
    quantity: int,
    limit_price: Optional[Decimal],
    trigger_price: Optional[Decimal],
) -> None:
    """Validates order parameter constraints according to PS-05 specification."""
    if side not in ("BUY", "SELL"):
        raise HTTPException(status_code=400, detail="Invalid order side. Must be BUY or SELL.")
    if product not in ("CNC", "MIS"):
        raise HTTPException(status_code=400, detail="Invalid product type. Must be CNC or MIS.")
    if order_type not in ("MARKET", "LIMIT", "SL", "SL-M"):
        raise HTTPException(status_code=400, detail="Invalid order type. Must be MARKET, LIMIT, SL, or SL-M.")
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")

    if order_type == "LIMIT":
        if not limit_price or limit_price <= Decimal("0"):
            raise HTTPException(status_code=400, detail="LIMIT orders require a positive limit price.")
    elif order_type == "SL":
        if not trigger_price or trigger_price <= Decimal("0"):
            raise HTTPException(status_code=400, detail="Stop-Loss (SL) orders require a positive trigger price.")
        if not limit_price or limit_price <= Decimal("0"):
            raise HTTPException(status_code=400, detail="Stop-Loss (SL) orders require a positive limit price.")
    elif order_type == "SL-M":
        if not trigger_price or trigger_price <= Decimal("0"):
            raise HTTPException(status_code=400, detail="Stop-Loss Market (SL-M) orders require a positive trigger price.")


def check_risk_and_funds(
    account: Account,
    instrument: Instrument,
    side: str,
    product: str,
    order_type: str,
    quantity: int,
    limit_price: Optional[Decimal],
    trigger_price: Optional[Decimal],
    db: Session,
) -> Decimal:
    """Validates available cash balance / sellable holdings before order acceptance."""
    quote = market_store.get_quote(instrument.symbol)
    estimated_price = limit_price or trigger_price or (Decimal(str(quote.price)) if (quote and quote.price > 0) else Decimal("100.00"))

    estimated_value = quantize_money(estimated_price * Decimal(quantity))
    charges = calculate_trade_charges(side, product, quantity, estimated_price).total_charges

    if side == "BUY":
        if product == "CNC":
            required_funds = estimated_value + charges
            if account.cash_balance < required_funds:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient cash balance for CNC Buy. Required: ₹{required_funds:,.2f}, Available: ₹{account.cash_balance:,.2f}.",
                )
        else:  # MIS Intraday 5x leverage (20% margin)
            required_margin = quantize_money((estimated_value / Decimal("5")) + charges)
            if account.cash_balance < required_margin:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient margin for MIS Buy. Required margin: ₹{required_margin:,.2f}, Available cash: ₹{account.cash_balance:,.2f}.",
                )
    else:  # SELL
        if product == "CNC":
            # Check user has sufficient CNC holdings to sell (prevent naked short selling)
            position = db.scalar(
                select(Position).where(
                    Position.account_id == account.id,
                    Position.instrument_id == instrument.id,
                    Position.product == "CNC",
                )
            )
            available_qty = position.quantity if position else 0
            if available_qty < quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient CNC holdings to sell. Requested: {quantity}, Available holdings: {available_qty}.",
                )
        else:  # MIS Sell
            required_margin = quantize_money((estimated_value / Decimal("5")) + charges)
            if account.cash_balance < required_margin:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient margin for MIS Sell. Required margin: ₹{required_margin:,.2f}, Available cash: ₹{account.cash_balance:,.2f}.",
                )

    return estimated_price


def place_order(
    account: Account,
    instrument: Instrument,
    side: str,
    product: str,
    order_type: str,
    quantity: int,
    limit_price: Optional[Decimal],
    trigger_price: Optional[Decimal],
    idempotency_key: Optional[str],
    db: Session,
) -> Order:
    """Places a new paper-trading order, runs validation, and attempts matching."""
    validate_order_inputs(side, product, order_type, quantity, limit_price, trigger_price)

    if idempotency_key:
        existing = db.scalar(select(Order).where(Order.idempotency_key == idempotency_key))
        if existing:
            return existing

    check_risk_and_funds(account, instrument, side, product, order_type, quantity, limit_price, trigger_price, db)

    initial_status = "PENDING_TRIGGER" if order_type in ("SL", "SL-M") else "OPEN"

    order = Order(
        account_id=account.id,
        instrument_id=instrument.id,
        side=side,
        product=product,
        order_type=order_type,
        quantity=quantity,
        filled_quantity=0,
        limit_price=limit_price,
        trigger_price=trigger_price,
        status=initial_status,
        idempotency_key=idempotency_key,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    # Immediately attempt matching against current market price
    execute_order_matching(order, db)

    return order


def execute_order_matching(order: Order, db: Session) -> bool:
    """Matches an order against current market depth/quotes and executes fills atomically."""
    if order.status in ("FILLED", "CANCELLED", "REJECTED", "EXPIRED"):
        return False

    instrument = order.instrument
    quote = market_store.get_quote(instrument.symbol)
    if not quote or quote.price <= 0:
        return False

    current_price = Decimal(str(quote.price))

    # 1. Trigger Check for SL and SL-M orders
    if order.status == "PENDING_TRIGGER":
        triggered = False
        if order.side == "BUY" and current_price >= order.trigger_price:
            triggered = True
        elif order.side == "SELL" and current_price <= order.trigger_price:
            triggered = True

        if triggered:
            order.status = "OPEN"
            logger.info(f"Order {order.id} ({order.side} {order.order_type}) triggered at price ₹{current_price}.")
        else:
            return False

    # 2. Price Priority / Execution Eligibility Check for OPEN orders
    fill_price: Optional[Decimal] = None

    if order.order_type == "MARKET":
        fill_price = current_price
    elif order.order_type == "LIMIT":
        if order.side == "BUY" and current_price <= order.limit_price:
            fill_price = min(current_price, order.limit_price)
        elif order.side == "SELL" and current_price >= order.limit_price:
            fill_price = max(current_price, order.limit_price)
    elif order.order_type == "SL":
        # Act as Limit order once triggered
        if order.side == "BUY" and current_price <= order.limit_price:
            fill_price = min(current_price, order.limit_price)
        elif order.side == "SELL" and current_price >= order.limit_price:
            fill_price = max(current_price, order.limit_price)
    elif order.order_type == "SL-M":
        # Act as Market order once triggered
        fill_price = current_price

    if fill_price is None or fill_price <= Decimal("0"):
        return False

    # 3. Calculate Executable Quantity
    remaining_qty = order.quantity - order.filled_quantity
    if remaining_qty <= 0:
        order.status = "FILLED"
        db.commit()
        return False

    # Support partial fill capability if available depth is less than remaining
    fill_qty = remaining_qty

    fill_value = quantize_money(fill_price * Decimal(fill_qty))
    charges_info = calculate_trade_charges(order.side, order.product, fill_qty, fill_price)

    # 4. Perform Financial Ledger & Position Settlement atomically
    account = db.scalar(select(Account).where(Account.id == order.account_id))
    if not account:
        return False

    if order.side == "BUY":
        total_cost = fill_value + charges_info.total_charges
        if account.cash_balance < total_cost:
            # If cash was somehow depleted before fill, reject remaining
            if order.filled_quantity > 0:
                order.status = "PARTIALLY_FILLED"
            else:
                order.status = "REJECTED"
                order.rejection_reason = "Insufficient cash at execution time."
            db.commit()
            return False

        account.cash_balance = quantize_money(account.cash_balance - total_cost)

        ledger_debit = CashLedger(
            account_id=account.id,
            entry_type="TRADE_DEBIT",
            amount=-total_cost,
            balance_after=account.cash_balance,
            reference_id=str(order.id),
            description=f"BUY {fill_qty} {instrument.symbol} @ ₹{fill_price:,.2f} (Charges: ₹{charges_info.total_charges:,.2f})",
        )
        db.add(ledger_debit)

    else:  # SELL
        net_proceeds = fill_value - charges_info.total_charges
        account.cash_balance = quantize_money(account.cash_balance + net_proceeds)

        ledger_credit = CashLedger(
            account_id=account.id,
            entry_type="TRADE_CREDIT",
            amount=net_proceeds,
            balance_after=account.cash_balance,
            reference_id=str(order.id),
            description=f"SELL {fill_qty} {instrument.symbol} @ ₹{fill_price:,.2f} (Charges: ₹{charges_info.total_charges:,.2f})",
        )
        db.add(ledger_credit)

    # 5. Update Position Accounting
    position = db.scalar(
        select(Position).where(
            Position.account_id == account.id,
            Position.instrument_id == instrument.id,
            Position.product == order.product,
        )
    )
    if not position:
        position = Position(
            account_id=account.id,
            instrument_id=instrument.id,
            product=order.product,
            quantity=0,
            buy_quantity=0,
            sell_quantity=0,
            buy_amount=Decimal("0.00"),
            sell_amount=Decimal("0.00"),
            average_price=Decimal("0.00"),
            realized_pnl=Decimal("0.00"),
        )
        db.add(position)

    if order.side == "BUY":
        position.buy_quantity += fill_qty
        position.buy_amount = quantize_money(position.buy_amount + fill_value)
        position.quantity += fill_qty
        if position.buy_quantity > 0:
            position.average_price = quantize_money(position.buy_amount / Decimal(position.buy_quantity))
    else:  # SELL
        position.sell_quantity += fill_qty
        position.sell_amount = quantize_money(position.sell_amount + fill_value)
        cost_basis = quantize_money(Decimal(fill_qty) * position.average_price)
        pnl = (fill_value - cost_basis) - charges_info.total_charges
        position.realized_pnl = quantize_money(position.realized_pnl + pnl)
        position.quantity -= fill_qty

    # 6. Create OrderFill record & update Order Status
    fill_record = OrderFill(
        order_id=order.id,
        quantity=fill_qty,
        price=fill_price,
        value=fill_value,
        charges=charges_info.total_charges,
    )
    db.add(fill_record)

    new_filled_qty = order.filled_quantity + fill_qty
    order.filled_quantity = new_filled_qty

    # Update weighted average execution price
    all_fills = db.scalars(select(OrderFill).where(OrderFill.order_id == order.id)).all()
    all_fills.append(fill_record)

    total_val = sum(f.value for f in all_fills)
    total_qty = sum(f.quantity for f in all_fills)
    if total_qty > 0:
        order.average_execution_price = quantize_money(total_val / Decimal(total_qty))

    if order.filled_quantity >= order.quantity:
        order.status = "FILLED"
    else:
        order.status = "PARTIALLY_FILLED"

    db.commit()
    db.refresh(order)
    return True


def modify_order(
    order: Order,
    new_quantity: Optional[int],
    new_limit_price: Optional[Decimal],
    new_trigger_price: Optional[Decimal],
    db: Session,
) -> Order:
    """Modifies an open or pending-trigger order."""
    if order.status not in ("OPEN", "PENDING_TRIGGER", "PARTIALLY_FILLED"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot modify order in terminal status '{order.status}'.",
        )

    if new_quantity is not None:
        if new_quantity < order.filled_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"New quantity ({new_quantity}) cannot be less than already filled quantity ({order.filled_quantity}).",
            )
        order.quantity = new_quantity

    if new_limit_price is not None:
        if order.order_type in ("LIMIT", "SL") and new_limit_price <= Decimal("0"):
            raise HTTPException(status_code=400, detail="Limit price must be greater than zero.")
        order.limit_price = new_limit_price

    if new_trigger_price is not None:
        if order.order_type in ("SL", "SL-M") and new_trigger_price <= Decimal("0"):
            raise HTTPException(status_code=400, detail="Trigger price must be greater than zero.")
        order.trigger_price = new_trigger_price

    if order.filled_quantity >= order.quantity:
        order.status = "FILLED"

    db.commit()
    db.refresh(order)

    # Re-evaluate matching after modification
    execute_order_matching(order, db)
    return order


def cancel_order(order: Order, db: Session) -> Order:
    """Cancels an open or pending order, preserving existing fills."""
    if order.status in ("FILLED", "CANCELLED", "REJECTED", "EXPIRED"):
        raise HTTPException(
            status_code=400,
            detail=f"Order is already in terminal status '{order.status}' and cannot be cancelled.",
        )

    order.status = "CANCELLED"
    db.commit()
    db.refresh(order)
    return order


def evaluate_all_open_orders(db: Session) -> int:
    """Evaluates all OPEN and PENDING_TRIGGER orders across all users against current market prices."""
    open_orders = db.scalars(
        select(Order).where(Order.status.in_(["OPEN", "PENDING_TRIGGER", "PARTIALLY_FILLED"]))
    ).all()

    executed_count = 0
    for order in open_orders:
        try:
            if execute_order_matching(order, db):
                executed_count += 1
        except Exception as e:
            logger.error(f"Error processing order {order.id}: {e}")

    return executed_count
