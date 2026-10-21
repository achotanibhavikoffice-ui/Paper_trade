import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SavedScenario, User
from app.routes.auth import get_current_user
from app.schemas_what_if import (
    AllocationInput,
    AllocationResult,
    PortfolioBaselineResponse,
    SavedScenarioCreate,
    SavedScenarioResponse,
    ScenarioCompareItem,
    ScenarioCompareRequest,
    ScenarioCompareResponse,
    MarketStressConfig,
    MarketStressStateResponse,
    SingleStockInput,
    SingleStockResult,
    StressTestInput,
    StressTestResult,
)
from app.services.market_data import market_store
from app.services.scenario_engine import (
    get_portfolio_baseline,
    simulate_allocation,
    simulate_portfolio_stress,
    simulate_single_stock,
)

router = APIRouter(prefix="/api/what-if", tags=["what-if"])


@router.get("/stress-mode", response_model=MarketStressStateResponse)
def get_stress_mode_state() -> MarketStressStateResponse:
    """Returns the current state of Market Stress Mode and simulated VIX index."""
    enabled = market_store.stress_mode_enabled
    level = market_store.stress_level
    vix = market_store.get_vix_index()
    mult = {"mild": 1.8, "high": 3.5, "panic": 5.0}.get(level, 1.0) if enabled else 1.0
    msg = f"Market Stress Mode ACTIVE ({level.upper()}). Simulated Quantx VIX: {vix:.1f}" if enabled else "Market Stress Mode OFF. Quotes operating under normal volatility."

    return MarketStressStateResponse(
        enabled=enabled,
        level=level,
        vix_index=vix,
        multiplier=mult,
        message=msg,
    )


@router.post("/stress-mode", response_model=MarketStressStateResponse)
def toggle_stress_mode(payload: MarketStressConfig) -> MarketStressStateResponse:
    """Enables or disables Market Stress Mode and sets intensity level."""
    market_store.set_stress_mode(payload.enabled, payload.level)
    enabled = market_store.stress_mode_enabled
    level = market_store.stress_level
    vix = market_store.get_vix_index()
    mult = {"mild": 1.8, "high": 3.5, "panic": 5.0}.get(level, 1.0) if enabled else 1.0
    msg = f"Market Stress Mode SET to {level.upper()} intensity. VIX: {vix:.1f}" if enabled else "Market Stress Mode DISABLED."

    return MarketStressStateResponse(
        enabled=enabled,
        level=level,
        vix_index=vix,
        multiplier=mult,
        message=msg,
    )



@router.get("/baseline", response_model=PortfolioBaselineResponse)
def get_baseline(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> PortfolioBaselineResponse:
    """Returns the authenticated user's current baseline portfolio data."""
    return get_portfolio_baseline(user, db)


@router.post("/simulate/stock", response_model=SingleStockResult)
def run_stock_simulation(
    payload: SingleStockInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SingleStockResult:
    """Calculates a single-stock hypothetical investment scenario."""
    return simulate_single_stock(payload, db)


@router.post("/simulate/stress", response_model=StressTestResult)
def run_stress_simulation(
    payload: StressTestInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StressTestResult:
    """Calculates a portfolio stress scenario."""
    return simulate_portfolio_stress(user, db, payload)


@router.post("/simulate/allocation", response_model=AllocationResult)
def run_allocation_simulation(
    payload: AllocationInput,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AllocationResult:
    """Calculates a hypothetical buy/sell allocation scenario."""
    try:
        return simulate_allocation(user, db, payload)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/scenarios", response_model=List[SavedScenarioResponse])
def list_scenarios(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> List[SavedScenarioResponse]:
    """Lists the authenticated user's saved scenarios."""
    scenarios = db.scalars(
        select(SavedScenario)
        .where(SavedScenario.user_id == user.id)
        .order_by(SavedScenario.created_at.desc())
    ).all()

    results = []
    for s in scenarios:
        results.append(
            SavedScenarioResponse(
                id=s.id,
                user_id=s.user_id,
                name=s.name,
                scenario_type=s.scenario_type,
                inputs=json.loads(s.inputs_json),
                assumptions=json.loads(s.assumptions_json),
                baseline_snapshot=json.loads(s.baseline_snapshot_json),
                result=json.loads(s.result_json),
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
        )
    return results


@router.post("/scenarios", response_model=SavedScenarioResponse, status_code=status.HTTP_201_CREATED)
def save_scenario(
    payload: SavedScenarioCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedScenarioResponse:
    """Saves a new what-if scenario for the user."""
    scenario = SavedScenario(
        user_id=user.id,
        name=payload.name,
        scenario_type=payload.scenario_type,
        inputs_json=json.dumps(payload.inputs, default=str),
        assumptions_json=json.dumps(payload.assumptions, default=str),
        baseline_snapshot_json=json.dumps(payload.baseline_snapshot, default=str),
        result_json=json.dumps(payload.result, default=str),
    )
    db.add(scenario)
    db.commit()
    db.refresh(scenario)

    return SavedScenarioResponse(
        id=scenario.id,
        user_id=scenario.user_id,
        name=scenario.name,
        scenario_type=scenario.scenario_type,
        inputs=json.loads(scenario.inputs_json),
        assumptions=json.loads(scenario.assumptions_json),
        baseline_snapshot=json.loads(scenario.baseline_snapshot_json),
        result=json.loads(scenario.result_json),
        created_at=scenario.created_at,
        updated_at=scenario.updated_at,
    )


@router.get("/scenarios/{scenario_id}", response_model=SavedScenarioResponse)
def get_scenario(
    scenario_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SavedScenarioResponse:
    """Retrieves a single saved scenario owned by the user."""
    s = db.scalar(select(SavedScenario).where(SavedScenario.id == scenario_id, SavedScenario.user_id == user.id))
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found.")

    return SavedScenarioResponse(
        id=s.id,
        user_id=s.user_id,
        name=s.name,
        scenario_type=s.scenario_type,
        inputs=json.loads(s.inputs_json),
        assumptions=json.loads(s.assumptions_json),
        baseline_snapshot=json.loads(s.baseline_snapshot_json),
        result=json.loads(s.result_json),
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


@router.delete("/scenarios/{scenario_id}")
def delete_scenario(
    scenario_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Deletes a saved scenario owned by the user."""
    s = db.scalar(select(SavedScenario).where(SavedScenario.id == scenario_id, SavedScenario.user_id == user.id))
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scenario not found.")

    db.delete(s)
    db.commit()
    return {"status": "ok", "message": "Scenario deleted.", "id": str(scenario_id)}


@router.post("/scenarios/compare", response_model=ScenarioCompareResponse)
def compare_scenarios(
    payload: ScenarioCompareRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ScenarioCompareResponse:
    """Compares up to 3 saved or inline scenarios side by side."""
    scenarios_data: List[dict] = []

    if payload.scenario_ids:
        for s_id in payload.scenario_ids[:3]:
            s = db.scalar(select(SavedScenario).where(SavedScenario.id == s_id, SavedScenario.user_id == user.id))
            if s:
                scenarios_data.append(
                    {
                        "id": str(s.id),
                        "name": s.name,
                        "scenario_type": s.scenario_type,
                        "assumptions": json.loads(s.assumptions_json),
                        "result": json.loads(s.result_json),
                    }
                )

    if payload.inline_scenarios:
        for inline in payload.inline_scenarios[: 3 - len(scenarios_data)]:
            scenarios_data.append(
                {
                    "id": None,
                    "name": inline.name,
                    "scenario_type": inline.scenario_type,
                    "assumptions": inline.assumptions,
                    "result": inline.result,
                }
            )

    items: List[ScenarioCompareItem] = []
    for item in scenarios_data:
        res = item.get("result", {})
        stype = item.get("scenario_type")

        if stype == "single_stock":
            deploy_str = f"₹{res.get('actual_investment', 0):,.2f} in {res.get('symbol')}"
            resulting_port = Decimal(str(res.get("future_position_value", 0))) + Decimal(str(res.get("unused_cash", 0)))
            pnl = Decimal(str(res.get("hypothetical_pnl", 0)))
            ret_pct = Decimal(str(res.get("return_percent", 0)))
            cash_rem = Decimal(str(res.get("unused_cash", 0)))
            largest_symbol = res.get("symbol")
            largest_alloc = Decimal("100.00")
        elif stype == "portfolio_stress":
            deploy_str = f"{res.get('global_shift_percent', 0):+}% Market Shift"
            resulting_port = Decimal(str(res.get("simulated_portfolio_value", 0)))
            pnl = Decimal(str(res.get("portfolio_impact", 0)))
            ret_pct = Decimal(str(res.get("portfolio_impact_percent", 0)))
            cash_rem = Decimal(str(res.get("simulated_cash", 0)))
            largest_symbol = None
            largest_alloc = None
        else:  # allocation
            deploy_str = f"{res.get('action')} {res.get('simulated_quantity')} shares of {res.get('symbol')}"
            resulting_port = Decimal(str(res.get("hypothetical_portfolio_value", 0)))
            pnl = Decimal("0.00")
            ret_pct = Decimal("0.00")
            cash_rem = Decimal(str(res.get("hypothetical_cash", 0)))
            largest_symbol = res.get("symbol")
            largest_alloc = Decimal(str(res.get("allocation_percent_after", 0)))

        items.append(
            ScenarioCompareItem(
                id=item.get("id"),
                name=item.get("name"),
                scenario_type=stype,
                initial_cash_deployed_or_shift=deploy_str,
                resulting_portfolio_value=resulting_port,
                hypothetical_pnl=pnl,
                return_percent=ret_pct,
                cash_remaining=cash_rem,
                largest_position_symbol=largest_symbol,
                largest_position_allocation_percent=largest_alloc,
                assumptions=item.get("assumptions", []),
            )
        )

    return ScenarioCompareResponse(
        scenarios=items,
        compared_at=datetime.now(timezone.utc).isoformat(),
    )
