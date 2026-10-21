from __future__ import annotations

import asyncio
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert

from app.config import settings
from app.database import SessionLocal
from app.models import Instrument


class ProviderError(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


EXCHANGES = {
    "NSECM": ("NSE", 1, "EQUITY"), "NSEFO": ("NSEFO", 2, "DERIVATIVE"),
    "NSEIDX": ("NSE", 3, "INDEX"), "BSEEQ": ("BSE", 4, "EQUITY"),
    "BSEEQD": ("BSEFO", 5, "DERIVATIVE"), "BSEIDX": ("BSE", 6, "INDEX"),
}
REQUEST_EXCHANGE = {"NSECM": "NSE", "NSEFO": "NSEFO", "NSEIDX": "NSE", "BSEEQ": "BSE", "BSEEQD": "BSEFO", "BSEIDX": "BSE"}


class ProviderClient:
    """Single-process 021 market-data client. Never exposes credentials to callers."""

    def __init__(self) -> None:
        self.base_url = settings.market_data_api_base_url.rstrip("/")
        self._http = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=8.0))
        self._lock = asyncio.Lock()
        self._access_token: str | None = None
        self._access_expires_at: datetime | None = None
        self._ephemeral_key: str | None = None
        self._ephemeral_expires_at: datetime | None = None

    @property
    def configured(self) -> bool:
        user = settings.market_data_username or settings.trade_021_ucc
        pwd = settings.market_data_password or settings.trade_021_password
        return bool(settings.market_data_enabled and user and pwd)

    async def close(self) -> None:
        await self._http.aclose()

    async def _login_locked(self, force: bool = False) -> str:
        now = datetime.now(timezone.utc)
        if not force and self._access_token and self._access_expires_at and self._access_expires_at > now + timedelta(seconds=90):
            return self._access_token
        user = settings.market_data_username or settings.trade_021_ucc
        pwd = settings.market_data_password or settings.trade_021_password
        try:
            response = await self._http.post(
                f"{self.base_url}/auth/token",
                json={"username": user, "password": pwd},
            )
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise ProviderError("Could not authenticate to the 021 market-data API.") from exc
        token = (payload.get("data") or {}).get("accessToken") if isinstance(payload, dict) else None
        if response.status_code >= 400 or not token:
            reason = payload.get("error") if isinstance(payload, dict) else None
            raise ProviderError(f"021 market-data authentication failed: {reason or 'check UCC/password and account status'}", response.status_code)
        expires_at = (payload.get("data") or {}).get("expiresAt")
        try:
            self._access_expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00")) if expires_at else now + timedelta(hours=12)
        except (AttributeError, ValueError):
            self._access_expires_at = now + timedelta(hours=12)
        self._access_token = str(token)
        self._ephemeral_key = None
        self._ephemeral_expires_at = None
        return self._access_token

    async def access_token(self, force: bool = False) -> str:
        async with self._lock:
            return await self._login_locked(force)

    async def request(self, method: str, path: str, *, retry_auth: bool = True, **kwargs: Any) -> httpx.Response:
        token = await self.access_token()
        try:
            response = await self._http.request(method, f"{self.base_url}/{path.lstrip('/')}", headers={"Authorization": f"Bearer {token}"}, **kwargs)
            if response.status_code == 401 and retry_auth:
                token = await self.access_token(force=True)
                response = await self._http.request(method, f"{self.base_url}/{path.lstrip('/')}", headers={"Authorization": f"Bearer {token}"}, **kwargs)
        except httpx.HTTPError as exc:
            raise ProviderError("The 021 market-data API could not be reached.") from exc
        return response

    async def ephemeral_key(self, force: bool = False) -> str:
        now = datetime.now(timezone.utc)
        async with self._lock:
            if not force and self._ephemeral_key and self._ephemeral_expires_at and self._ephemeral_expires_at > now + timedelta(minutes=5):
                return self._ephemeral_key
        response = await self.request("GET", "/websocket/ephemeral-key")
        try:
            payload = response.json()
        except ValueError as exc:
            raise ProviderError("021 returned an unreadable ephemeral-key response.") from exc
        key = (payload.get("data") or {}).get("token") if isinstance(payload, dict) else None
        if response.status_code >= 400 or not key:
            raise ProviderError("Could not get a fresh 021 WebSocket key.", response.status_code)
        async with self._lock:
            self._ephemeral_key = str(key)
            self._ephemeral_expires_at = now + timedelta(hours=23, minutes=50)
        return str(key)

    async def download_instruments(self) -> str:
        response = await self.request("GET", "/instruments")
        if response.status_code >= 400:
            raise ProviderError(f"Instrument download failed with HTTP {response.status_code}.", response.status_code)
        try:
            return response.content.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ProviderError("The instrument CSV was not valid UTF-8.") from exc

    async def sync_instruments(self) -> int:
        text = await self.download_instruments()
        reader = csv.DictReader(io.StringIO(text))
        columns = {str(c).strip().lower(): c for c in (reader.fieldnames or [])}
        required = {"token", "exchange", "symbol"}
        if not required.issubset(columns):
            raise ProviderError("Instrument CSV is missing token, exchange, or symbol columns.")
        rows: list[dict[str, Any]] = []
        name_key = next((columns[k] for k in ("company_name", "companyname", "name", "desc", "description", "security_name", "instrument_name") if k in columns), None)
        for raw in reader:
            segment = str(raw.get(columns["exchange"], "")).strip().upper()
            mapping = EXCHANGES.get(segment)
            if not mapping:
                continue
            app_exchange, exchange_code, kind = mapping
            symbol = str(raw.get(columns["symbol"], "")).strip()
            try:
                token = int(raw[columns["token"]])
            except (TypeError, ValueError):
                continue
            if not symbol:
                continue
            display_name = str(raw.get(name_key, "")).strip() if name_key else symbol
            if not display_name:
                display_name = symbol

            def integer(name: str, default: int | None = None) -> int | None:
                col = columns.get(name)
                try:
                    return int(float(raw[col])) if col and raw.get(col) not in (None, "") else default
                except (ValueError, TypeError):
                    return default
            lot = integer("board_lot_quantity", 1) or 1
            rows.append({
                "symbol": symbol[:30], "name": display_name[:120], "exchange": app_exchange,
                # PS-05 covers NSE cash equities; retain other segments in the catalogue, but do not enable their orders.
                "instrument_type": kind, "sector": None, "is_tradable": segment == "NSECM",
                "lot_size": lot, "provider_token": token, "provider_exchange": segment,
                "provider_exchange_code": exchange_code, "board_lot_quantity": lot,
                "freeze_quantity": integer("freeze_quantity"), "tick_size_paise": max(integer("ticksize", 1) or 1, 1),
                "lower_circuit_paise": integer("lower_circuit"), "upper_circuit_paise": integer("upper_circuit"),
                "updated_at": datetime.now(timezone.utc),
            })
        if not rows:
            raise ProviderError("The instrument CSV contained no recognized instruments.")
        # A provider CSV can repeat the same listing; Postgres cannot update one conflict key twice in one batch.
        unique_rows: dict[tuple[str, str], dict[str, Any]] = {}
        for row in rows:
            unique_rows[(row["exchange"], row["symbol"])] = row
        rows = list(unique_rows.values())
        return await asyncio.to_thread(self._upsert_instruments, rows)

    @staticmethod
    def _upsert_instruments(rows: list[dict[str, Any]]) -> int:
        count = 0
        with SessionLocal() as db:
            db.execute(update(Instrument).where(Instrument.provider_token.is_not(None)).values(is_tradable=False))
            for offset in range(0, len(rows), 1000):
                batch = rows[offset:offset + 1000]
                statement = insert(Instrument).values(batch).on_conflict_do_update(
                    index_elements=[Instrument.exchange, Instrument.symbol],
                    set_={key: getattr(insert(Instrument).excluded, key) for key in batch[0] if key not in {"symbol", "exchange"}},
                )
                db.execute(statement)
                count += len(batch)
            db.commit()
        return count


provider_client = ProviderClient()
