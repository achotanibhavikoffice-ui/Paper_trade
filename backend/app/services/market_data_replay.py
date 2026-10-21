import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from app.services.market_data import market_store, TICKS_RECORDER_PATH

logger = logging.getLogger("tradeo.replay")

DEFAULT_SAMPLE_TICKS: List[Dict[str, Any]] = [
    {"symbol": "RELIANCE", "token": 2885, "price": 1428.60, "previous_close": 1402.80, "high": 1445.00, "low": 1410.20, "volume": 4200000},
    {"symbol": "TCS", "token": 11536, "price": 3842.10, "previous_close": 3818.40, "high": 3870.00, "low": 3810.50, "volume": 1800000},
    {"symbol": "HDFCBANK", "token": 1333, "price": 1716.45, "previous_close": 1723.00, "high": 1730.00, "low": 1708.10, "volume": 6500000},
    {"symbol": "INFY", "token": 1594, "price": 1890.20, "previous_close": 1867.80, "high": 1912.00, "low": 1875.00, "volume": 3100000},
    {"symbol": "ICICIBANK", "token": 4963, "price": 1295.70, "previous_close": 1270.90, "high": 1308.00, "low": 1280.00, "volume": 5400000},
    {"symbol": "TRENT", "token": 1964, "price": 6284.90, "previous_close": 6026.90, "high": 6350.00, "low": 6010.00, "volume": 890000},
    {"symbol": "BAJFINANCE", "token": 317, "price": 7125.00, "previous_close": 6906.70, "high": 7210.00, "low": 6980.00, "volume": 1200000},
    {"symbol": "SBIN", "token": 3045, "price": 845.30, "previous_close": 832.60, "high": 852.00, "low": 830.10, "volume": 8900000},
    {"symbol": "BHARTIARTL", "token": 10604, "price": 1684.50, "previous_close": 1662.10, "high": 1695.00, "low": 1658.00, "volume": 2900000},
    {"symbol": "ONGC", "token": 2475, "price": 248.50, "previous_close": 243.20, "high": 251.00, "low": 242.00, "volume": 12500000},
]


class MarketDataReplayEngine:
    def __init__(self):
        self._is_running: bool = False
        self._task: Optional[asyncio.Task] = None
        self.ticks_replayed_count: int = 0
        self.last_replay_time: Optional[datetime] = None

    def _ensure_sample_ticks_exist(self):
        """Initializes tick recorder file with genuine baseline sample ticks if missing."""
        if not os.path.exists(TICKS_RECORDER_PATH):
            try:
                os.makedirs(os.path.dirname(TICKS_RECORDER_PATH), exist_ok=True)
                now_iso = datetime.now(timezone.utc).isoformat()
                with open(TICKS_RECORDER_PATH, "w", encoding="utf-8") as f:
                    for tick in DEFAULT_SAMPLE_TICKS:
                        tick_record = {**tick, "receipt_timestamp": now_iso}
                        f.write(json.dumps(tick_record) + "\n")
                logger.info(f"Initialized sample recorded ticks file at {TICKS_RECORDER_PATH}.")
            except Exception as e:
                logger.warning(f"Could not initialize sample ticks file: {e}")

    def load_recorded_ticks(self) -> List[Dict[str, Any]]:
        """Reads recorded tick JSON objects from disk."""
        self._ensure_sample_ticks_exist()
        ticks = []
        if os.path.exists(TICKS_RECORDER_PATH):
            try:
                with open(TICKS_RECORDER_PATH, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            try:
                                ticks.append(json.loads(line))
                            except Exception:
                                continue
            except Exception as e:
                logger.warning(f"Failed to read recorded ticks: {e}")
        return ticks if ticks else DEFAULT_SAMPLE_TICKS

    async def _replay_loop(self):
        logger.info("Development Replay Engine started.")
        self._is_running = True
        step = 0

        while self._is_running:
            try:
                ticks = self.load_recorded_ticks()
                if not ticks:
                    await asyncio.sleep(2.0)
                    continue

                tick = ticks[step % len(ticks)]
                step += 1

                # Slight realistic price variation simulation over recorded ticks
                variance_factor = 1.0 + (((step % 11) - 5) * 0.0005)
                simulated_price = round(tick.get("price", 100.0) * variance_factor, 2)

                now_iso = datetime.now(timezone.utc).isoformat()
                self.last_replay_time = datetime.now(timezone.utc)
                self.ticks_replayed_count += 1

                market_store.update_quote(
                    symbol=tick["symbol"],
                    price=simulated_price,
                    previous_close=tick.get("previous_close", simulated_price),
                    high=max(tick.get("high", simulated_price), simulated_price),
                    low=min(tick.get("low", simulated_price), simulated_price),
                    volume=tick.get("volume", 0),
                    token=tick.get("token"),
                    source="replay",
                    is_fresh=True,
                    exchange_timestamp=now_iso,
                )

                await asyncio.sleep(1.5)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Replay loop iteration error: {e}")
                await asyncio.sleep(2.0)

        self._is_running = False
        logger.info("Development Replay Engine stopped.")

    def start(self, loop: Optional[asyncio.AbstractEventLoop] = None):
        if not self._is_running:
            self._is_running = True
            try:
                target_loop = loop or asyncio.get_running_loop()
            except RuntimeError:
                target_loop = asyncio.get_event_loop()
            self._task = target_loop.create_task(self._replay_loop())

    def stop(self):
        self._is_running = False
        if self._task and not self._task.done():
            self._task.cancel()

    @property
    def is_running(self) -> bool:
        return self._is_running


replay_engine = MarketDataReplayEngine()
