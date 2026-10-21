"""Refresh the searchable NSE equity catalogue from NSE's public security files."""

from __future__ import annotations

import csv
import io
import logging
import re
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert

from app.database import SessionLocal
from app.models import Instrument

logger = logging.getLogger("quantx.nse_catalog")

CATALOG_URLS = (
    "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv",
    "https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv",
)
_MAX_FILE_BYTES = 5_000_000
_SYMBOL_RE = re.compile(r"^[A-Z0-9][A-Z0-9&.\-]{0,29}$")


class NseCatalogError(Exception):
    pass


def _download(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "text/csv,*/*;q=0.8",
            "User-Agent": "Mozilla/5.0 (compatible; Quantx/0.1; NSE instrument catalog)",
            "Referer": "https://www.nseindia.com/market-data/securities-available-for-trading",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 - fixed NSE archive URLs
            body = response.read(_MAX_FILE_BYTES + 1)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise NseCatalogError(f"Could not download the NSE equity catalogue ({type(error).__name__}).") from None
    if not body or len(body) > _MAX_FILE_BYTES:
        raise NseCatalogError("The NSE equity catalogue was empty or larger than expected.")
    try:
        return body.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            return body.decode("latin-1")
        except UnicodeDecodeError:
            raise NseCatalogError("The NSE equity catalogue was not readable text.") from None


def _header(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.strip().lower().lstrip("\ufeff"))


def _parse_file(text: str, *, source: str) -> list[dict[str, Any]]:
    reader = csv.DictReader(io.StringIO(text))
    columns = {_header(str(column)): column for column in (reader.fieldnames or [])}
    symbol_col = columns.get("symbol") or columns.get("tradingsymbol")
    name_col = next((columns[key] for key in ("nameofcompany", "companyname", "securityname", "name") if key in columns), None)
    if not symbol_col or not name_col:
        raise NseCatalogError(f"The {source} catalogue is missing its symbol or company-name columns.")

    items: list[dict[str, Any]] = []
    for row in reader:
        symbol = str(row.get(symbol_col) or "").strip().upper()
        name = re.sub(r"\s+", " ", str(row.get(name_col) or "").strip())
        if not _SYMBOL_RE.fullmatch(symbol) or not name:
            continue
        items.append({
            "symbol": symbol,
            "name": name[:120],
            "exchange": "NSE",
            "instrument_type": "EQUITY",
            "is_tradable": True,
            "lot_size": 1,
            "tick_size_paise": 5,
            "updated_at": datetime.now(timezone.utc),
        })
    return items


class NseCatalogService:
    def sync(self) -> int:
        rows: dict[str, dict[str, Any]] = {}
        for index, url in enumerate(CATALOG_URLS):
            source = "NSE equity" if index == 0 else "NSE SME"
            for row in _parse_file(_download(url), source=source):
                rows[row["symbol"]] = row
        if len(rows) < 1000:
            raise NseCatalogError(f"The NSE catalogues returned only {len(rows)} valid equities; refusing to replace the current catalogue.")
        return self._upsert(list(rows.values()))

    @staticmethod
    def _upsert(rows: list[dict[str, Any]]) -> int:
        now = datetime.now(timezone.utc)
        with SessionLocal() as db:
            # Hide delisted/tokenless records, then re-enable every symbol present in today's official files.
            db.execute(
                update(Instrument)
                .where(Instrument.exchange == "NSE", Instrument.provider_token.is_(None))
                .values(is_tradable=False, updated_at=now)
            )
            statement = insert(Instrument).values(rows)
            statement = statement.on_conflict_do_update(
                index_elements=[Instrument.exchange, Instrument.symbol],
                set_={
                    "name": statement.excluded.name,
                    "instrument_type": statement.excluded.instrument_type,
                    "is_tradable": True,
                    "updated_at": statement.excluded.updated_at,
                },
            )
            db.execute(statement)
            db.commit()
        return len(rows)


nse_catalog = NseCatalogService()
