import os
import sys
from decimal import Decimal
import pytest

sys.path.insert(0, os.path.dirname(__file__))
from test_financial_models import client, setup_db, TestingSessionLocal
from app.models import CashLedger, Order


@pytest.fixture
def auth_client(client):
    res = client.post(
        "/api/auth/register",
        json={"name": "WhatIf User", "email": "whatif_user@example.com", "password": "password123"},
    )
    assert res.status_code == 201
    return client


def test_what_if_baseline_endpoint(auth_client):
    res = auth_client.get("/api/what-if/baseline")
    assert res.status_code == 200
    data = res.json()
    assert "cash_balance" in data
    assert "holdings_value" in data
    assert "total_portfolio_value" in data
    assert "holdings" in data
    assert isinstance(data["holdings"], list)


def test_what_if_single_stock_simulation(auth_client):
    payload = {
        "symbol": "RELIANCE",
        "investment_amount": 10000.00,
        "manual_purchase_price": 1000.00,
        "manual_future_price": 1200.00,
        "holding_period_label": "3 Months"
    }
    res = auth_client.post("/api/what-if/simulate/stock", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["symbol"] == "RELIANCE"
    assert data["quantity"] == 10
    assert Decimal(str(data["actual_investment"])) == Decimal("10000.00")
    assert Decimal(str(data["future_position_value"])) == Decimal("12000.00")
    assert Decimal(str(data["hypothetical_pnl"])) == Decimal("2000.00")
    assert Decimal(str(data["return_percent"])) == Decimal("20.00")
    assert len(data["scenario_grid"]) >= 4


def test_what_if_stress_test_simulation(auth_client):
    payload = {
        "global_shift_percent": -15.0,
        "preset_name": "Broad Market Decline"
    }
    res = auth_client.post("/api/what-if/simulate/stress", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert Decimal(str(data["global_shift_percent"])) == Decimal("-15.00")
    assert data["preset_name"] == "Broad Market Decline"
    assert "baseline_portfolio_value" in data
    assert "simulated_portfolio_value" in data


def test_what_if_allocation_simulation_buy(auth_client):
    payload = {
        "symbol": "TCS",
        "action": "BUY",
        "quantity": 5,
        "manual_price": 2000.00
    }
    res = auth_client.post("/api/what-if/simulate/allocation", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["symbol"] == "TCS"
    assert data["action"] == "BUY"
    assert data["simulated_quantity"] == 5
    assert Decimal(str(data["total_transaction_value"])) == Decimal("10000.00")
    assert Decimal(str(data["hypothetical_cash"])) == Decimal(str(data["baseline_cash"])) - Decimal("10000.00")


def test_what_if_allocation_simulation_sell_invalid_qty(auth_client):
    payload = {
        "symbol": "INFY",
        "action": "SELL",
        "quantity": 99999,
        "manual_price": 1000.00
    }
    res = auth_client.post("/api/what-if/simulate/allocation", json=payload)
    assert res.status_code == 400
    assert "Cannot simulate SELL" in res.json()["detail"]


def test_what_if_saved_scenarios_crud_and_isolation(auth_client):
    # 1. Save scenario
    create_payload = {
        "name": "Reliance Growth Test",
        "scenario_type": "single_stock",
        "inputs": {"symbol": "RELIANCE", "quantity": 10},
        "assumptions": ["Testing entry at 1000"],
        "baseline_snapshot": {"cash": 100000.00},
        "result": {"hypothetical_pnl": 2000.00, "actual_investment": 10000.00, "symbol": "RELIANCE", "future_position_value": 12000.00}
    }
    save_res = auth_client.post("/api/what-if/scenarios", json=create_payload)
    assert save_res.status_code == 201
    saved_data = save_res.json()
    scenario_id = saved_data["id"]
    assert saved_data["name"] == "Reliance Growth Test"

    # 2. List scenarios
    list_res = auth_client.get("/api/what-if/scenarios")
    assert list_res.status_code == 200
    items = list_res.json()
    assert any(s["id"] == scenario_id for s in items)

    # 3. Retrieve scenario
    get_res = auth_client.get(f"/api/what-if/scenarios/{scenario_id}")
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Reliance Growth Test"

    # 4. Compare scenarios
    comp_payload = {
        "scenario_ids": [scenario_id]
    }
    comp_res = auth_client.post("/api/what-if/scenarios/compare", json=comp_payload)
    assert comp_res.status_code == 200
    comp_data = comp_res.json()
    assert len(comp_data["scenarios"]) == 1

    # 5. Delete scenario
    del_res = auth_client.delete(f"/api/what-if/scenarios/{scenario_id}")
    assert del_res.status_code == 200

    # 6. Verify zero side effects on real database tables
    db = TestingSessionLocal()
    orders = db.query(Order).count()
    ledger_entries = db.query(CashLedger).filter(CashLedger.entry_type == "TRADE_DEBIT").count()
    assert orders == 0
    assert ledger_entries == 0
