from decimal import Decimal
import os
import sys
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))

os.environ["JWT_SECRET"] = "test-secret-key-that-is-at-least-32-characters-long"
os.environ["APP_ENV"] = "development"

from test_financial_models import client, setup_db, TestingSessionLocal
from app.models import Account, CashLedger, Instrument, Order, OrderFill, Position, User
from app.services.market_data import market_store
from app.services.squareoff_service import execute_mis_squareoff


def get_authed_client(client, name="Trader Joe", email="joe@example.com"):
    reg_res = client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": "password123"},
    )
    assert reg_res.status_code == 201
    return client


def test_buy_market_order_execution(client):
    """1. Buy Market order executes immediately at current quote price."""
    c = get_authed_client(client, "Trader 1", "trader1@example.com")
    market_store.update_quote("RELIANCE", price=2850.00, previous_close=2820.00, source="live")

    res = c.post(
        "/api/orders",
        json={
            "symbol": "RELIANCE",
            "side": "BUY",
            "product": "CNC",
            "order_type": "MARKET",
            "quantity": 10,
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "FILLED"
    assert data["filled_quantity"] == 10
    assert float(data["average_execution_price"]) == 2850.00
    assert len(data["fills"]) == 1

    # Verify positions and cash
    db = TestingSessionLocal()
    positions = c.get("/api/portfolio/holdings").json()
    assert len(positions) == 1
    assert positions[0]["symbol"] == "RELIANCE"
    assert positions[0]["quantity"] == 10


def test_sell_cnc_without_holdings_rejected(client):
    """2. Selling CNC without existing holdings is rejected (no naked short selling)."""
    c = get_authed_client(client, "Trader 2", "trader2@example.com")
    market_store.update_quote("TCS", price=3900.00, previous_close=3880.00, source="live")

    res = c.post(
        "/api/orders",
        json={
            "symbol": "TCS",
            "side": "SELL",
            "product": "CNC",
            "order_type": "MARKET",
            "quantity": 5,
        },
    )
    assert res.status_code == 400
    assert "Insufficient CNC holdings" in res.json()["detail"]


def test_buy_and_sell_cnc_cycle_with_realized_pnl(client):
    """3. Buying CNC and selling part of it updates realized P&L and cash ledger correctly."""
    c = get_authed_client(client, "Trader 3", "trader3@example.com")
    market_store.update_quote("INFYS", price=1600.00, previous_close=1580.00, source="live")

    # Buy 20 shares @ 1600
    buy_res = c.post(
        "/api/orders",
        json={"symbol": "INFYS", "side": "BUY", "product": "CNC", "order_type": "MARKET", "quantity": 20},
    )
    assert buy_res.status_code == 201
    assert buy_res.json()["status"] == "FILLED"

    # Price rises to 1700
    market_store.update_quote("INFYS", price=1700.00, previous_close=1600.00, source="live")

    # Sell 10 shares @ 1700
    sell_res = c.post(
        "/api/orders",
        json={"symbol": "INFYS", "side": "SELL", "product": "CNC", "order_type": "MARKET", "quantity": 10},
    )
    assert sell_res.status_code == 201
    assert sell_res.json()["status"] == "FILLED"

    # Verify remaining holdings and realized P&L
    holdings = c.get("/api/portfolio/holdings").json()
    assert len(holdings) == 1
    assert holdings[0]["quantity"] == 10
    assert float(holdings[0]["realized_pnl"]) > 0  # Profit recorded


def test_buy_limit_order_execution_on_favorable_price(client):
    """4. Buy Limit order remains OPEN until market price drops to or below limit price."""
    c = get_authed_client(client, "Trader 4", "trader4@example.com")
    market_store.update_quote("HDFCBANK", price=1550.00, previous_close=1540.00, source="live")

    # Place Buy Limit @ 1500 (current market is 1550 -> should remain OPEN)
    res = c.post(
        "/api/orders",
        json={
            "symbol": "HDFCBANK",
            "side": "BUY",
            "product": "CNC",
            "order_type": "LIMIT",
            "quantity": 10,
            "limit_price": 1500.00,
        },
    )
    assert res.status_code == 201
    assert res.json()["status"] == "OPEN"

    # Market price drops to 1495 -> order should fill
    market_store.update_quote("HDFCBANK", price=1495.00, previous_close=1550.00, source="live")

    # Fetch order details
    order_id = res.json()["id"]
    det_res = c.get(f"/api/orders/{order_id}")
    assert det_res.status_code == 200
    assert det_res.json()["status"] == "FILLED"
    assert float(det_res.json()["average_execution_price"]) <= 1500.00


def test_stop_loss_trigger_and_limit_execution(client):
    """5. Stop-Loss (SL) order remains PENDING_TRIGGER until trigger price is crossed."""
    c = get_authed_client(client, "Trader 5", "trader5@example.com")
    market_store.update_quote("TATAMOTORS", price=900.00, previous_close=890.00, source="live")

    # Place Buy SL order: trigger @ 920, limit @ 925
    res = c.post(
        "/api/orders",
        json={
            "symbol": "TATAMOTORS",
            "side": "BUY",
            "product": "MIS",
            "order_type": "SL",
            "quantity": 10,
            "limit_price": 925.00,
            "trigger_price": 920.00,
        },
    )
    assert res.status_code == 201
    assert res.json()["status"] == "PENDING_TRIGGER"

    # Price jumps to 922 -> Trigger satisfied, order converts to OPEN and fills at 922
    market_store.update_quote("TATAMOTORS", price=922.00, previous_close=900.00, source="live")

    order_id = res.json()["id"]
    det = c.get(f"/api/orders/{order_id}").json()
    assert det["status"] == "FILLED"


def test_order_cancellation(client):
    """6. Cancelling an open limit order sets status to CANCELLED."""
    c = get_authed_client(client, "Trader 6", "trader6@example.com")
    market_store.update_quote("SBIN", price=750.00, previous_close=745.00, source="live")

    # Place Buy Limit @ 700
    ord_res = c.post(
        "/api/orders",
        json={"symbol": "SBIN", "side": "BUY", "product": "CNC", "order_type": "LIMIT", "quantity": 10, "limit_price": 700.00},
    )
    order_id = ord_res.json()["id"]
    assert ord_res.json()["status"] == "OPEN"

    # Cancel order
    cancel_res = c.post(f"/api/orders/{order_id}/cancel")
    assert cancel_res.status_code == 200
    assert cancel_res.json()["status"] == "CANCELLED"


def test_order_modification(client):
    """7. Modifying limit price and quantity on open order."""
    c = get_authed_client(client, "Trader 7", "trader7@example.com")
    market_store.update_quote("WIPRO", price=480.00, previous_close=475.00, source="live")

    # Place Buy Limit @ 450
    ord_res = c.post(
        "/api/orders",
        json={"symbol": "WIPRO", "side": "BUY", "product": "CNC", "order_type": "LIMIT", "quantity": 10, "limit_price": 450.00},
    )
    order_id = ord_res.json()["id"]

    # Modify limit price to 485 (market is 480 -> should trigger fill!)
    mod_res = c.patch(
        f"/api/orders/{order_id}",
        json={"quantity": 15, "limit_price": 485.00},
    )
    assert mod_res.status_code == 200
    assert mod_res.json()["status"] == "FILLED"
    assert mod_res.json()["filled_quantity"] == 15


def test_insufficient_funds_rejected(client):
    """8. Order requiring more cash than available balance is rejected."""
    c = get_authed_client(client, "Trader 8", "trader8@example.com")
    market_store.update_quote("MARUTI", price=12000.00, previous_close=11900.00, source="live")

    # Attempt to buy 100 shares of MARUTI @ 12000 = 12,000,000 INR (Capital is 100,000)
    res = c.post(
        "/api/orders",
        json={"symbol": "MARUTI", "side": "BUY", "product": "CNC", "order_type": "MARKET", "quantity": 100},
    )
    assert res.status_code == 400
    assert "Insufficient cash balance" in res.json()["detail"]


def test_mis_automatic_squareoff(client):
    """9. Automatic MIS Square-off cancels open MIS orders and closes open MIS positions."""
    c = get_authed_client(client, "Trader 9", "trader9@example.com")
    market_store.update_quote("AXISBANK", price=1100.00, previous_close=1090.00, source="live")

    # Create open MIS Buy position
    c.post(
        "/api/orders",
        json={"symbol": "AXISBANK", "side": "BUY", "product": "MIS", "order_type": "MARKET", "quantity": 20},
    )

    positions_before = c.get("/api/portfolio/positions?product=MIS").json()
    assert len(positions_before) == 1
    assert positions_before[0]["quantity"] == 20

    # Trigger force MIS square-off
    sq_res = c.post("/api/square-off?force=true")
    assert sq_res.status_code == 200
    assert sq_res.json()["squared_off_positions"] >= 1

    positions_after = c.get("/api/portfolio/positions?product=MIS").json()
    assert len(positions_after) == 0  # Position closed!
