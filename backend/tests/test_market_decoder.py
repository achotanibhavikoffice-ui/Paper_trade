import struct
from decimal import Decimal

from app.services.market_data import decode_market_frame


def tc1(token: int, price_paise: int) -> bytes:
    return struct.pack(">HHII", 1, 1, token, price_paise)


def tc3(token: int = 3045) -> bytes:
    header = struct.pack(
        ">HIIIIQQQIIII",
        1, token, 84530, 10, 84200, 500000, 100, 200, 83260, 83500, 85200, 83010,
    )
    return struct.pack(">H", 3) + header + bytes(216 - 60) + struct.pack(">I", 1700000000)


def test_021_heartbeat_is_ignored_as_a_quote():
    assert decode_market_frame(struct.pack(">H", 10)) == []


def test_021_tc1_ltp_decodes_exchange_token_and_paise():
    quote = decode_market_frame(tc1(2885, 142860))[0]
    assert quote["exchange_code"] == 1
    assert quote["token"] == 2885
    assert quote["last_price"] == Decimal("1428.60")


def test_021_tc3_full_cash_packet_decodes_quote_and_depth():
    quote = decode_market_frame(tc3())[0]
    assert quote["exchange_code"] == 1
    assert quote["token"] == 3045
    assert quote["last_price"] == Decimal("845.30")
    assert quote["previous_close"] == Decimal("832.60")
    assert quote["open"] == Decimal("835.00")
    assert quote["high"] == Decimal("852.00")
    assert quote["low"] == Decimal("830.10")
    assert quote["volume"] == 500000
    assert len(quote["bids"]) == 5
    assert len(quote["asks"]) == 5


def test_021_concatenated_binary_packets_decode_without_treating_heartbeat_as_market_data():
    updates = decode_market_frame(struct.pack(">H", 10) + tc1(1333, 171645) + tc3(5112))
    assert len(updates) == 2
    assert [update["token"] for update in updates] == [1333, 5112]
    assert updates[0]["last_price"] == Decimal("1716.45")
