from typing import Literal
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://quantx:quantx_local_only@localhost:5432/quantx"
    jwt_secret: str = ""
    frontend_origin: str = "http://localhost:5173"
    session_cookie_secure: bool = False
    session_cookie_name: str = "quantx_session"
    session_lifetime_days: int = 7
    mail_backend: Literal["console", "smtp"] = "console"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Quantx"
    smtp_starttls: bool = True
    market_data_enabled: bool = False
    demo_market_data_enabled: bool = False
    market_data_username: str = ""
    market_data_password: str = ""
    market_data_api_base_url: str = "https://devapi.021.trade/api/developer-api/v1"
    market_data_ws_base_url: str = "wss://devapi.021.trade/api/developer/websocket/market"
    market_data_default_symbols: str = "RELIANCE,TCS,HDFCBANK,INFY,ICICIBANK,SBIN"
    market_data_sync_on_startup: bool = True
    market_data_max_subscriptions: int = 100
    redis_url: str = ""
    order_reservation_buffer: float = 0.0
    paper_brokerage_per_order: str = "0.00"
    paper_exchange_fee_rate: str = "0.0000325"
    paper_sebi_fee_rate: str = "0.000001"
    paper_gst_rate: str = "0.18"
    paper_stt_delivery_rate: str = "0.001"
    paper_stt_intraday_sell_rate: str = "0.00025"
    paper_stamp_delivery_rate: str = "0.00015"
    paper_stamp_intraday_rate: str = "0.00003"
    paper_stress_spread_percent: str = "0.005"
    paper_stress_liquidity_factor: str = "0.5"
    market_quote_max_age_seconds: int = 120
    marketaux_api_token: str = ""
    marketaux_base_url: str = "https://api.marketaux.com/v1/news/all"
    marketaux_max_limit: int = 3
    marketaux_cache_ttl_seconds: int = 900
    marketaux_stale_ttl_seconds: int = 86400
    marketaux_timeout_seconds: float = 20.0
    marketaux_nse_symbol_suffix: str = ".NS"
    # IndianAPI (stock.indianapi.in) reference data: daily history, movers, company profile.
    indian_api_key: str = ""
    indian_api_base_url: str = "https://stock.indianapi.in"
    indian_api_timeout_seconds: float = 20.0
    indian_api_history_ttl_seconds: int = 21600
    indian_api_profile_ttl_seconds: int = 3600
    indian_api_lists_ttl_seconds: int = 300
    indian_api_stale_ttl_seconds: int = 604800

    # 021 Trade Hackathon Sponsor API Configuration
    trade_021_ucc: str = ""
    trade_021_password: str = ""
    trade_021_base_url: str = "https://devapi.021.trade/api/developer-api/v1"
    trade_021_ws_market_url: str = "wss://devapi.021.trade/api/developer/websocket/market"

    model_config = SettingsConfigDict(
        env_file=(Path(__file__).resolve().parents[2] / ".env", Path(__file__).resolve().parents[1] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
