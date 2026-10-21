from datetime import datetime, timezone
from decimal import Decimal, ROUND_FLOOR, ROUND_HALF_UP
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, Instrument, Position, SavedScenario, User
from app.schemas_what_if import (
    AllocationInput,
    AllocationResult,
    BaselineHoldingItem,
    PortfolioBaselineResponse,
    PriceScenarioGridItem,
    SavedScenarioCreate,
    SavedScenarioResponse,
    ScenarioCompareItem,
    ScenarioCompareResponse,
    SingleStockInput,
    SingleStockResult,
    StressHoldingBreakdown,
    StressTestInput,
    StressTestResult,
)
from app.services.market_data import market_store


def _quantize_money(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _quantize_percent(percent: Decimal) -> Decimal:
    return percent.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def get_portfolio_baseline(user: User, db: Session) -> PortfolioBaselineResponse:
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    cash_balance = Decimal(str(account.cash_balance)) if account else Decimal("100000.00")

    positions = []
    if account:
        stmt = (
            select(Position, Instrument)
            .join(Instrument, Position.instrument_id == Instrument.id)
            .where(Position.account_id == account.id, Position.quantity > 0)
        )
        positions = db.execute(stmt).all()

    holdings_items: List[BaselineHoldingItem] = []
    total_holdings_value = Decimal("0.00")
    total_unrealized_pnl = Decimal("0.00")
    all_quotes_fresh = True
    missing_quotes_count = 0

    now_iso = datetime.now(timezone.utc).isoformat()

    for pos, inst in positions:
        quote = market_store.get_quote(inst.symbol)
        curr_price = Decimal(str(quote.price)) if (quote and quote.price > 0) else Decimal(str(pos.average_price))
        if curr_price <= Decimal("0"):
            curr_price = Decimal("100.00")

        if not quote or not quote.is_fresh:
            all_quotes_fresh = False
        if not quote or quote.price <= 0:
            missing_quotes_count += 1

        qty = pos.quantity
        avg_price = Decimal(str(pos.average_price))
        curr_value = _quantize_money(curr_price * Decimal(qty))
        invested = _quantize_money(avg_price * Decimal(qty))
        pnl = _quantize_money(curr_value - invested)
        pnl_percent = _quantize_percent((pnl / invested * Decimal("100")) if invested > Decimal("0") else Decimal("0.00"))

        total_holdings_value += curr_value
        total_unrealized_pnl += pnl

        holdings_items.append(
            BaselineHoldingItem(
                instrument_id=str(inst.id),
                symbol=inst.symbol,
                name=inst.name,
                exchange=inst.exchange,
                product=pos.product,
                quantity=qty,
                average_price=_quantize_money(avg_price),
                current_price=_quantize_money(curr_price),
                current_value=curr_value,
                unrealized_pnl=pnl,
                unrealized_pnl_percent=pnl_percent,
                quote_source=quote.source if quote else "fallback",
                is_fresh=quote.is_fresh if quote else False,
            )
        )

    total_portfolio_value = _quantize_money(cash_balance + total_holdings_value)
    quotes_status = "live" if all_quotes_fresh and holdings_items else ("partial" if missing_quotes_count > 0 else "cached")

    return PortfolioBaselineResponse(
        cash_balance=_quantize_money(cash_balance),
        holdings_value=_quantize_money(total_holdings_value),
        total_portfolio_value=total_portfolio_value,
        unrealized_pnl=_quantize_money(total_unrealized_pnl),
        holdings_count=len(holdings_items),
        valuation_timestamp=now_iso,
        is_complete=(missing_quotes_count == 0),
        quotes_status=quotes_status,
        holdings=holdings_items,
    )


def simulate_single_stock(input_data: SingleStockInput, db: Optional[Session] = None) -> SingleStockResult:
    symbol = input_data.symbol.upper()
    quote = market_store.get_quote(symbol)

    inst_name = f"{symbol} Equity"
    exchange = "NSE"
    if db:
        inst = db.scalar(select(Instrument).where(Instrument.symbol == symbol))
        if inst:
            inst_name = inst.name
            exchange = inst.exchange

    # Resolve entry price
    is_manual_entry = False
    if input_data.manual_purchase_price and input_data.manual_purchase_price > Decimal("0"):
        entry_price = input_data.manual_purchase_price
        is_manual_entry = True
    elif quote and quote.price > 0:
        entry_price = Decimal(str(quote.price))
    else:
        entry_price = Decimal("1500.00")
        is_manual_entry = True

    # Calculate quantity & actual investment
    if input_data.quantity and input_data.quantity > 0:
        qty = input_data.quantity
        actual_investment = _quantize_money(Decimal(qty) * entry_price)
        unused_cash = Decimal("0.00")
    elif input_data.investment_amount and input_data.investment_amount > Decimal("0"):
        target_amt = input_data.investment_amount
        qty = int((target_amt / entry_price).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        qty = max(1, qty)
        actual_investment = _quantize_money(Decimal(qty) * entry_price)
        unused_cash = _quantize_money(target_amt - actual_investment)
        if unused_cash < Decimal("0"):
            unused_cash = Decimal("0.00")
    else:
        qty = 10
        actual_investment = _quantize_money(Decimal(qty) * entry_price)
        unused_cash = Decimal("0.00")

    # Resolve future price
    is_manual_future = False
    if input_data.manual_future_price and input_data.manual_future_price > Decimal("0"):
        future_price = input_data.manual_future_price
        is_manual_future = True
    elif input_data.future_shift_percent is not None:
        future_price = entry_price * (Decimal("1.0") + (input_data.future_shift_percent / Decimal("100")))
        is_manual_future = True
    else:
        future_price = entry_price * Decimal("1.10")  # +10% default

    future_price = _quantize_money(future_price)
    future_pos_val = _quantize_money(Decimal(qty) * future_price)
    hyp_pnl = _quantize_money(future_pos_val - actual_investment)
    return_pct = _quantize_percent((hyp_pnl / actual_investment * Decimal("100")) if actual_investment > Decimal("0") else Decimal("0.00"))

    # Generate standard scenario grid (-10%, 0%, +5%, +10%, +25%)
    grid_shifts = [
        ("-10% Bearish", Decimal("-10.0")),
        ("0% Base", Decimal("0.0")),
        ("+5% Moderate Bull", Decimal("5.0")),
        ("+10% Bullish", Decimal("10.0")),
        ("+25% Strong Rally", Decimal("25.0")),
    ]

    scenario_grid: List[PriceScenarioGridItem] = []
    for label, shift in grid_shifts:
        grid_price = _quantize_money(entry_price * (Decimal("1.0") + (shift / Decimal("100"))))
        grid_pos_val = _quantize_money(Decimal(qty) * grid_price)
        grid_pnl = _quantize_money(grid_pos_val - actual_investment)
        grid_return = _quantize_percent((grid_pnl / actual_investment * Decimal("100")) if actual_investment > Decimal("0") else Decimal("0.00"))
        scenario_grid.append(
            PriceScenarioGridItem(
                label=label,
                shift_percent=shift,
                hypothetical_price=grid_price,
                future_position_value=grid_pos_val,
                hypothetical_pnl=grid_pnl,
                return_percent=grid_return,
            )
        )

    assumptions = [
        f"Entry price assumed at ₹{entry_price:.2f} ({'Manual assumption' if is_manual_entry else 'Live/Cached quote'}).",
        f"Simulated purchase of {qty} whole shares totaling ₹{actual_investment:.2f}.",
        "Hypothetical valuation does not execute real orders or deduct account funds.",
    ]
    if unused_cash > Decimal("0"):
        assumptions.append(f"Unused cash of ₹{unused_cash:.2f} remains uninvested due to whole share rounding.")

    return SingleStockResult(
        symbol=symbol,
        name=inst_name,
        exchange=exchange,
        assumed_entry_price=_quantize_money(entry_price),
        is_manual_entry_price=is_manual_entry,
        hypothetical_future_price=future_price,
        is_manual_future_price=is_manual_future,
        quantity=qty,
        actual_investment=actual_investment,
        unused_cash=unused_cash,
        future_position_value=future_pos_val,
        hypothetical_pnl=hyp_pnl,
        return_percent=return_pct,
        quote_timestamp=datetime.now(timezone.utc).isoformat(),
        quote_source=quote.source if quote else ("manual" if is_manual_entry else "cached"),
        holding_period_label=input_data.holding_period_label or "1 Month",
        scenario_grid=scenario_grid,
        assumptions=assumptions,
    )


def simulate_portfolio_stress(user: User, db: Session, input_data: StressTestInput) -> StressTestResult:
    baseline = get_portfolio_baseline(user, db)

    global_shift = input_data.global_shift_percent
    stock_shifts = input_data.stock_shifts or {}

    breakdown: List[StressHoldingBreakdown] = []
    simulated_holdings_value = Decimal("0.00")
    missing_count = 0

    for h in baseline.holdings:
        shift_pct = stock_shifts.get(h.symbol, global_shift)
        sim_price = _quantize_money(h.current_price * (Decimal("1.0") + (shift_pct / Decimal("100"))))
        if sim_price < Decimal("0"):
            sim_price = Decimal("0.00")

        sim_val = _quantize_money(Decimal(h.quantity) * sim_price)
        pnl_impact = _quantize_money(sim_val - h.current_value)
        pnl_impact_pct = _quantize_percent((pnl_impact / h.current_value * Decimal("100")) if h.current_value > Decimal("0") else Decimal("0.00"))

        simulated_holdings_value += sim_val
        if not h.is_fresh and h.quote_source == "fallback":
            missing_count += 1

        breakdown.append(
            StressHoldingBreakdown(
                symbol=h.symbol,
                name=h.name,
                quantity=h.quantity,
                baseline_price=h.current_price,
                simulated_price=sim_price,
                baseline_value=h.current_value,
                simulated_value=sim_val,
                pnl_impact=pnl_impact,
                pnl_impact_percent=pnl_impact_pct,
                quote_source=h.quote_source,
            )
        )

    simulated_holdings_value = _quantize_money(simulated_holdings_value)
    simulated_portfolio_value = _quantize_money(baseline.cash_balance + simulated_holdings_value)
    portfolio_impact = _quantize_money(simulated_portfolio_value - baseline.total_portfolio_value)
    portfolio_impact_pct = _quantize_percent(
        (portfolio_impact / baseline.total_portfolio_value * Decimal("100")) if baseline.total_portfolio_value > Decimal("0") else Decimal("0.00")
    )

    preset_name = input_data.preset_name or (f"Custom ({global_shift:+}% Market Shift)" if global_shift != Decimal("0") else "Base Market")

    assumptions = [
        f"Simulated portfolio stress scenario: {preset_name}.",
        f"Cash balance of ₹{baseline.cash_balance:.2f} remains unchanged during price stress test.",
        "Scenario calculations do not alter actual holdings or place market orders.",
    ]
    if missing_count > 0:
        assumptions.append(f"Warning: {missing_count} holding(s) used baseline fallback prices due to missing live market quotes.")

    return StressTestResult(
        preset_name=preset_name,
        global_shift_percent=global_shift,
        baseline_holdings_value=baseline.holdings_value,
        simulated_holdings_value=simulated_holdings_value,
        baseline_cash=baseline.cash_balance,
        simulated_cash=baseline.cash_balance,
        baseline_portfolio_value=baseline.total_portfolio_value,
        simulated_portfolio_value=simulated_portfolio_value,
        portfolio_impact=portfolio_impact,
        portfolio_impact_percent=portfolio_impact_pct,
        holdings_count=len(breakdown),
        missing_price_count=missing_count,
        holdings_breakdown=breakdown,
        assumptions=assumptions,
    )


def simulate_allocation(user: User, db: Session, input_data: AllocationInput) -> AllocationResult:
    symbol = input_data.symbol.upper()
    action = input_data.action.upper()
    if action not in ("BUY", "SELL"):
        raise ValueError("Action must be either BUY or SELL")

    baseline = get_portfolio_baseline(user, db)

    # Find existing holding if any
    existing_holding = next((h for h in baseline.holdings if h.symbol == symbol), None)
    base_qty = existing_holding.quantity if existing_holding else 0
    base_pos_val = existing_holding.current_value if existing_holding else Decimal("0.00")

    # Resolve price
    quote = market_store.get_quote(symbol)
    is_manual = False
    if input_data.manual_price and input_data.manual_price > Decimal("0"):
        price = input_data.manual_price
        is_manual = True
    elif existing_holding and existing_holding.current_price > Decimal("0"):
        price = existing_holding.current_price
    elif quote and quote.price > 0:
        price = Decimal(str(quote.price))
    else:
        inst = db.scalar(select(Instrument).where(Instrument.symbol == symbol))
        price = Decimal("1000.00")
        is_manual = True

    inst_name = existing_holding.name if existing_holding else f"{symbol} Equity"
    if not existing_holding:
        inst = db.scalar(select(Instrument).where(Instrument.symbol == symbol))
        if inst:
            inst_name = inst.name

    # Determine quantity
    if input_data.quantity and input_data.quantity > 0:
        sim_qty = input_data.quantity
    elif input_data.amount and input_data.amount > Decimal("0"):
        sim_qty = max(1, int((input_data.amount / price).quantize(Decimal("1"), rounding=ROUND_FLOOR)))
    else:
        sim_qty = 10

    tx_value = _quantize_money(Decimal(sim_qty) * price)

    if action == "BUY":
        hyp_cash = _quantize_money(baseline.cash_balance - tx_value)
        hyp_qty = base_qty + sim_qty
    else:  # SELL
        if sim_qty > base_qty:
            raise ValueError(f"Cannot simulate SELL of {sim_qty} shares; you only hold {base_qty} shares of {symbol}.")
        hyp_cash = _quantize_money(baseline.cash_balance + tx_value)
        hyp_qty = base_qty - sim_qty

    hyp_pos_val = _quantize_money(Decimal(hyp_qty) * price)

    # Portfolio totals & allocations
    base_port_val = baseline.total_portfolio_value
    # Total portfolio value stays constant assuming cash <-> stock trade at fair value, but allocation changes!
    hyp_port_val = _quantize_money(hyp_cash + (baseline.holdings_value - base_pos_val + hyp_pos_val))

    alloc_before = _quantize_percent((base_pos_val / base_port_val * Decimal("100")) if base_port_val > Decimal("0") else Decimal("0.00"))
    alloc_after = _quantize_percent((hyp_pos_val / hyp_port_val * Decimal("100")) if hyp_port_val > Decimal("0") else Decimal("0.00"))

    assumptions = [
        f"Simulated hypothetical {action} of {sim_qty} shares of {symbol} at ₹{price:.2f}.",
        f"Cash balance shifts from ₹{baseline.cash_balance:.2f} to ₹{hyp_cash:.2f}.",
        f"Portfolio concentration for {symbol} changes from {alloc_before}% to {alloc_after}%.",
        "Hypothetical allocation experiment only; no orders executed on backend.",
    ]
    if hyp_cash < Decimal("0"):
        assumptions.append("Warning: Hypothetical purchase exceeds available virtual cash balance.")

    return AllocationResult(
        symbol=symbol,
        name=inst_name,
        action=action,
        assumed_price=_quantize_money(price),
        is_manual_price=is_manual,
        simulated_quantity=sim_qty,
        total_transaction_value=tx_value,
        baseline_cash=baseline.cash_balance,
        hypothetical_cash=hyp_cash,
        baseline_position_quantity=base_qty,
        hypothetical_position_quantity=hyp_qty,
        baseline_position_value=base_pos_val,
        hypothetical_position_value=hyp_pos_val,
        baseline_portfolio_value=base_port_val,
        hypothetical_portfolio_value=hyp_port_val,
        allocation_percent_before=alloc_before,
        allocation_percent_after=alloc_after,
        assumptions=assumptions,
    )
