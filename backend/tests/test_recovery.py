import os
import sys
from decimal import Decimal
import pytest

sys.path.insert(0, os.path.dirname(__file__))
from test_financial_models import client, setup_db, TestingSessionLocal
from app.models import Position, Account


@pytest.fixture
def auth_client_recovery(client):
    res = client.post(
        "/api/auth/register",
        json={"name": "Recovery User", "email": "recovery_user@example.com", "password": "password123"},
    )
    assert res.status_code == 201
    return client


def test_create_and_list_safepoint(auth_client_recovery):
    # 1. Create a SafePoint
    create_res = auth_client_recovery.post(
        "/api/recovery/safepoints",
        json={"name": "Pre-Trading Baseline", "note": "Clean portfolio state"},
    )
    assert create_res.status_code == 200
    sp_data = create_res.json()
    assert sp_data["name"] == "Pre-Trading Baseline"
    assert Decimal(str(sp_data["cash_balance"])) == Decimal("100000.00")
    assert sp_data["is_restored"] is False
    safepoint_id = sp_data["id"]

    # 2. List SafePoints
    list_res = auth_client_recovery.get("/api/recovery/safepoints")
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) >= 1
    assert any(i["id"] == safepoint_id for i in items)


def test_preview_and_execute_rollback(auth_client_recovery):
    # 1. Capture SafePoint
    sp_res = auth_client_recovery.post(
        "/api/recovery/safepoints",
        json={"name": "Safe Checkpoint", "note": "Before buying stocks"},
    )
    assert sp_res.status_code == 200
    safepoint_id = sp_res.json()["id"]

    # 2. Simulate Disruption: Buy 50 TCS @ 1200
    # The system detects the crash and AUTOMATICALLY executes rollback
    disrupt_res = auth_client_recovery.post(
        "/api/recovery/simulate-disruption",
        json={"symbol": "TCS", "quantity": 50, "price": 1200.00},
    )
    assert disrupt_res.status_code == 200
    disrupt_data = disrupt_res.json()
    assert disrupt_data["disruption_type"] == "BROKER_NETWORK_TIMEOUT_PACKET_LOSS"
    assert disrupt_data["auto_recovered"] is True
    assert disrupt_data["status"] == "AUTO_RECOVERED"
    assert Decimal(str(disrupt_data["impact"]["funds_at_risk"])) == Decimal("60000.00")

    # 3. Verify Account Portfolio State was automatically restored without manual button
    summary_res = auth_client_recovery.get("/api/portfolio/summary")
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert Decimal(str(summary["cash_balance"])) == Decimal(str(disrupt_data["impact"]["active_cash_balance"]))
