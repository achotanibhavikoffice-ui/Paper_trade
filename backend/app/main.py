# Quantx FastAPI Application Entrypoint
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
import asyncio
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import Account, CashLedger, Instrument, Order, OrderEvent, PasswordResetToken, PortfolioSafePoint, Position, ScenarioRun, Trade, TradeCharge, User  # noqa: F401
from app.routes.account import router as account_router
from app.routes.auth import router as auth_router
from app.routes.news import router as news_router
from app.routes.what_if import router as what_if_router
from app.routes.market_insights import router as market_insights_router
from app.routes.recovery import router as recovery_router
from app.routes.trading import router as trading_router
from app.services.market_data import market_data
from app.services.paper_engine import paper_engine
from app.services.provider import provider_client

logger = logging.getLogger("quantx.startup")


def seed_instruments_if_empty() -> None:
    with SessionLocal() as db:
        if db.get_bind().dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(740219021, 1)"))
        count = db.scalar(select(func.count(Instrument.id))) or 0
        if count == 0:
            seed_data = [
                {"symbol": "RELIANCE", "name": "Reliance Industries Limited", "exchange": "NSE", "sector": "Energy"},
                {"symbol": "TCS", "name": "Tata Consultancy Services Limited", "exchange": "NSE", "sector": "Information Technology"},
                {"symbol": "HDFCBANK", "name": "HDFC Bank Limited", "exchange": "NSE", "sector": "Financial Services"},
                {"symbol": "INFY", "name": "Infosys Limited", "exchange": "NSE", "sector": "Information Technology"},
                {"symbol": "ICICIBANK", "name": "ICICI Bank Limited", "exchange": "NSE", "sector": "Financial Services"},
                {"symbol": "BHARTIARTL", "name": "Bharti Airtel Limited", "exchange": "NSE", "sector": "Telecommunication"},
                {"symbol": "SBIN", "name": "State Bank of India", "exchange": "NSE", "sector": "Financial Services"},
                {"symbol": "LTIM", "name": "LTIMindtree Limited", "exchange": "NSE", "sector": "Information Technology"},
                {"symbol": "TRENT", "name": "Trent Limited", "exchange": "NSE", "sector": "Consumer Discretionary"},
                {"symbol": "BAJFINANCE", "name": "Bajaj Finance Limited", "exchange": "NSE", "sector": "Financial Services"},
            ]
            for item in seed_data:
                db.add(
                    Instrument(
                        symbol=item["symbol"],
                        name=item["name"],
                        exchange=item["exchange"],
                        instrument_type="EQUITY",
                        sector=item["sector"],
                        is_tradable=True,
                        lot_size=1,
                    )
                )
            db.commit()


def migrate_trading_schema() -> None:
    """Apply additive migrations for databases initialized before the live-data milestone."""
    statements = [
        "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS reserved_cash NUMERIC(14,2) NOT NULL DEFAULT 0.00",
        "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS stress_mode BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS provider_token INTEGER NULL",
        "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS provider_exchange VARCHAR(10) NULL",
        "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS provider_exchange_code INTEGER NULL",
        "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS board_lot_quantity INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS freeze_quantity INTEGER NULL",
        "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS tick_size_paise INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS lower_circuit_paise INTEGER NULL",
        "ALTER TABLE instruments ADD COLUMN IF NOT EXISTS upper_circuit_paise INTEGER NULL",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS validity VARCHAR(8) NOT NULL DEFAULT 'DAY'",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS reserved_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS triggered_at TIMESTAMPTZ NULL",
        "CREATE TABLE IF NOT EXISTS trades (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE, instrument_id UUID NOT NULL REFERENCES instruments(id), sequence INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK (quantity > 0), price NUMERIC(14,2) NOT NULL CHECK (price > 0), side VARCHAR(4) NOT NULL, product VARCHAR(5) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT uq_trades_order_sequence UNIQUE (order_id, sequence))",
        "CREATE INDEX IF NOT EXISTS ix_trades_account_id ON trades(account_id)",
        "CREATE INDEX IF NOT EXISTS ix_trades_order_id ON trades(order_id)",
        "CREATE INDEX IF NOT EXISTS ix_trades_instrument_id ON trades(instrument_id)",
        "CREATE INDEX IF NOT EXISTS ix_trades_created_at ON trades(created_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_instruments_provider_token ON instruments(provider_token)",
        "CREATE TABLE IF NOT EXISTS trade_charges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), trade_id UUID NOT NULL UNIQUE REFERENCES trades(id) ON DELETE CASCADE, brokerage NUMERIC(14,2) NOT NULL DEFAULT 0, exchange_fee NUMERIC(14,2) NOT NULL DEFAULT 0, sebi_fee NUMERIC(14,2) NOT NULL DEFAULT 0, stt NUMERIC(14,2) NOT NULL DEFAULT 0, stamp_duty NUMERIC(14,2) NOT NULL DEFAULT 0, gst NUMERIC(14,2) NOT NULL DEFAULT 0, total NUMERIC(14,2) NOT NULL DEFAULT 0)",
        "CREATE INDEX IF NOT EXISTS ix_trade_charges_trade_id ON trade_charges(trade_id)",
        "CREATE TABLE IF NOT EXISTS order_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE, account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, event_type VARCHAR(30) NOT NULL, status VARCHAR(20) NOT NULL, details JSON NOT NULL DEFAULT '{}'::json, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS ix_order_events_order_id ON order_events(order_id)",
        "CREATE INDEX IF NOT EXISTS ix_order_events_account_id ON order_events(account_id)",
        "CREATE INDEX IF NOT EXISTS ix_order_events_created_at ON order_events(created_at DESC)",
        "CREATE TABLE IF NOT EXISTS scenario_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, name VARCHAR(80) NOT NULL, shocks JSON NOT NULL, result JSON NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS ix_scenario_runs_account_id ON scenario_runs(account_id)",
        "CREATE INDEX IF NOT EXISTS ix_scenario_runs_created_at ON scenario_runs(created_at DESC)",
        "CREATE TABLE IF NOT EXISTS portfolio_safepoints (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, name VARCHAR(100) NOT NULL, trigger_type VARCHAR(30) NOT NULL DEFAULT 'MANUAL', cash_balance NUMERIC(14,2) NOT NULL, reserved_cash NUMERIC(14,2) NOT NULL DEFAULT 0.00, total_portfolio_value NUMERIC(14,2) NOT NULL DEFAULT 0.00, positions_snapshot JSON NOT NULL DEFAULT '[]'::json, open_orders_snapshot JSON NOT NULL DEFAULT '[]'::json, note VARCHAR(255) NULL, is_restored BOOLEAN NOT NULL DEFAULT FALSE, restored_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
        "CREATE INDEX IF NOT EXISTS ix_portfolio_safepoints_account_id ON portfolio_safepoints(account_id)",
        "CREATE INDEX IF NOT EXISTS ix_portfolio_safepoints_created_at ON portfolio_safepoints(created_at DESC)",
    ]
    with engine.begin() as connection:
        if connection.dialect.name == "postgresql":
            # Serialize additive DDL when multiple API processes start together.
            connection.execute(text("SELECT pg_advisory_xact_lock(740219021, 1)"))
        for statement in statements:
            connection.execute(text(statement))


def create_development_schema() -> None:
    with engine.begin() as connection:
        if connection.dialect.name == "postgresql":
            connection.execute(text("SELECT pg_advisory_xact_lock(740219021, 1)"))
        Base.metadata.create_all(bind=connection)


def instrument_sync_is_current() -> bool:
    with SessionLocal() as db:
        latest = db.scalar(select(func.max(Instrument.updated_at)).where(Instrument.provider_token.is_not(None)))
    if latest is None:
        return False
    if latest.tzinfo is None:
        latest = latest.replace(tzinfo=timezone.utc)
    ist = ZoneInfo("Asia/Kolkata")
    return latest.astimezone(ist).date() == datetime.now(ist).date()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    if len(settings.jwt_secret) < 32 or "replace-with" in settings.jwt_secret:
        raise RuntimeError("Set JWT_SECRET to a unique random value of at least 32 characters.")
    if settings.app_env == "production":
        if settings.demo_market_data_enabled:
            raise RuntimeError("Set DEMO_MARKET_DATA_ENABLED=false in production.")
        if "quantx-local" in settings.jwt_secret.lower() or "change-this-before-production" in settings.jwt_secret.lower():
            raise RuntimeError("Replace the local-development JWT secret with a unique production secret.")
        if settings.session_cookie_secure is not True:
            raise RuntimeError("Set SESSION_COOKIE_SECURE=true in production so session cookies require HTTPS.")
        if not settings.frontend_origin.startswith("https://"):
            raise RuntimeError("Set FRONTEND_ORIGIN to the HTTPS address of the production frontend.")
        if not settings.database_url.startswith(("postgresql://", "postgresql+psycopg://")):
            raise RuntimeError("Production must use PostgreSQL through DATABASE_URL.")
        if "quantx_local_only" in settings.database_url:
            raise RuntimeError("Replace the local Docker database password before production.")
        if settings.mail_backend != "smtp":
            raise RuntimeError("Set MAIL_BACKEND=smtp in production so password-reset links are delivered privately.")
        if not settings.smtp_host or not settings.smtp_from_email:
            raise RuntimeError("Configure SMTP_HOST and SMTP_FROM_EMAIL before starting in production.")
        if not settings.smtp_starttls:
            raise RuntimeError("Set SMTP_STARTTLS=true so reset emails are sent over an encrypted connection.")
        if bool(settings.smtp_username) != bool(settings.smtp_password):
            raise RuntimeError("Configure both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty.")
        if settings.market_data_enabled and not (settings.market_data_username and settings.market_data_password):
            raise RuntimeError("Set MARKET_DATA_USERNAME and MARKET_DATA_PASSWORD when market data is enabled.")
    if settings.app_env == "development":
        create_development_schema()
        seed_instruments_if_empty()
    if settings.app_env != "test":
        migrate_trading_schema()

    async def operations_supervisor() -> None:
        """Keep one process responsible for the provider session and MIS square-off."""
        ist = ZoneInfo("Asia/Kolkata")
        connection = None
        market_started = False
        next_reconcile = 0.0
        while True:
            try:
                if connection is None:
                    candidate = engine.connect()
                    if candidate.dialect.name == "postgresql":
                        elected = candidate.execute(text("SELECT pg_try_advisory_lock(740219021, 2)")).scalar()
                        if not elected:
                            candidate.close()
                            await asyncio.sleep(5)
                            continue
                    connection = candidate
                    logger.info("This process owns the Quantx market-feed and square-off worker lease")
                else:
                    connection.execute(text("SELECT 1")).scalar()
                if not market_started:
                    market_data.on_quote = lambda quote: asyncio.to_thread(paper_engine.remember_quote, quote)
                    if market_data.provider.configured or settings.demo_market_data_enabled:
                        try:
                            if market_data.provider.configured and settings.market_data_sync_on_startup and not instrument_sync_is_current():
                                synced = await provider_client.sync_instruments()
                                logger.info("Synchronized %s instruments from 021", synced)
                            await market_data.start()
                            market_started = True
                        except Exception:
                            logger.exception("Market-data startup failed; account APIs remain available")
                    elif settings.market_data_enabled:
                        logger.error("MARKET_DATA_ENABLED is true but MARKET_DATA_USERNAME/PASSWORD are missing")
                    market_started = True
                monotonic = asyncio.get_running_loop().time()
                if monotonic >= next_reconcile:
                    await market_data.reconcile_retained_symbols()
                    next_reconcile = monotonic + 30
                now = datetime.now(ist)
                if now.weekday() < 5 and (now.hour, now.minute) >= (15, 20):
                    count = await asyncio.to_thread(paper_engine.square_off_mis_positions)
                    if count:
                        logger.info("Submitted %s MIS auto square-off orders", count)
                await asyncio.sleep(10)
            except asyncio.CancelledError:
                if connection is not None:
                    connection.close()
                raise
            except Exception:
                logger.exception("Operations worker failed; releasing its lease before retry")
                if market_started:
                    await market_data.stop()
                    market_started = False
                if connection is not None:
                    connection.close()
                    connection = None
                await asyncio.sleep(5)

    operations_task = None
    if settings.app_env != "test":
        operations_task = asyncio.create_task(operations_supervisor(), name="quantx-operations-supervisor")
    yield
    if operations_task:
        operations_task.cancel()
        await asyncio.gather(operations_task, return_exceptions=True)
    await market_data.stop()
    await provider_client.close()
    engine.dispose()


app = FastAPI(title="Quantx API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)
app.include_router(auth_router)
app.include_router(account_router)
app.include_router(trading_router)
app.include_router(news_router)
app.include_router(what_if_router)
app.include_router(market_insights_router)
app.include_router(recovery_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}


@app.get("/api/health/ready")
def readiness() -> dict[str, str | bool]:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    configured = market_data.provider.configured or settings.demo_market_data_enabled
    connected = market_data.connected
    return {
        "status": "ready" if not settings.market_data_enabled or connected else "degraded",
        "database": "connected",
        "market_data_configured": configured,
        "market_data_connected": connected,
    }

