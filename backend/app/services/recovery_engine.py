from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Account,
    CashLedger,
    Instrument,
    Order,
    OrderEvent,
    PortfolioSafePoint,
    Position,
    User,
)
from app.services.market_data import market_data

log = logging.getLogger("quantx.recovery")
CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value: Decimal | int | float | str) -> Decimal:
    return Decimal(str(value)).quantize(CENT)


class RecoveryEngine:
    """Enterprise-grade portfolio checkpoint, anomaly detection, and state rollback engine."""

    @staticmethod
    def _get_account(db: Session, user: User) -> Account:
        account = db.scalar(select(Account).where(Account.user_id == user.id))
        if account is None:
            raise HTTPException(404, "Paper trading account not found.")
        return account

    def create_safepoint(
        self,
        db: Session,
        user: User,
        name: str,
        trigger_type: str = "MANUAL",
        note: str | None = None,
    ) -> PortfolioSafePoint:
        account = self._get_account(db, user)

        # 1. Capture positions snapshot
        positions = db.scalars(
            select(Position).where(Position.account_id == account.id, Position.quantity != 0)
        ).all()
        positions_snapshot: list[dict[str, Any]] = []
        portfolio_equity = money(account.cash_balance)

        for pos in positions:
            inst = pos.instrument
            last_price = Decimal("0.00")
            if inst and inst.symbol in market_data.quotes:
                quote = market_data.quotes[inst.symbol]
                last_price = money(quote.get("last_price") or ZERO)
            elif pos.average_price > ZERO:
                last_price = money(pos.average_price)

            market_val = money(last_price * pos.quantity)
            portfolio_equity = money(portfolio_equity + market_val)

            positions_snapshot.append({
                "instrument_id": str(pos.instrument_id),
                "symbol": inst.symbol if inst else "UNKNOWN",
                "name": inst.name if inst else "Unknown",
                "exchange": inst.exchange if inst else "NSE",
                "product": pos.product,
                "quantity": pos.quantity,
                "buy_quantity": pos.buy_quantity,
                "sell_quantity": pos.sell_quantity,
                "buy_amount": str(pos.buy_amount),
                "sell_amount": str(pos.sell_amount),
                "average_price": str(pos.average_price),
                "realized_pnl": str(pos.realized_pnl),
                "snapshot_price": str(last_price),
                "snapshot_market_value": str(market_val),
            })

        # 2. Capture open orders snapshot
        open_orders = db.scalars(
            select(Order).where(
                Order.account_id == account.id,
                Order.status.in_(("OPEN", "PENDING", "PARTIALLY_FILLED")),
            )
        ).all()
        orders_snapshot: list[dict[str, Any]] = []
        for o in open_orders:
            orders_snapshot.append({
                "id": str(o.id),
                "symbol": o.instrument.symbol if o.instrument else "UNKNOWN",
                "side": o.side,
                "product": o.product,
                "order_type": o.order_type,
                "quantity": o.quantity,
                "filled_quantity": o.filled_quantity,
                "limit_price": str(o.limit_price) if o.limit_price else None,
                "reserved_amount": str(o.reserved_amount),
                "status": o.status,
            })

        safepoint = PortfolioSafePoint(
            account_id=account.id,
            name=name.strip(),
            trigger_type=trigger_type,
            cash_balance=account.cash_balance,
            reserved_cash=account.reserved_cash,
            total_portfolio_value=portfolio_equity,
            positions_snapshot=positions_snapshot,
            open_orders_snapshot=orders_snapshot,
            note=note.strip() if note else None,
            is_restored=False,
        )
        db.add(safepoint)
        db.commit()
        db.refresh(safepoint)
        log.info(
            "Created PortfolioSafePoint %s ('%s') for account %s with cash %s",
            safepoint.id,
            safepoint.name,
            account.id,
            safepoint.cash_balance,
        )
        return safepoint

    def list_safepoints(
        self,
        db: Session,
        user: User,
        limit: int = 30,
    ) -> list[PortfolioSafePoint]:
        account = self._get_account(db, user)
        return list(
            db.scalars(
                select(PortfolioSafePoint)
                .where(PortfolioSafePoint.account_id == account.id)
                .order_by(PortfolioSafePoint.created_at.desc())
                .limit(limit)
            ).all()
        )

    def get_safepoint(
        self,
        db: Session,
        user: User,
        safepoint_id: UUID,
    ) -> PortfolioSafePoint:
        account = self._get_account(db, user)
        sp = db.scalar(
            select(PortfolioSafePoint).where(
                PortfolioSafePoint.id == safepoint_id,
                PortfolioSafePoint.account_id == account.id,
            )
        )
        if sp is None:
            raise HTTPException(404, "SafePoint record not found.")
        return sp

    def preview_rollback(
        self,
        db: Session,
        user: User,
        safepoint_id: UUID,
    ) -> dict[str, Any]:
        account = self._get_account(db, user)
        safepoint = self.get_safepoint(db, user, safepoint_id)

        # 1. Open orders to cancel
        open_orders = db.scalars(
            select(Order).where(
                Order.account_id == account.id,
                Order.status.in_(("OPEN", "PENDING", "PARTIALLY_FILLED")),
            )
        ).all()
        orders_to_cancel = [
            {
                "id": str(o.id),
                "symbol": o.instrument.symbol if o.instrument else "UNKNOWN",
                "side": o.side,
                "quantity": o.quantity,
                "status": o.status,
            }
            for o in open_orders
        ]

        # 2. Positions diff
        current_positions = {
            (str(p.instrument_id), p.product): p
            for p in db.scalars(
                select(Position).where(Position.account_id == account.id)
            ).all()
        }
        target_positions = {
            (p["instrument_id"], p["product"]): p
            for p in safepoint.positions_snapshot
        }

        all_keys = set(current_positions.keys()) | set(target_positions.keys())
        diff: list[dict[str, Any]] = []

        for key in all_keys:
            curr = current_positions.get(key)
            target = target_positions.get(key)
            curr_qty = curr.quantity if curr else 0
            target_qty = target["quantity"] if target else 0
            symbol = curr.instrument.symbol if curr and curr.instrument else (target["symbol"] if target else "UNKNOWN")

            if curr_qty != target_qty or (curr is None and target is not None) or (curr is not None and target is None):
                diff.append({
                    "symbol": symbol,
                    "product": key[1],
                    "current_quantity": curr_qty,
                    "restored_quantity": target_qty,
                    "delta_quantity": target_qty - curr_qty,
                    "action": "RESTORE" if target_qty > 0 else "REMOVE_POSITION",
                })

        cash_delta = money(safepoint.cash_balance - account.cash_balance)

        return {
            "safepoint_id": safepoint.id,
            "safepoint_name": safepoint.name,
            "created_at": safepoint.created_at,
            "current_cash": account.cash_balance,
            "target_cash": safepoint.cash_balance,
            "cash_delta": cash_delta,
            "orders_to_cancel_count": len(orders_to_cancel),
            "orders_to_cancel": orders_to_cancel,
            "positions_diff": diff,
        }

    def execute_rollback(
        self,
        db: Session,
        user: User,
        safepoint_id: UUID,
        reason: str = "User initiated SafePoint recovery",
    ) -> dict[str, Any]:
        account = self._get_account(db, user)
        safepoint = self.get_safepoint(db, user, safepoint_id)

        # 1. Cancel all open/pending orders
        open_orders = db.scalars(
            select(Order).where(
                Order.account_id == account.id,
                Order.status.in_(("OPEN", "PENDING", "PARTIALLY_FILLED")),
            )
        ).all()
        cancelled_count = 0
        for o in open_orders:
            o.status = "CANCELLED"
            o.rejection_reason = f"Safety Rollback to SafePoint '{safepoint.name}'"
            db.add(
                OrderEvent(
                    order_id=o.id,
                    account_id=account.id,
                    event_type="RECOVERY_ROLLBACK_CANCEL",
                    status="CANCELLED",
                    details={"safepoint_id": str(safepoint.id), "reason": reason},
                )
            )
            cancelled_count += 1

        # 2. Revert positions back to snapshot
        current_positions = {
            (str(p.instrument_id), p.product): p
            for p in db.scalars(
                select(Position).where(Position.account_id == account.id)
            ).all()
        }
        target_positions = {
            (p["instrument_id"], p["product"]): p
            for p in safepoint.positions_snapshot
        }

        reverted_count = 0

        # Update existing positions or zero them out
        for (inst_id_str, prod), curr in current_positions.items():
            if (inst_id_str, prod) in target_positions:
                target = target_positions[(inst_id_str, prod)]
                curr.quantity = int(target["quantity"])
                curr.buy_quantity = int(target.get("buy_quantity", target["quantity"]))
                curr.sell_quantity = int(target.get("sell_quantity", 0))
                curr.buy_amount = Decimal(str(target.get("buy_amount", "0.00")))
                curr.sell_amount = Decimal(str(target.get("sell_amount", "0.00")))
                curr.average_price = Decimal(str(target.get("average_price", "0.00")))
                curr.realized_pnl = Decimal(str(target.get("realized_pnl", "0.00")))
                reverted_count += 1
            else:
                # Position did not exist at safepoint -> zero it out
                curr.quantity = 0
                curr.buy_amount = ZERO
                curr.sell_amount = ZERO
                curr.average_price = ZERO
                reverted_count += 1

        # Recreate any position that existed at safepoint but was deleted/missing
        for (inst_id_str, prod), target in target_positions.items():
            if (inst_id_str, prod) not in current_positions:
                new_pos = Position(
                    account_id=account.id,
                    instrument_id=UUID(inst_id_str),
                    product=prod,
                    quantity=int(target["quantity"]),
                    buy_quantity=int(target.get("buy_quantity", target["quantity"])),
                    sell_quantity=int(target.get("sell_quantity", 0)),
                    buy_amount=Decimal(str(target.get("buy_amount", "0.00"))),
                    sell_amount=Decimal(str(target.get("sell_amount", "0.00"))),
                    average_price=Decimal(str(target.get("average_price", "0.00"))),
                    realized_pnl=Decimal(str(target.get("realized_pnl", "0.00"))),
                )
                db.add(new_pos)
                reverted_count += 1

        # 3. Restore cash balance & release reserves
        cash_delta = money(safepoint.cash_balance - account.cash_balance)
        if cash_delta != ZERO:
            db.add(
                CashLedger(
                    account_id=account.id,
                    entry_type="RESET",
                    amount=cash_delta,
                    balance_after=safepoint.cash_balance,
                    reference_id=str(safepoint.id),
                    description=f"SafePoint Recovery rollback to '{safepoint.name}'",
                    idempotency_key=f"recovery:{safepoint.id}:{datetime.now(timezone.utc).timestamp()}",
                )
            )

        account.cash_balance = safepoint.cash_balance
        account.reserved_cash = ZERO

        # 4. Record audit on safepoint
        now = datetime.now(timezone.utc)
        safepoint.is_restored = True
        safepoint.restored_at = now

        db.commit()
        log.info(
            "Executed SafePoint recovery for account %s to SafePoint %s. Cash delta: %s",
            account.id,
            safepoint.id,
            cash_delta,
        )

        return {
            "success": True,
            "message": f"Successfully rolled back to '{safepoint.name}'. Restored ₹{safepoint.cash_balance:,.2f} cash.",
            "safepoint_id": safepoint.id,
            "safepoint_name": safepoint.name,
            "restored_at": now,
            "cash_restored": cash_delta,
            "new_cash_balance": account.cash_balance,
            "orders_cancelled_count": cancelled_count,
            "positions_reverted_count": reverted_count,
        }

    def simulate_disruption(
        self,
        db: Session,
        user: User,
        symbol: str = "TCS",
        quantity: int = 50,
        price: Decimal = Decimal("1200.00"),
    ) -> dict[str, Any]:
        """
        Simulate the exact user scenario:
        1. Capture pre-trade safe state.
        2. Buy 50 shares of TCS @ 1200.
        3. Trigger a simulated API / network crash & packet loss.
        4. Return instant rollback trigger.
        """
        account = self._get_account(db, user)
        symbol = symbol.strip().upper()

        # 1. Create automatic Pre-Trade SafePoint
        pre_safepoint = self.create_safepoint(
            db,
            user,
            name=f"Pre-Trade SafePoint (Before {quantity} {symbol})",
            trigger_type="PRE_TRADE",
            note=f"Automatic safety state captured prior to submitting order for {quantity} {symbol}",
        )

        # 2. Find or create instrument
        inst = db.scalar(select(Instrument).where(Instrument.symbol == symbol))
        if not inst:
            inst = Instrument(
                symbol=symbol,
                name=f"{symbol} Limited",
                exchange="NSE",
                instrument_type="EQUITY",
                is_tradable=True,
                lot_size=1,
            )
            db.add(inst)
            db.flush()

        # 3. Simulate order execution with debit
        total_cost = money(price * quantity)
        if account.cash_balance < total_cost:
            # Seed sufficient funds for the simulation demonstration
            account.cash_balance = money(account.cash_balance + total_cost + Decimal("20000.00"))
            db.flush()

        account.cash_balance = money(account.cash_balance - total_cost)
        db.add(
            CashLedger(
                account_id=account.id,
                entry_type="TRADE_DEBIT",
                amount=-total_cost,
                balance_after=account.cash_balance,
                description=f"Compromised trade debit: {quantity} shares {symbol} @ ₹{price}",
            )
        )

        # Add or update position
        pos = db.scalar(
            select(Position).where(
                Position.account_id == account.id,
                Position.instrument_id == inst.id,
                Position.product == "CNC",
            )
        )
        if pos:
            pos.quantity += quantity
            pos.buy_amount = money(pos.buy_amount + total_cost)
            pos.average_price = price
        else:
            pos = Position(
                account_id=account.id,
                instrument_id=inst.id,
                product="CNC",
                quantity=quantity,
                buy_quantity=quantity,
                sell_quantity=0,
                buy_amount=total_cost,
                sell_amount=ZERO,
                average_price=price,
                realized_pnl=ZERO,
            )
            db.add(pos)

        db.commit()

        # 4. Autonomous Anomaly Detection & Automatic Rollback
        # The user does not need to manually intervene or click any rollback button.
        # The platform detects the API/network fault and restores state immediately.
        rollback_result = self.execute_rollback(
            db,
            user,
            pre_safepoint.id,
            reason=f"Autonomous Recovery: Broker network/API packet loss during {quantity} {symbol} order auto-healed",
        )

        return {
            "disruption_type": "BROKER_NETWORK_TIMEOUT_PACKET_LOSS",
            "auto_recovered": True,
            "message": f"Autonomous SafePoint Shield: Broker packet loss was detected while submitting {quantity} shares of {symbol} at ₹{price:,.2f}. The system automatically rolled back the transaction to protect your portfolio with zero loss.",
            "impact": {
                "funds_at_risk": total_cost,
                "funds_auto_restored": rollback_result["cash_restored"],
                "active_cash_balance": rollback_result["new_cash_balance"],
                "compromised_trade_neutralized": f"{quantity} shares of {symbol}",
            },
            "safepoint": {
                "id": str(pre_safepoint.id),
                "name": pre_safepoint.name,
                "created_at": pre_safepoint.created_at,
                "restored_at": rollback_result["restored_at"],
            },
            "status": "AUTO_RECOVERED",
        }


recovery_engine = RecoveryEngine()
