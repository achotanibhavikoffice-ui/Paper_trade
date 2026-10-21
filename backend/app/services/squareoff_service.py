import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict, List
import zoneinfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, Instrument, Order, Position
from app.services.matching_engine import cancel_order, place_order

logger = logging.getLogger("tradeo.squareoff")

IST_TZ = zoneinfo.ZoneInfo("Asia/Kolkata")


def is_squareoff_time() -> bool:
    """Checks if current IST time is at or after 3:20 PM (15:20) on a trading day."""
    now_ist = datetime.now(IST_TZ)
    # Check if Monday-Friday (0=Mon, 4=Fri) and time >= 15:20
    if now_ist.weekday() <= 4:
        if now_ist.hour > 15 or (now_ist.hour == 15 and now_ist.minute >= 20):
            return True
    return False


def execute_mis_squareoff(db: Session, force: bool = False) -> Dict[str, int]:
    """
    Executes automatic square-off for all open MIS intraday positions at 3:20 PM IST.
    1. Cancels all pending/open MIS orders.
    2. Places market orders to close net open MIS positions.
    """
    if not force and not is_squareoff_time():
        return {"cancelled_orders": 0, "squared_off_positions": 0}

    logger.info("Executing MIS Automatic Square-Off procedure...")

    # 1. Cancel all pending open MIS orders
    open_mis_orders = db.scalars(
        select(Order).where(
            Order.product == "MIS",
            Order.status.in_(["OPEN", "PENDING_TRIGGER", "PARTIALLY_FILLED"]),
        )
    ).all()

    cancelled_count = 0
    for ord_item in open_mis_orders:
        try:
            cancel_order(ord_item, db)
            cancelled_count += 1
        except Exception as e:
            logger.error(f"Failed to cancel MIS order {ord_item.id} during square-off: {e}")

    # 2. Identify all open MIS positions where net quantity != 0
    open_mis_positions = db.scalars(
        select(Position).where(
            Position.product == "MIS",
            Position.quantity != 0,
        )
    ).all()

    squared_off_count = 0
    for pos in open_mis_positions:
        account = db.scalar(select(Account).where(Account.id == pos.account_id))
        instrument = db.scalar(select(Instrument).where(Instrument.id == pos.instrument_id))
        if not account or not instrument:
            continue

        net_qty = pos.quantity
        if net_qty == 0:
            continue

        close_side = "SELL" if net_qty > 0 else "BUY"
        close_qty = abs(net_qty)

        try:
            place_order(
                account=account,
                instrument=instrument,
                side=close_side,
                product="MIS",
                order_type="MARKET",
                quantity=close_qty,
                limit_price=None,
                trigger_price=None,
                idempotency_key=f"SQUAREOFF_{pos.id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                db=db,
            )
            squared_off_count += 1
            logger.info(f"Squared off MIS position for {instrument.symbol}: {close_side} {close_qty} shares.")
        except Exception as e:
            logger.error(f"Error squaring off MIS position {pos.id}: {e}")

    return {
        "cancelled_orders": cancelled_count,
        "squared_off_positions": squared_off_count,
    }
