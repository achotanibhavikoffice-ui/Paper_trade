from decimal import Decimal
import asyncio
import json
import os
import sys
from uuid import UUID, uuid4


import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Set JWT secret for test runtime before app import
os.environ["JWT_SECRET"] = "test-secret-key-that-is-at-least-32-characters-long"
os.environ["APP_ENV"] = "test"
os.environ["DEMO_MARKET_DATA_ENABLED"] = "false"

from app.database import Base, get_db
from app.main import app, seed_instruments_if_empty
from app.models import Account, CashLedger, User

TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False}, poolclass=StaticPool)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as session:
        # Override SessionLocal for test seeding
        from app import main
        original_sessionlocal = main.SessionLocal
        main.SessionLocal = TestingSessionLocal
        seed_instruments_if_empty()
        main.SessionLocal = original_sessionlocal
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


def test_registration_creates_account_and_initial_capital(client):
    """1. Newly registered user receives one account with ₹1,00,000 capital and 1 INITIAL_CAPITAL ledger entry."""
    response = client.post(
        "/api/auth/register",
        json={"name": "Asha Rao", "email": "asha@example.com", "password": "password123"},
    )
    assert response.status_code == 201
    data = response.json()
    user_id = UUID(data["user"]["id"])

    db = TestingSessionLocal()
    account = db.scalar(select(Account).where(Account.user_id == user_id))

    assert account is not None
    assert account.initial_capital == Decimal("100000.00")
    assert account.cash_balance == Decimal("100000.00")
    assert account.currency == "INR"
    assert account.status == "ACTIVE"

    ledger_entries = db.scalars(select(CashLedger).where(CashLedger.account_id == account.id)).all()
    assert len(ledger_entries) == 1
    entry = ledger_entries[0]
    assert entry.entry_type == "INITIAL_CAPITAL"
    assert entry.amount == Decimal("100000.00")
    assert entry.balance_after == Decimal("100000.00")
    assert entry.idempotency_key == f"INIT_CAPITAL_{user_id}"


def test_login_does_not_grant_additional_capital(client):
    """5 & 6. Logging in and fetching session/account does not grant duplicate capital."""
    client.post(
        "/api/auth/register",
        json={"name": "Bob Smith", "email": "bob@example.com", "password": "password123"},
    )

    # Login
    login_res = client.post(
        "/api/auth/login",
        json={"email": "bob@example.com", "password": "password123"},
    )
    assert login_res.status_code == 200

    # Call /api/account/me
    acc_res = client.get("/api/account/me")
    assert acc_res.status_code == 200
    acc_data = acc_res.json()
    assert Decimal(str(acc_data["cash_balance"])) == Decimal("100000.00")

    # Verify database still has exactly 1 account and 1 ledger entry
    db = TestingSessionLocal()
    user = db.scalar(select(User).where(User.email == "bob@example.com"))
    accounts = db.scalars(select(Account).where(Account.user_id == user.id)).all()
    assert len(accounts) == 1
    ledger = db.scalars(select(CashLedger).where(CashLedger.account_id == accounts[0].id)).all()
    assert len(ledger) == 1


def test_duplicate_registration_rejected(client):
    """7. Duplicate registration retries cannot duplicate accounts or initial capital."""
    res1 = client.post(
        "/api/auth/register",
        json={"name": "Carol Danvers", "email": "carol@example.com", "password": "password123"},
    )
    assert res1.status_code == 201

    res2 = client.post(
        "/api/auth/register",
        json={"name": "Carol Danvers", "email": "carol@example.com", "password": "password123"},
    )
    assert res2.status_code == 409

    db = TestingSessionLocal()
    users = db.scalars(select(User).where(User.email == "carol@example.com")).all()
    assert len(users) == 1
    accounts = db.scalars(select(Account).where(Account.user_id == users[0].id)).all()
    assert len(accounts) == 1


def test_user_data_isolation(client):
    """8. A user cannot access another user's account or ledger."""
    # Register user 1
    c1 = TestClient(app)
    c1.post("/api/auth/register", json={"name": "User One", "email": "u1@example.com", "password": "password123"})
    acc1 = c1.get("/api/account/me").json()

    # Register user 2
    c2 = TestClient(app)
    c2.post("/api/auth/register", json={"name": "User Two", "email": "u2@example.com", "password": "password123"})
    acc2 = c2.get("/api/account/me").json()

    assert acc1["id"] != acc2["id"]
    assert acc1["user_id"] != acc2["user_id"]

    # Verify user 2 ledger only returns user 2's ledger entries
    ledger2 = c2.get("/api/account/ledger").json()
    assert len(ledger2["items"]) == 1
    assert ledger2["items"][0]["account_id"] == acc2["id"]


def test_account_summary_and_ledger_endpoints(client):
    """Verify GET /api/account/me and GET /api/account/ledger responses."""
    client.post(
        "/api/auth/register",
        json={"name": "David Miller", "email": "david@example.com", "password": "password123"},
    )

    me_res = client.get("/api/account/me")
    assert me_res.status_code == 200
    acc = me_res.json()
    assert acc["currency"] == "INR"
    assert acc["initial_capital"] == "100000.00"
    assert acc["cash_balance"] == "100000.00"
    assert acc["status"] == "ACTIVE"

    ledger_res = client.get("/api/account/ledger")
    assert ledger_res.status_code == 200
    ledger = ledger_res.json()
    assert ledger["total"] == 1
    assert ledger["items"][0]["entry_type"] == "INITIAL_CAPITAL"
    assert ledger["items"][0]["amount"] == "100000.00"
    assert ledger["items"][0]["balance_after"] == "100000.00"


def test_list_instruments_endpoint(client):
    """Verify GET /api/instruments endpoint returns seeded NSE stocks."""
    res = client.get("/api/instruments")
    assert res.status_code == 200
    symbols = [inst["symbol"] for inst in res.json()]
    assert "RELIANCE" in symbols
    assert "TCS" in symbols
    assert "HDFCBANK" in symbols


def test_negative_cash_balance_rejected_by_db_constraint():
    """9. Invalid monetary values (negative cash balance) are rejected by database constraint."""
    from sqlalchemy.exc import IntegrityError
    db = TestingSessionLocal()
    user = User(name="Test User", email="negative@example.com", password_hash="hash")
    db.add(user)
    db.flush()

    invalid_account = Account(
        user_id=user.id,
        account_number="TRD-TEST-NEG",
        cash_balance=Decimal("-500.00"),
    )
    db.add(invalid_account)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_logout_and_auth_regressions(client):
    """11. Existing registration, login, logout, and password recovery functionality continues working."""
    reg_res = client.post(
        "/api/auth/register",
        json={"name": "Eva Green", "email": "eva@example.com", "password": "password123"},
    )
    assert reg_res.status_code == 201

    me_res = client.get("/api/auth/me")
    assert me_res.status_code == 200
    assert me_res.json()["user"]["email"] == "eva@example.com"

    logout_res = client.post("/api/auth/logout")
    assert logout_res.status_code == 200

    me_res_after_logout = client.get("/api/auth/me")
    assert me_res_after_logout.status_code == 401


def test_authenticated_paper_order_to_portfolio_end_to_end(client, monkeypatch):
    """A local paper market order is filled, audited, and reflected in account views."""
    from datetime import datetime, timezone
    from decimal import Decimal

    from app.config import settings
    from app.models import Instrument, Order, Trade
    from app.services import market_data as market_data_module
    from app.services import paper_engine as paper_engine_module

    registration = client.post(
        "/api/auth/register",
        json={"name": "Trader Test", "email": "trade-flow@example.com", "password": "password123"},
    )
    assert registration.status_code == 201
    instrument = TestingSessionLocal().scalar(select(Instrument).where(Instrument.symbol == "RELIANCE"))
    monkeypatch.setattr(settings, "demo_market_data_enabled", True)

    quote = {
        "symbol": "RELIANCE", "timestamp": datetime.now(timezone.utc), "last_price": Decimal("100.00"),
        "asks": [{"price": Decimal("100.00"), "quantity": 10}],
        "bids": [{"price": Decimal("99.90"), "quantity": 10}],
    }
    paper_engine_module.paper_engine._quotes["RELIANCE"] = quote

    async def retain_for_test(_symbols):
        return None

    monkeypatch.setattr(market_data_module.market_data, "retain_symbols", retain_for_test)
    payload = {
        "instrument_id": str(instrument.id), "side": "BUY", "product": "CNC", "order_type": "MARKET",
        "quantity": 2, "validity": "DAY", "idempotency_key": "e2e-paper-order-0001",
    }
    first = client.post("/api/orders", json=payload)
    retry = client.post("/api/orders", json=payload)
    assert first.status_code == 201
    assert retry.status_code == 201
    order = first.json()
    assert retry.json()["id"] == order["id"]
    assert order["status"] == "FILLED"
    assert order["filled_quantity"] == 2
    assert client.get(f"/api/orders/{order['id']}/trades").json()[0]["quantity"] == 2
    positions = client.get("/api/portfolio/positions").json()
    assert len(positions) == 1
    assert positions[0]["symbol"] == "RELIANCE"
    assert positions[0]["quantity"] == 2
    assert client.get("/api/portfolio/summary").json()["open_positions"] == 1

    with TestingSessionLocal() as session:
        assert session.scalar(select(func.count(Order.id))) == 1
        assert session.scalar(select(func.count(Trade.id))) == 1


def test_market_websocket_quote_is_json_serializable():
    """Provider Decimal and timestamp values are safely encoded for browser clients."""
    from datetime import datetime, timezone

    from app.services.market_data import MarketDataService

    class FakeSocket:
        messages = []

        async def send_json(self, payload):
            self.messages.append(payload)

    async def publish():
        service = MarketDataService(provider=object())
        client = FakeSocket()
        service._subscriptions[client] = {"RELIANCE"}
        service._instrument_by_key[(1, 123)] = {
            "symbol": "RELIANCE", "exchange": "NSE", "provider_token": 123,
            "provider_exchange_code": 1,
        }
        await service._publish({
            "exchange_code": 1, "token": 123, "last_price": Decimal("123.45"),
            "timestamp": datetime.now(timezone.utc), "exchange_timestamp": None,
            "bids": [{"price": Decimal("123.40"), "quantity": 5}],
            "asks": [{"price": Decimal("123.50"), "quantity": 6}],
        })
        return client.messages

    messages = asyncio.run(publish())
    assert messages[0]["type"] == "quote"
    assert messages[0]["data"]["last_price"] == 123.45
    json.dumps(messages)

