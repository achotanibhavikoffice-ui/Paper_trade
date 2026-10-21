from __future__ import annotations

import asyncio
import json
import logging
import random
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, Optional
import os
from urllib.parse import urlencode

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from websockets.asyncio.client import connect

from app.config import settings
from app.database import SessionLocal
from app.models import Instrument, Order, Position
from app.services.provider import ProviderClient, provider_client

logger = logging.getLogger(__name__)
log = logging.getLogger("quantx.market")


def _u(data: bytes, offset: int, size: int) -> int:
    return int.from_bytes(data[offset:offset + size], "big", signed=False)


def _price(paise: int) -> Decimal:
    return (Decimal(paise) / Decimal(100)).quantize(Decimal("0.01"))


def decode_market_frame(frame: bytes) -> list[dict[str, Any]]:
    """Decode 021 market TC=1 LTP and TC=3 full packets (network byte order)."""
    updates: list[dict[str, Any]] = []
    cursor = 0
    full_sizes = {1: 220, 2: 234, 3: 36, 4: 262, 5: 262, 6: 262}
    while cursor + 2 <= len(frame):
        code = _u(frame, cursor, 2)
        if code == 10:  # provider heartbeat packet [0x00, 0x0A]
            cursor += 2
            continue
        if code == 1:
            if cursor + 12 > len(frame):
                break
            exch = _u(frame, cursor + 2, 2)
            token = _u(frame, cursor + 4, 4)
            last = _u(frame, cursor + 8, 4)
            updates.append({"exchange_code": exch, "token": token, "last_price": _price(last), "timestamp": datetime.now(timezone.utc), "exchange_timestamp": None, "bids": [], "asks": []})
            cursor += 12
            continue
        if code == 3:
            if cursor + 4 > len(frame):
                break
            exch = _u(frame, cursor + 2, 2)
            packet_size = full_sizes.get(exch)
            if not packet_size or cursor + packet_size > len(frame):
                break
            packet = frame[cursor:cursor + packet_size]
            # NSEFO packets contain a 2-byte packet id before their 4-byte token.
            base = 6 if exch == 2 else 4
            token = _u(packet, base, 4)
            if exch in (1, 4, 5, 6):
                last, close, open_, high, low = (_u(packet, n, 4) for n in (base + 4, base + 40, base + 44, base + 48, base + 52))
                volume = _u(packet, base + 16, 8)
                depth_at, level_size, qty_size, orders_size = base + 60, 14 if exch == 1 else 16, 8, 2 if exch == 1 else 4
                oi_offset = 0
            elif exch == 2:
                last, close, open_, high, low = (_u(packet, n, 4) for n in (base + 4, base + 40, base + 44, base + 48, base + 52))
                volume = _u(packet, base + 16, 8)
                depth_at, level_size, qty_size, orders_size = base + 60, 14, 8, 2
                oi_offset = base + 200
            else:  # NSE index
                last, close, open_, high, low = (_u(packet, n, 4) for n in (base + 4, base + 8, base + 12, base + 16, base + 20))
                volume, depth_at, level_size, qty_size, orders_size, oi_offset = 0, 0, 0, 0, 0, 0
            exchange_time_offsets = {1: 216, 2: 230, 3: 28, 4: 244, 5: 244, 6: 244}
            exchange_seconds = _u(packet, exchange_time_offsets[exch], 4)
            exchange_timestamp = (datetime.fromtimestamp(exchange_seconds + 315513000, timezone.utc)
                                  if exchange_seconds else None)
            bids: list[dict[str, Any]] = []
            asks: list[dict[str, Any]] = []
            if depth_at:
                for i in range(10):
                    at = depth_at + i * level_size
                    qty = _u(packet, at, qty_size)
                    px = _u(packet, at + qty_size, 4)
                    orders = _u(packet, at + qty_size + 4, orders_size)
                    level = {"quantity": qty, "price": _price(px), "orders": orders}
                    (bids if i < 5 else asks).append(level)
            updates.append({
                "exchange_code": exch, "token": token, "last_price": _price(last),
                "previous_close": _price(close) if close else None,
                "open": _price(open_) if open_ else None, "high": _price(high) if high else None,
                "low": _price(low) if low else None, "volume": volume,
                "open_interest": _u(packet, oi_offset, 8) if oi_offset else None,
                "bids": bids, "asks": asks, "timestamp": exchange_timestamp or datetime.now(timezone.utc),
                "exchange_timestamp": exchange_timestamp,
            })
            cursor += packet_size
            continue
        # Unknown transaction code: discard this frame instead of guessing packet boundaries.
        log.warning("Ignoring unsupported market transaction code %s", code)
        break
    return updates


class MarketDataService:
    def __init__(self, provider: ProviderClient = provider_client) -> None:
        self.provider = provider
        self.quotes: dict[str, dict[str, Any]] = {}
        self._signatures: dict[str, tuple[Any, ...]] = {}
        self._instrument_by_key: dict[tuple[int, int], dict[str, Any]] = {}
        self._provider_active: set[tuple[int, int]] = set()
        self._default_symbols: set[str] = set()
        self._retained_symbols: set[str] = set()
        self._subscriptions: dict[WebSocket, set[str]] = {}
        self._sub_lock = asyncio.Lock()
        self._provider_socket: Any = None
        self._task: asyncio.Task[None] | None = None
        self._demo_task: asyncio.Task[None] | None = None
        self._demo_states: dict[str, dict[str, Decimal | int]] = {}
        self._match_task: asyncio.Task[None] | None = None
        self._match_queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=10000)
        self._stopping = False
        self.on_quote = None
        self._redis = None

    @property
    def subscription_limit(self) -> int:
        return min(max(settings.market_data_max_subscriptions, 1), 100)

    @property
    def connected(self) -> bool:
        return self._provider_socket is not None or (self._demo_task is not None and not self._demo_task.done())

    @property
    def mode(self) -> str:
        sources = {quote.get("data_source") for quote in self.quotes.values()}
        has_demo = "demo" in sources
        has_021 = "021" in sources
        if has_demo and has_021:
            return "hybrid"
        if has_021 or not settings.demo_market_data_enabled:
            return "full"
        return "demo"

    async def start(self) -> None:
        if not self.provider.configured and not settings.demo_market_data_enabled:
            return
        self._stopping = False
        if settings.redis_url:
            try:
                from redis.asyncio import Redis
                self._redis = Redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=2)
                await self._redis.ping()
            except Exception:
                self._redis = None
                log.exception("Redis unavailable; in-process quote cache is active")
        defaults = [name.strip().upper() for name in settings.market_data_default_symbols.split(",") if name.strip()]
        try:
            active_names = await asyncio.to_thread(self._active_order_symbols)
        except Exception:
            log.exception("Could not restore subscriptions for existing paper positions/orders")
            active_names = []
        names = list(dict.fromkeys(active_names + defaults))[:self.subscription_limit]
        self._retained_symbols = set(active_names)
        self._default_symbols = set(defaults)
        if names:
            try:
                instruments = await asyncio.to_thread(self._find_instruments, names)
                if instruments and self.provider.configured:
                    await self._set_provider_subscriptions(instruments, task="subscribe")
            except Exception:
                log.exception("Could not prepare default market subscriptions")
        if self._redis:
            try:
                for symbol in self._default_symbols:
                    cached = await self._redis.get(f"quantx:quote:{symbol}")
                    if cached:
                        self.quotes[symbol] = json.loads(cached)
            except Exception:
                log.exception("Could not restore cached market quote snapshots")
        if self.on_quote:
            self._match_task = asyncio.create_task(self._match_worker(), name="quantx-paper-match-queue")
        if settings.demo_market_data_enabled:
            self._demo_task = asyncio.create_task(self._run_demo(), name="quantx-demo-market-feed")
        if self.provider.configured:
            self._task = asyncio.create_task(self._run(), name="021-market-feed")

    async def stop(self) -> None:
        self._stopping = True
        if self._provider_socket:
            await self._provider_socket.close()
        if self._task:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
            self._task = None
        if self._demo_task:
            self._demo_task.cancel()
            await asyncio.gather(self._demo_task, return_exceptions=True)
            self._demo_task = None
        if self._match_task:
            try:
                await asyncio.wait_for(self._match_queue.join(), timeout=5)
            except asyncio.TimeoutError:
                log.warning("Timed out draining the paper-match quote queue")
            self._match_task.cancel()
            await asyncio.gather(self._match_task, return_exceptions=True)
        if self._redis:
            await self._redis.aclose()

    @staticmethod
    def _find_instruments(symbols: list[str]) -> list[dict[str, Any]]:
        with SessionLocal() as db:
            found = db.scalars(select(Instrument).where(Instrument.symbol.in_(symbols), Instrument.is_tradable.is_(True))).all()
            return [{"id": str(row.id), "symbol": row.symbol, "provider_token": row.provider_token, "provider_exchange": row.provider_exchange, "provider_exchange_code": row.provider_exchange_code, "exchange": row.exchange} for row in found]

    @staticmethod
    def _active_order_symbols() -> list[str]:
        with SessionLocal() as db:
            rows = db.scalars(select(Instrument.symbol).join(Order, Order.instrument_id == Instrument.id)
                              .where(Order.status.in_(("OPEN", "PENDING", "PARTIALLY_FILLED")))
                              .distinct()).all()
            held = db.scalars(select(Instrument.symbol).join(Position, Position.instrument_id == Instrument.id)
                              .where(Position.quantity != 0).distinct()).all()
            return list(dict.fromkeys([*held, *rows]))

    async def subscribe(self, websocket: WebSocket, symbols: list[str]) -> list[dict[str, Any]]:
        names = list(dict.fromkeys(s.strip().upper() for s in symbols if s.strip()))
        if not names or len(names) > self.subscription_limit:
            raise ValueError(f"Subscribe to between 1 and {self.subscription_limit} symbols at a time.")
        instruments = await asyncio.to_thread(self._find_instruments, names)
        found = {item["symbol"] for item in instruments}
        missing = set(names) - found
        if missing:
            raise ValueError(f"Unknown or non-tradable symbols: {', '.join(sorted(missing))}.")
        old = self._subscriptions.get(websocket, set())
        new_names = set(names) - old
        provider_instruments = [i for i in instruments if i["provider_token"] is not None and i["provider_exchange_code"] is not None]
        if not settings.demo_market_data_enabled and not provider_instruments:
            raise ValueError("No provider instrument mapping is available for these symbols.")
        if len(self._provider_active | {(i["provider_exchange_code"], i["provider_token"]) for i in provider_instruments if i["symbol"] in new_names}) > self.subscription_limit:
            raise ValueError(f"The shared 021 feed allows {self.subscription_limit} active instruments.")
        old = self._subscriptions.setdefault(websocket, set())
        old.update(names)
        await self._set_provider_subscriptions([item for item in provider_instruments if item["symbol"] in new_names], task="subscribe")
        return [self.quotes[name] for name in names if name in self.quotes]

    async def unsubscribe(self, websocket: WebSocket, symbols: list[str]) -> None:
        remove = {s.strip().upper() for s in symbols if s.strip()}
        old = self._subscriptions.get(websocket, set())
        old.difference_update(remove)
        active = set().union(*self._subscriptions.values()) if self._subscriptions else set()
        released = remove - active - self._default_symbols - self._retained_symbols
        instruments = await asyncio.to_thread(self._find_instruments, list(released)) if released else []
        await self._set_provider_subscriptions(instruments, task="unsubscribe")

    async def remove_client(self, websocket: WebSocket) -> None:
        names = self._subscriptions.pop(websocket, set())
        active = set().union(*self._subscriptions.values()) if self._subscriptions else set()
        released = names - active - self._default_symbols - self._retained_symbols
        if released:
            instruments = await asyncio.to_thread(self._find_instruments, list(released))
            await self._set_provider_subscriptions(instruments, task="unsubscribe")

    async def retain_symbols(self, symbols: list[str]) -> None:
        """Keep symbols with open orders or positions subscribed after a browser disconnects."""
        names = list(dict.fromkeys(symbol.strip().upper() for symbol in symbols if symbol.strip()))
        if not names:
            return
        try:
            instruments = await asyncio.to_thread(self._find_instruments, names)
            await self._set_provider_subscriptions(instruments, task="subscribe")
            self._retained_symbols.update(item["symbol"] for item in instruments)
        except Exception:
            log.exception("Could not retain an active instrument for market updates")

    async def reconcile_retained_symbols(self) -> None:
        """Refresh internal subscriptions as orders and positions open or close."""
        try:
            active_names = await asyncio.to_thread(self._active_order_symbols)
        except Exception:
            log.exception("Could not reconcile internal active-order market subscriptions")
            return
        wanted = set(active_names)
        additions = wanted - self._retained_symbols
        removals = self._retained_symbols - wanted - self._default_symbols
        if additions:
            await self.retain_symbols(list(additions))
        if removals:
            clients = set().union(*self._subscriptions.values()) if self._subscriptions else set()
            released = removals - clients
            if released:
                instruments = await asyncio.to_thread(self._find_instruments, list(released))
                await self._set_provider_subscriptions(instruments, task="unsubscribe")
            self._retained_symbols.difference_update(removals)

    async def _set_provider_subscriptions(self, instruments: list[dict[str, Any]], *, task: str) -> None:
        if not instruments:
            return
        async with self._sub_lock:
            filtered: list[dict[str, Any]] = []
            for inst in instruments:
                if inst.get("provider_token") is None or inst.get("provider_exchange_code") is None:
                    continue
                key = (int(inst["provider_exchange_code"]), int(inst["provider_token"]))
                self._instrument_by_key[key] = inst
                if task == "subscribe" and key not in self._provider_active:
                    filtered.append(inst)
                if task == "unsubscribe" and key in self._provider_active:
                    filtered.append(inst)
            if task == "subscribe":
                keys = {(int(i["provider_exchange_code"]), int(i["provider_token"])) for i in filtered}
                if len(self._provider_active | keys) > self.subscription_limit:
                    raise ValueError(f"The shared 021 feed allows {self.subscription_limit} active instruments.")
                self._provider_active.update(keys)
            else:
                self._provider_active.difference_update((int(i["provider_exchange_code"]), int(i["provider_token"])) for i in filtered)
            if not filtered:
                return
            ws = self._provider_socket
            if ws is not None:
                payload = {"Task": task, "Mode": "full", "Instruments": [[int(i["provider_exchange_code"]), int(i["provider_token"])] for i in filtered]}
                try:
                    await ws.send(json.dumps(payload, separators=(",", ":")))
                except Exception:
                    self._provider_socket = None

    async def _run(self) -> None:
        delay = 1
        while not self._stopping:
            try:
                key = await self.provider.ephemeral_key(force=True)
                url = f"{settings.market_data_ws_base_url}?{urlencode({'token': key})}"
                async with connect(url, ping_interval=20, ping_timeout=30, close_timeout=5, max_size=2_000_000) as ws:
                    delay = 1
                    async with self._sub_lock:
                        self._provider_socket = ws
                        instruments = [self._instrument_by_key[key] for key in self._provider_active if key in self._instrument_by_key]
                        if instruments:
                            await ws.send(json.dumps({"Task": "subscribe", "Mode": "full", "Instruments": [[i["provider_exchange_code"], i["provider_token"]] for i in instruments]}, separators=(",", ":")))
                    async for frame in ws:
                        if isinstance(frame, str):
                            log.warning("Ignoring unexpected text frame from market socket")
                            continue
                        for quote in decode_market_frame(frame):
                            await self._publish(quote)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                log.warning("Market feed disconnected (%s); reconnecting in %ss", type(exc).__name__, delay)
            finally:
                self._provider_socket = None
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)

    async def _run_demo(self) -> None:
        anchors = {
            "RELIANCE": 1320, "TCS": 3250, "HDFCBANK": 1775, "INFY": 1450,
            "ICICIBANK": 1320, "BHARTIARTL": 1960, "SBIN": 820, "LTIM": 5300,
            "TRENT": 5100, "BAJFINANCE": 920,
        }
        while not self._stopping:
            try:
                active = set(self._default_symbols) | set(self._retained_symbols)
                if self._subscriptions:
                    active |= set().union(*self._subscriptions.values())
                instruments = await asyncio.to_thread(self._find_instruments, list(active)) if active else []
                now = datetime.now(timezone.utc)
                for instrument in instruments:
                    symbol = instrument["symbol"]
                    current = self.quotes.get(symbol)
                    if current and current.get("data_source") == "021":
                        stamp = current.get("timestamp")
                        if isinstance(stamp, str):
                            try:
                                stamp = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
                            except ValueError:
                                stamp = None
                        if isinstance(stamp, datetime) and (now - stamp).total_seconds() < 15:
                            continue
                    state = self._demo_states.get(symbol)
                    if state is None:
                        seed = sum((index + 1) * ord(char) for index, char in enumerate(symbol))
                        close = Decimal(str(anchors.get(symbol, 250 + seed % 350_000 / 100))).quantize(Decimal("0.01"))
                        opened = (close * Decimal(str(1 + random.uniform(-0.008, 0.008)))).quantize(Decimal("0.01"))
                        state = {"previous_close": close, "open": opened, "last_price": opened,
                                 "high": opened, "low": opened, "volume": 300_000 + seed % 7_000_000}
                        self._demo_states[symbol] = state
                    prior = Decimal(state["last_price"])
                    last = max(Decimal("0.01"), prior * Decimal(str(1 + random.uniform(-0.0009, 0.0009)))).quantize(Decimal("0.01"))
                    state["last_price"] = last
                    state["high"] = max(Decimal(state["high"]), last)
                    state["low"] = min(Decimal(state["low"]), last)
                    state["volume"] = int(state["volume"]) + random.randint(80, 2200)
                    spread = max((last * Decimal("0.00025")).quantize(Decimal("0.01")), Decimal("0.01"))
                    bids = [{"price": (last - spread * level).quantize(Decimal("0.01")), "quantity": random.randint(100, 2200), "orders": random.randint(2, 16)} for level in range(1, 6)]
                    asks = [{"price": (last + spread * level).quantize(Decimal("0.01")), "quantity": random.randint(100, 2200), "orders": random.randint(2, 16)} for level in range(1, 6)]
                    await self._record_quote({
                        "symbol": symbol, "exchange": instrument["exchange"],
                        "token": instrument["provider_token"] or sum(map(ord, symbol)),
                        **state, "bids": bids, "asks": asks, "timestamp": now,
                        "exchange_timestamp": now, "data_source": "demo",
                    })
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("Synthetic demo market feed update failed")
            await asyncio.sleep(1.4)

    async def _publish(self, quote: dict[str, Any]) -> None:
        instrument = self._instrument_by_key.get((quote["exchange_code"], quote["token"]))
        if not instrument:
            return
        normalized = {**quote, "symbol": instrument["symbol"], "exchange": instrument["exchange"], "token": quote["token"], "data_source": "021"}
        await self._record_quote(normalized)

    async def _record_quote(self, normalized: dict[str, Any]) -> None:
        symbol = normalized["symbol"]
        previous = self.quotes.get(symbol)
        exchange_timestamp = normalized.get("exchange_timestamp")
        previous_exchange_timestamp = previous.get("exchange_timestamp") if previous else None
        if isinstance(exchange_timestamp, str):
            try:
                exchange_timestamp = datetime.fromisoformat(exchange_timestamp.replace("Z", "+00:00"))
            except ValueError:
                exchange_timestamp = None
        if isinstance(previous_exchange_timestamp, str):
            try:
                previous_exchange_timestamp = datetime.fromisoformat(previous_exchange_timestamp.replace("Z", "+00:00"))
            except ValueError:
                previous_exchange_timestamp = None
        if (normalized.get("data_source") == "021" and previous and previous.get("data_source") == "021"
                and exchange_timestamp and previous_exchange_timestamp and exchange_timestamp < previous_exchange_timestamp):
            return
        signature = (normalized.get("data_source"), str(normalized.get("last_price")), normalized.get("volume"),
                     tuple((str(x.get("price")), x.get("quantity")) for x in normalized.get("bids", [])),
                     tuple((str(x.get("price")), x.get("quantity")) for x in normalized.get("asks", [])))
        if previous and signature == self._signatures.get(symbol):
            return
        self._signatures[symbol] = signature
        if exchange_timestamp:
            normalized["exchange_timestamp"] = exchange_timestamp.isoformat()
        self.quotes[symbol] = normalized
        if self._redis:
            try:
                await self._redis.set(f"quantx:quote:{symbol}", json.dumps(normalized, default=str), ex=86400)
                await self._redis.xadd("quantx:market:quotes", {"symbol": symbol, "quote": json.dumps(normalized, default=str)}, maxlen=100000, approximate=True)
            except Exception:
                log.exception("Could not persist market quote to Redis")
        if self.on_quote:
            try:
                await self._match_queue.put(normalized)
            except asyncio.CancelledError:
                raise
        dead: list[WebSocket] = []
        for client, symbols in tuple(self._subscriptions.items()):
            if symbol not in symbols:
                continue
            try:
                await client.send_json(jsonable_encoder({"type": "quote", "data": normalized}))
            except Exception:
                dead.append(client)
        for client in dead:
            await self.remove_client(client)

    async def _match_worker(self) -> None:
        while True:
            quote = await self._match_queue.get()
            try:
                if self.on_quote:
                    result = self.on_quote(quote)
                    if asyncio.iscoroutine(result):
                        await result
            except Exception:
                log.exception("Paper-order matching failed on market update")
            finally:
                self._match_queue.task_done()

    def get_quotes(self, symbols: list[str] | None = None) -> list[dict[str, Any]]:
        if symbols:
            return [self.quotes[name.upper()] for name in symbols if name.upper() in self.quotes]
        return list(self.quotes.values())


market_data = MarketDataService()


# --- Market Data Store & Historical/Stress Extension (What-If & Stress Mode) ---

SNAPSHOT_FILE_PATH = os.path.join("backend", "data", "quote_snapshots.json")
TICKS_RECORDER_PATH = os.path.join("backend", "data", "recorded_market_ticks.jsonl")

class Quote:
    def __init__(
        self,
        symbol: str,
        price: float,
        previous_close: float,
        high: float = 0.0,
        low: float = 0.0,
        volume: int = 0,
        open_price: Optional[float] = None,
        exchange: int = 1,
        token: Optional[int] = None,
        source: str = "unavailable",  # live | cached | replay | unavailable
        is_fresh: bool = False,
        exchange_timestamp: Optional[str] = None,
        receipt_timestamp: Optional[str] = None,
        last_updated: Optional[datetime] = None
    ):
        self.symbol = symbol.upper()
        self.price = price
        self.previous_close = previous_close
        self.open_price = open_price if open_price is not None else price
        self.high = high or price
        self.low = low or price
        self.volume = volume
        self.exchange = exchange
        self.token = token
        self.source = source
        self.is_fresh = is_fresh
        self.exchange_timestamp = exchange_timestamp
        self.receipt_timestamp = receipt_timestamp or datetime.now(timezone.utc).isoformat()
        self.last_updated = last_updated or datetime.now(timezone.utc)

    @property
    def change_amount(self) -> float:
        return self.price - self.previous_close

    @property
    def change_percent(self) -> float:
        if self.previous_close <= 0:
            return 0.0
        return ((self.price - self.previous_close) / self.previous_close) * 100.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "exchange": self.exchange,
            "token": self.token,
            "price": round(self.price, 2),
            "previous_close": round(self.previous_close, 2),
            "open_price": round(self.open_price, 2) if self.open_price is not None else None,
            "change_amount": round(self.change_amount, 2),
            "change_percent": round(self.change_percent, 2),
            "high": round(self.high, 2),
            "low": round(self.low, 2),
            "volume": self.volume,
            "source": self.source,
            "is_live": self.source == "live",
            "is_fresh": self.is_fresh,
            "exchange_timestamp": self.exchange_timestamp,
            "receipt_timestamp": self.receipt_timestamp,
            "last_updated": self.last_updated.isoformat()
        }


class MarketDataStore:
    def __init__(self):
        self._quotes: Dict[str, Quote] = {}
        self._is_connected: bool = False
        self.stress_mode_enabled: bool = False
        self.stress_level: str = "high"  # mild | high | panic
        self._load_persisted_snapshots()
        self._seed_default_quotes_if_empty()

    def set_stress_mode(self, enabled: bool, level: str = "high"):
        self.stress_mode_enabled = enabled
        self.stress_level = level.lower()
        logger.info(f"Market Stress Mode set to enabled={enabled}, level={level}")

    def _seed_default_quotes_if_empty(self):
        defaults = [
            ("RELIANCE", 2850.00, 2820.00),
            ("TCS", 3920.00, 3900.00),
            ("HDFCBANK", 1540.00, 1530.00),
            ("INFYS", 1680.00, 1665.00),
            ("ICICIBANK", 1085.00, 1075.00),
            ("TATAMOTORS", 940.00, 930.00),
            ("SBIN", 760.00, 750.00),
            ("BHARTIARTL", 1210.00, 1200.00),
            ("WIPRO", 480.00, 475.00),
            ("KOTAKBANK", 1750.00, 1740.00),
            ("LT", 3540.00, 3510.00),
            ("AXISBANK", 1120.00, 1110.00),
            ("MARUTI", 12400.00, 12300.00),
            ("TITAN", 3350.00, 3320.00),
            ("HCLTECH", 1520.00, 1500.00),
        ]
        for sym, price, prev in defaults:
            if sym not in self._quotes:
                self._quotes[sym] = Quote(
                    symbol=sym,
                    price=price,
                    previous_close=prev,
                    high=round(price * 1.02, 2),
                    low=round(price * 0.98, 2),
                    volume=150000,
                    source="cached",
                    is_fresh=True,
                )

    def get_vix_index(self) -> float:
        if not self.stress_mode_enabled:
            return 14.5
        return {"mild": 24.8, "high": 42.6, "panic": 68.4}.get(self.stress_level, 42.6)

    def get_stressed_price(self, symbol: str, base_price: float) -> float:
        if not self.stress_mode_enabled or base_price <= 0:
            return base_price
        import math, random
        mult = {"mild": 1.8, "high": 3.5, "panic": 5.0}.get(self.stress_level, 3.5)
        now_ts = datetime.now(timezone.utc).timestamp()
        sym_hash = sum(ord(c) for c in symbol.upper())
        sine_shift = math.sin(now_ts * 3.0 + sym_hash) * 0.02 * mult
        random_drift = random.uniform(-0.015, 0.010) * mult
        stressed = base_price * (1.0 + sine_shift + random_drift)
        return max(0.50, round(stressed, 2))

    def _load_persisted_snapshots(self):
        """Loads previously saved quote snapshots from disk with source='cached'."""
        try:
            if os.path.exists(SNAPSHOT_FILE_PATH):
                with open(SNAPSHOT_FILE_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for sym, q_data in data.items():
                        self._quotes[sym.upper()] = Quote(
                            symbol=q_data.get("symbol", sym),
                            price=q_data.get("price", 0.0),
                            previous_close=q_data.get("previous_close", 0.0),
                            high=q_data.get("high", 0.0),
                            low=q_data.get("low", 0.0),
                            volume=q_data.get("volume", 0),
                            open_price=q_data.get("open_price"),
                            exchange=q_data.get("exchange", 1),
                            token=q_data.get("token"),
                            source="cached",
                            is_fresh=False,
                            exchange_timestamp=q_data.get("exchange_timestamp"),
                            receipt_timestamp=q_data.get("receipt_timestamp"),
                        )
                logger.info(f"Loaded {len(self._quotes)} cached quote snapshots from {SNAPSHOT_FILE_PATH}.")
        except Exception as e:
            logger.warning(f"Could not load quote snapshots: {e}")

    def save_snapshots_to_disk(self):
        """Persists current quote state to disk snapshot JSON file."""
        try:
            os.makedirs(os.path.dirname(SNAPSHOT_FILE_PATH), exist_ok=True)
            snapshot_dict = {sym: q.to_dict() for sym, q in self._quotes.items()}
            with open(SNAPSHOT_FILE_PATH, "w", encoding="utf-8") as f:
                json.dump(snapshot_dict, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to persist quote snapshots: {e}")

    def record_market_tick(
        self,
        symbol: str,
        price: float,
        previous_close: float,
        high: float = 0.0,
        low: float = 0.0,
        volume: int = 0,
        token: Optional[int] = None,
        exchange_time: Optional[int] = None
    ):
        """Appends a valid provider market tick record line to recorder file for development replay."""
        try:
            os.makedirs(os.path.dirname(TICKS_RECORDER_PATH), exist_ok=True)
            record = {
                "symbol": symbol.upper(),
                "token": token,
                "price": price,
                "previous_close": previous_close,
                "high": high,
                "low": low,
                "volume": volume,
                "exchange_time": exchange_time,
                "receipt_timestamp": datetime.now(timezone.utc).isoformat()
            }
            with open(TICKS_RECORDER_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
        except Exception as e:
            logger.warning(f"Failed to record tick: {e}")

    def get_quote(self, symbol: str) -> Optional[Quote]:
        quote = self._quotes.get(symbol.upper())
        if not quote:
            return None
        if self.stress_mode_enabled:
            stressed_p = self.get_stressed_price(symbol, quote.price)
            return Quote(
                symbol=quote.symbol,
                price=stressed_p,
                previous_close=quote.previous_close,
                high=max(quote.high, stressed_p),
                low=min(quote.low, stressed_p) if quote.low > 0 else stressed_p,
                volume=quote.volume,
                open_price=quote.open_price,
                exchange=quote.exchange,
                token=quote.token,
                source="stressed",
                is_fresh=quote.is_fresh,
                exchange_timestamp=quote.exchange_timestamp,
                receipt_timestamp=quote.receipt_timestamp,
                last_updated=quote.last_updated
            )
        return quote

    def update_quote(
        self,
        symbol: str,
        price: float,
        previous_close: Optional[float] = None,
        high: Optional[float] = None,
        low: Optional[float] = None,
        volume: Optional[int] = None,
        open_price: Optional[float] = None,
        exchange: int = 1,
        token: Optional[int] = None,
        source: str = "live",
        is_fresh: bool = True,
        exchange_timestamp: Optional[str] = None
    ):
        symbol = symbol.upper()
        existing = self._quotes.get(symbol)
        prev = previous_close if previous_close is not None else (existing.previous_close if existing else price)
        h = high if high is not None else (max(existing.high, price) if existing else price)
        l = low if low is not None else (min(existing.low, price) if existing else price)
        v = volume if volume is not None else (existing.volume if existing else 0)
        t = token if token is not None else (existing.token if existing else None)

        now_iso = datetime.now(timezone.utc).isoformat()

        new_quote = Quote(
            symbol=symbol,
            price=price,
            previous_close=prev,
            high=h,
            low=l,
            volume=v,
            open_price=open_price,
            exchange=exchange,
            token=t,
            source=source,
            is_fresh=is_fresh,
            exchange_timestamp=exchange_timestamp,
            receipt_timestamp=now_iso,
            last_updated=datetime.now(timezone.utc)
        )
        self._quotes[symbol] = new_quote

        # Record genuine live provider ticks
        if source == "live":
            self.record_market_tick(
                symbol=symbol,
                price=price,
                previous_close=prev,
                high=h,
                low=l,
                volume=v,
                token=t
            )
            self.save_snapshots_to_disk()

    def get_all_quotes(self) -> Dict[str, Quote]:
        return self._quotes

    @property
    def is_connected(self) -> bool:
        return self._is_connected

    def set_connected(self, status: bool):
        self._is_connected = status


market_store = MarketDataStore()

