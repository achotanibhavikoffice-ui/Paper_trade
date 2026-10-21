from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class BaselineHoldingItem(BaseModel):
    instrument_id: str
    symbol: str
    name: str
    exchange: str
    product: str
    quantity: int
    average_price: Decimal
    current_price: Decimal
    current_value: Decimal
    unrealized_pnl: Decimal
    unrealized_pnl_percent: Decimal
    quote_source: str
    is_fresh: bool


class PortfolioBaselineResponse(BaseModel):
    cash_balance: Decimal
    holdings_value: Decimal
    total_portfolio_value: Decimal
    unrealized_pnl: Decimal
    holdings_count: int
    valuation_timestamp: str
    is_complete: bool
    quotes_status: str
    holdings: List[BaselineHoldingItem]


class SingleStockInput(BaseModel):
    symbol: str
    investment_amount: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    quantity: Optional[int] = Field(default=None, ge=1)
    manual_purchase_price: Optional[Decimal] = Field(default=None, gt=Decimal("0"))
    manual_future_price: Optional[Decimal] = Field(default=None, gt=Decimal("0"))
    future_shift_percent: Optional[Decimal] = Field(default=None)
    holding_period_label: Optional[str] = Field(default="1 Month")


class PriceScenarioGridItem(BaseModel):
    label: str
    shift_percent: Decimal
    hypothetical_price: Decimal
    future_position_value: Decimal
    hypothetical_pnl: Decimal
    return_percent: Decimal


class SingleStockResult(BaseModel):
    symbol: str
    name: str
    exchange: str
    assumed_entry_price: Decimal
    is_manual_entry_price: bool
    hypothetical_future_price: Decimal
    is_manual_future_price: bool
    quantity: int
    actual_investment: Decimal
    unused_cash: Decimal
    future_position_value: Decimal
    hypothetical_pnl: Decimal
    return_percent: Decimal
    quote_timestamp: str
    quote_source: str
    holding_period_label: str
    scenario_grid: List[PriceScenarioGridItem]
    assumptions: List[str]


class StressTestInput(BaseModel):
    global_shift_percent: Decimal = Field(default=Decimal("0.0"))
    stock_shifts: Optional[Dict[str, Decimal]] = Field(default_factory=dict)
    preset_name: Optional[str] = Field(default=None)


class StressHoldingBreakdown(BaseModel):
    symbol: str
    name: str
    quantity: int
    baseline_price: Decimal
    simulated_price: Decimal
    baseline_value: Decimal
    simulated_value: Decimal
    pnl_impact: Decimal
    pnl_impact_percent: Decimal
    quote_source: str


class StressTestResult(BaseModel):
    preset_name: Optional[str]
    global_shift_percent: Decimal
    baseline_holdings_value: Decimal
    simulated_holdings_value: Decimal
    baseline_cash: Decimal
    simulated_cash: Decimal
    baseline_portfolio_value: Decimal
    simulated_portfolio_value: Decimal
    portfolio_impact: Decimal
    portfolio_impact_percent: Decimal
    holdings_count: int
    missing_price_count: int
    holdings_breakdown: List[StressHoldingBreakdown]
    assumptions: List[str]


class AllocationInput(BaseModel):
    symbol: str
    action: str = Field(pattern="^(BUY|SELL)$")
    quantity: Optional[int] = Field(default=None, ge=1)
    amount: Optional[Decimal] = Field(default=None, ge=Decimal("0"))
    manual_price: Optional[Decimal] = Field(default=None, gt=Decimal("0"))


class AllocationResult(BaseModel):
    symbol: str
    name: str
    action: str
    assumed_price: Decimal
    is_manual_price: bool
    simulated_quantity: int
    total_transaction_value: Decimal
    baseline_cash: Decimal
    hypothetical_cash: Decimal
    baseline_position_quantity: int
    hypothetical_position_quantity: int
    baseline_position_value: Decimal
    hypothetical_position_value: Decimal
    baseline_portfolio_value: Decimal
    hypothetical_portfolio_value: Decimal
    allocation_percent_before: Decimal
    allocation_percent_after: Decimal
    assumptions: List[str]


class SavedScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scenario_type: str = Field(pattern="^(single_stock|portfolio_stress|allocation)$")
    inputs: Dict[str, Any]
    assumptions: List[str]
    baseline_snapshot: Dict[str, Any]
    result: Dict[str, Any]


class SavedScenarioResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    scenario_type: str
    inputs: Dict[str, Any]
    assumptions: List[str]
    baseline_snapshot: Dict[str, Any]
    result: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ScenarioCompareRequest(BaseModel):
    scenario_ids: Optional[List[UUID]] = Field(default=None, max_length=3)
    inline_scenarios: Optional[List[SavedScenarioCreate]] = Field(default=None, max_length=3)


class ScenarioCompareItem(BaseModel):
    id: Optional[str]
    name: str
    scenario_type: str
    initial_cash_deployed_or_shift: str
    resulting_portfolio_value: Decimal
    hypothetical_pnl: Decimal
    return_percent: Decimal
    cash_remaining: Decimal
    largest_position_symbol: Optional[str]
    largest_position_allocation_percent: Optional[Decimal]
    assumptions: List[str]


class ScenarioCompareResponse(BaseModel):
    scenarios: List[ScenarioCompareItem]
    compared_at: str


class MarketStressConfig(BaseModel):
    enabled: bool
    level: str = Field(default="high", pattern="^(mild|high|panic)$")


class MarketStressStateResponse(BaseModel):
    enabled: bool
    level: str
    vix_index: float
    multiplier: float
    message: str
