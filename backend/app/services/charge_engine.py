from decimal import Decimal, ROUND_HALF_UP
from typing import Dict


def quantize_money(amount: Decimal) -> Decimal:
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class ChargeBreakdown:
    def __init__(
        self,
        brokerage: Decimal,
        stt: Decimal,
        exchange_fee: Decimal,
        gst: Decimal,
        stamp_duty: Decimal,
        total_charges: Decimal,
    ):
        self.brokerage = brokerage
        self.stt = stt
        self.exchange_fee = exchange_fee
        self.gst = gst
        self.stamp_duty = stamp_duty
        self.total_charges = total_charges

    def to_dict(self) -> Dict[str, float]:
        return {
            "brokerage": float(self.brokerage),
            "stt": float(self.stt),
            "exchange_fee": float(self.exchange_fee),
            "gst": float(self.gst),
            "stamp_duty": float(self.stamp_duty),
            "total_charges": float(self.total_charges),
        }


def calculate_trade_charges(
    side: str,
    product: str,
    quantity: int,
    price: Decimal,
) -> ChargeBreakdown:
    """Calculates brokerage, STT, Exchange transaction charges, GST, and Stamp Duty for a trade fill."""
    turnover = quantize_money(price * Decimal(quantity))
    if turnover <= Decimal("0.00"):
        zero = Decimal("0.00")
        return ChargeBreakdown(zero, zero, zero, zero, zero, zero)

    side = side.upper()
    product = product.upper()

    # 1. Brokerage
    if product == "CNC":
        brokerage_pct = turnover * Decimal("0.0005")  # 0.05%
        brokerage = min(brokerage_pct, Decimal("20.00"))
    else:  # MIS
        brokerage_pct = turnover * Decimal("0.0003")  # 0.03%
        brokerage = min(brokerage_pct, Decimal("20.00"))
    brokerage = quantize_money(brokerage)

    # 2. STT (Securities Transaction Tax)
    if product == "CNC":
        stt = quantize_money(turnover * Decimal("0.001"))  # 0.1% on Buy and Sell
    else:  # MIS
        if side == "SELL":
            stt = quantize_money(turnover * Decimal("0.00025"))  # 0.025% on Sell only
        else:
            stt = Decimal("0.00")

    # 3. Exchange Transaction Charges (NSE Equity ~ 0.00345%)
    exchange_fee = quantize_money(turnover * Decimal("0.0000345"))

    # 4. GST (18% on Brokerage + Exchange Fee)
    gst = quantize_money((brokerage + exchange_fee) * Decimal("0.18"))

    # 5. Stamp Duty (On Buy value only: CNC = 0.015%, MIS = 0.003%)
    if side == "BUY":
        if product == "CNC":
            stamp_duty = quantize_money(turnover * Decimal("0.00015"))  # 0.015%
        else:
            stamp_duty = quantize_money(turnover * Decimal("0.00003"))  # 0.003%
    else:
        stamp_duty = Decimal("0.00")

    total_charges = quantize_money(brokerage + stt + exchange_fee + gst + stamp_duty)

    return ChargeBreakdown(
        brokerage=brokerage,
        stt=stt,
        exchange_fee=exchange_fee,
        gst=gst,
        stamp_duty=stamp_duty,
        total_charges=total_charges,
    )
