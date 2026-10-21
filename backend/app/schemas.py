from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator



class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Enter a name with at least 2 characters.")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ProfileUpdateInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Enter a name with at least 2 characters.")
        return value


class ForgotPasswordInput(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class ResetPasswordInput(BaseModel):
    token: str = Field(min_length=32, max_length=512)
    new_password: str = Field(min_length=8, max_length=72)


class UserResponse(BaseModel):
    id: UUID
    name: str
    email: EmailStr
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuthResponse(BaseModel):
    user: UserResponse


class AccountResponse(BaseModel):
    id: UUID
    user_id: UUID
    account_number: str
    account_type: str
    currency: str
    initial_capital: Decimal
    cash_balance: Decimal
    reserved_cash: Decimal = Decimal("0.00")
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LedgerEntryResponse(BaseModel):
    id: UUID
    account_id: UUID
    entry_type: str
    amount: Decimal
    balance_after: Decimal
    reference_id: str | None = None
    description: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedLedgerResponse(BaseModel):
    items: list[LedgerEntryResponse]
    total: int
    limit: int
    offset: int


class InstrumentResponse(BaseModel):
    id: UUID
    symbol: str
    name: str
    exchange: str
    instrument_type: str
    sector: str | None = None
    is_tradable: bool
    lot_size: int
    provider_token: int | None = None
    provider_exchange: str | None = None
    tick_size_paise: int = 1
    price: float | None = None
    change: str | None = None
    change_percent: float | None = None
    up: bool | None = None
    is_live: bool | None = None

    model_config = ConfigDict(from_attributes=True)


class OrderCreateInput(BaseModel):
    instrument_id: UUID
    side: Literal["BUY", "SELL"]
    product: Literal["CNC", "MIS"]
    order_type: Literal["MARKET", "LIMIT", "SL", "SL-M"]
    quantity: int = Field(gt=0, le=1000000)
    limit_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    trigger_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    validity: Literal["DAY", "IOC"] = "DAY"
    idempotency_key: str = Field(min_length=8, max_length=64)


class OrderModifyInput(BaseModel):
    quantity: int = Field(gt=0, le=1000000)
    limit_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    trigger_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    validity: Literal["DAY", "IOC"] = "DAY"


class MarketStressInput(BaseModel):
    enabled: bool


class ScenarioCreateInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    shocks: dict[str, Decimal] = Field(min_length=1, max_length=100)

    @field_validator("shocks")
    @classmethod
    def validate_shocks(cls, shocks: dict[str, Decimal]) -> dict[str, Decimal]:
        normalized: dict[str, Decimal] = {}
        for symbol, percent in shocks.items():
            name = symbol.strip().upper()
            if not name or percent < -99 or percent > 500:
                raise ValueError("Each symbol needs a price shock between -99% and +500%.")
            normalized[name] = percent
        return normalized


class QuoteResponse(BaseModel):
    symbol: str
    exchange: str
    token: int
    last_price: Decimal
    previous_close: Decimal | None = None
    open: Decimal | None = None
    high: Decimal | None = None
    low: Decimal | None = None
    volume: int | None = None
    bids: list[dict[str, int | Decimal]] = Field(default_factory=list)
    asks: list[dict[str, int | Decimal]] = Field(default_factory=list)
    timestamp: datetime


class TradeResponse(BaseModel):
    id: UUID
    account_id: UUID
    order_id: UUID
    instrument_id: UUID
    sequence: int
    quantity: int
    price: Decimal
    side: str
    product: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SafePointCreateInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    note: str | None = Field(default=None, max_length=255)


class SafePointResponse(BaseModel):
    id: UUID
    account_id: UUID
    name: str
    trigger_type: str
    cash_balance: Decimal
    reserved_cash: Decimal
    total_portfolio_value: Decimal
    positions_snapshot: list[dict]
    open_orders_snapshot: list[dict]
    note: str | None = None
    is_restored: bool
    restored_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SafePointPreviewResponse(BaseModel):
    safepoint_id: UUID
    safepoint_name: str
    created_at: datetime
    current_cash: Decimal
    target_cash: Decimal
    cash_delta: Decimal
    orders_to_cancel_count: int
    orders_to_cancel: list[dict]
    positions_diff: list[dict]


class SafePointRollbackResponse(BaseModel):
    success: bool
    message: str
    safepoint_id: UUID
    safepoint_name: str
    restored_at: datetime
    cash_restored: Decimal
    new_cash_balance: Decimal
    orders_cancelled_count: int
    positions_reverted_count: int


class DisruptionSimulateInput(BaseModel):
    symbol: str = Field(default="TCS", max_length=25)
    quantity: int = Field(default=50, gt=0)
    price: Decimal = Field(default=Decimal("1200.00"), gt=0)


