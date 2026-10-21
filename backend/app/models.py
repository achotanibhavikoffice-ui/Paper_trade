from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    account: Mapped["Account | None"] = relationship("Account", back_populates="user", uselist=False, cascade="all, delete-orphan")
    saved_scenarios: Mapped[list["SavedScenario"]] = relationship("SavedScenario", back_populates="user", cascade="all, delete-orphan")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("cash_balance >= 0", name="accounts_cash_balance_nonnegative"),
        CheckConstraint("initial_capital > 0", name="accounts_initial_capital_positive"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    account_number: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    account_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="PAPER")
    currency: Mapped[str] = mapped_column(String(3), nullable=False, server_default="INR")
    initial_capital: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="100000.00")
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="100000.00")
    reserved_cash: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    capital_configured: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="ACTIVE")
    stress_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    commission_per_order: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    regulatory_fee_percent: Mapped[Decimal] = mapped_column(Numeric(8, 6), nullable=False, server_default="0.000000")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship("User", back_populates="account")
    ledger_entries: Mapped[list["CashLedger"]] = relationship("CashLedger", back_populates="account", cascade="all, delete-orphan")
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="account", cascade="all, delete-orphan")
    positions: Mapped[list["Position"]] = relationship("Position", back_populates="account", cascade="all, delete-orphan")
    safepoints: Mapped[list["PortfolioSafePoint"]] = relationship("PortfolioSafePoint", back_populates="account", cascade="all, delete-orphan")


class Instrument(Base):
    __tablename__ = "instruments"
    __table_args__ = (
        UniqueConstraint("exchange", "symbol", name="uq_instruments_exchange_symbol"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    symbol: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    exchange: Mapped[str] = mapped_column(String(10), nullable=False, server_default="NSE")
    instrument_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="EQUITY")
    sector: Mapped[str | None] = mapped_column(String(60), nullable=True)
    is_tradable: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    lot_size: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    provider_token: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    provider_exchange: Mapped[str | None] = mapped_column(String(10), nullable=True)
    provider_exchange_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    board_lot_quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    freeze_quantity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tick_size_paise: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    lower_circuit_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    upper_circuit_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    orders: Mapped[list["Order"]] = relationship("Order", back_populates="instrument")
    positions: Mapped[list["Position"]] = relationship("Position", back_populates="instrument")


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="orders_quantity_positive"),
        CheckConstraint("filled_quantity >= 0 AND filled_quantity <= quantity", name="orders_filled_quantity_check"),
        CheckConstraint("side IN ('BUY', 'SELL')", name="orders_side_check"),
        CheckConstraint("product IN ('CNC', 'MIS')", name="orders_product_check"),
        CheckConstraint("order_type IN ('MARKET', 'LIMIT', 'SL', 'SL-M')", name="orders_type_check"),
        CheckConstraint("status IN ('PENDING_TRIGGER', 'PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED', 'EXPIRED')", name="orders_status_check"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    account_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    instrument_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("instruments.id"), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    product: Mapped[str] = mapped_column(String(5), nullable=False)
    order_type: Mapped[str] = mapped_column(String(10), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    filled_quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    limit_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    trigger_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    average_execution_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="OPEN", index=True)
    rejection_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    validity: Mapped[str] = mapped_column(String(8), nullable=False, server_default="DAY")
    reserved_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    account: Mapped["Account"] = relationship("Account", back_populates="orders")
    instrument: Mapped["Instrument"] = relationship("Instrument", back_populates="orders")
    trades: Mapped[list["Trade"]] = relationship("Trade", back_populates="order", cascade="all, delete-orphan")


class Trade(Base):
    __tablename__ = "trades"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="trades_quantity_positive"),
        CheckConstraint("price > 0", name="trades_price_positive"),
        UniqueConstraint("order_id", "sequence", name="uq_trades_order_sequence"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    account_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    instrument_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("instruments.id"), nullable=False, index=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    product: Mapped[str] = mapped_column(String(5), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    order: Mapped["Order"] = relationship("Order", back_populates="trades")
    charges: Mapped[list["TradeCharge"]] = relationship("TradeCharge", back_populates="trade", cascade="all, delete-orphan")


class TradeCharge(Base):
    __tablename__ = "trade_charges"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    trade_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("trades.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    brokerage: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    exchange_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    sebi_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    stt: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    stamp_duty: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    gst: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    trade: Mapped["Trade"] = relationship("Trade", back_populates="charges")


class OrderEvent(Base):
    __tablename__ = "order_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    order_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)


class ScenarioRun(Base):
    __tablename__ = "scenario_runs"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    account_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    shocks: Mapped[dict] = mapped_column(JSON, nullable=False)
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)


class Position(Base):
    __tablename__ = "positions"
    __table_args__ = (
        UniqueConstraint("account_id", "instrument_id", "product", name="uq_positions_account_instrument_product"),
        CheckConstraint("product IN ('CNC', 'MIS')", name="positions_product_check"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    account_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    instrument_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("instruments.id"), nullable=False, index=True)
    product: Mapped[str] = mapped_column(String(5), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    buy_quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    sell_quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    buy_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    sell_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    average_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    account: Mapped["Account"] = relationship("Account", back_populates="positions")
    instrument: Mapped["Instrument"] = relationship("Instrument", back_populates="positions")


class CashLedger(Base):
    __tablename__ = "cash_ledger"
    __table_args__ = (
        CheckConstraint(
            "entry_type IN ('INITIAL_CAPITAL', 'TRADE_DEBIT', 'TRADE_CREDIT', 'CHARGE', 'ADJUSTMENT', 'RESET')",
            name="cash_ledger_entry_type_check",
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    account_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    entry_type: Mapped[str] = mapped_column(String(30), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    balance_after: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    account: Mapped["Account"] = relationship("Account", back_populates="ledger_entries")


class SavedScenario(Base):
    __tablename__ = "saved_scenarios"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    scenario_type: Mapped[str] = mapped_column(String(50), nullable=False)
    inputs_json: Mapped[str] = mapped_column(String, nullable=False)
    assumptions_json: Mapped[str] = mapped_column(String, nullable=False)
    baseline_snapshot_json: Mapped[str] = mapped_column(String, nullable=False)
    result_json: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship("User", back_populates="saved_scenarios")


class PortfolioSafePoint(Base):
    __tablename__ = "portfolio_safepoints"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4, server_default=func.gen_random_uuid())
    account_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(30), nullable=False, server_default="MANUAL")
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    reserved_cash: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    total_portfolio_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, server_default="0.00")
    positions_snapshot: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    open_orders_snapshot: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_restored: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    restored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    account: Mapped["Account"] = relationship("Account", back_populates="safepoints")



