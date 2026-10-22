"""A small offline reference for common equity-market questions."""

from dataclasses import dataclass


@dataclass(frozen=True)
class MarketTopic:
    name: str
    phrases: tuple[str, ...]
    answer: str


MARKET_TOPICS = (
    MarketTopic("bull and bear markets", ("bull market", "bear market", "bullish", "bearish"),
        "A bull market describes a sustained period of rising prices and generally optimistic expectations; a bear market describes a sustained decline and pessimism. The terms describe broad conditions, not a guarantee that a particular share will follow the index. A single up or down day is not enough to establish either trend."),
    MarketTopic("market indices", ("nifty", "sensex", "index", "indices", "indices"),
        "A market index tracks a selected group of securities using a defined methodology. Nifty 50 and BSE Sensex are widely followed Indian large-company indices. Index moves summarize the constituents according to their weighting rules; they do not mean every share rose or fell by the same amount. Check the index provider's methodology for constituent and weighting details."),
    MarketTopic("market capitalization", ("market cap", "market capitalization", "market capitalisation", "large cap", "mid cap", "small cap"),
        "Market capitalization is the market price per share multiplied by the company's outstanding shares. It is a measure of market value, not cash on the balance sheet or a complete measure of business quality. Large-, mid-, and small-cap labels are relative size groupings; the exact classification can depend on the publisher and current rules."),
    MarketTopic("liquidity", ("liquidity", "liquid stock", "illiquid"),
        "Liquidity describes how readily an instrument can be bought or sold without moving its price substantially. Look at trading activity, bid–ask spread, and available depth together. High historical volume does not guarantee liquidity at the moment you place an order, and a displayed order book can change or be incomplete."),
    MarketTopic("bid ask spread", ("bid ask", "bid-ask", "bid and ask", "spread", "best bid", "best ask", "offer price"),
        "The bid is the highest visible price buyers currently offer; the ask (or offer) is the lowest visible price sellers currently request. Their difference is the spread. A narrower spread often means lower immediate trading friction, but depth and changing quotes also matter. A market buy generally matches offers; a market sell generally matches bids."),
    MarketTopic("volatility", ("volatility", "volatile", "vix", "wild market"),
        "Volatility describes how much and how quickly prices vary over time. It is not the same as direction: a market can be highly volatile while moving sideways. Higher volatility can widen uncertainty around entry and exit prices, so position size and order type matter. A volatility measure summarizes past or implied movement; it does not predict the next move."),
    MarketTopic("volume", ("trading volume", "share volume", "volume"),
        "Volume is the number of shares or contracts traded during a period. Compare it with the instrument's usual activity and the same time of day. A volume increase can show greater participation, but by itself it does not tell you whether informed buyers or sellers are in control or predict the next price move."),
    MarketTopic("price and market cap", ("share price", "stock price", "cheap stock", "expensive stock", "low priced"),
        "A low share price does not automatically mean a company is cheap, and a high share price does not automatically mean it is expensive. Share count, earnings, cash flows, debt, growth, and valuation all matter. Compare businesses using appropriate per-share and company-level measures rather than price alone."),
    MarketTopic("price earnings ratio", ("p/e", "pe ratio", "price to earnings", "price-earnings", "valuation ratio"),
        "The price-to-earnings (P/E) ratio is share price divided by earnings per share (EPS). A trailing P/E uses past earnings; a forward P/E uses estimates. Compare similar businesses and check whether earnings are cyclical, one-off, or negative. A low P/E can reflect risk or weak prospects, while a high P/E may rely on growth expectations; neither alone proves a share is cheap or expensive."),
    MarketTopic("earnings per share", ("eps", "earnings per share", "profit per share"),
        "Earnings per share (EPS) is a company's profit attributable to ordinary shareholders divided by its weighted average shares, subject to the reporting definition. It helps compare profit on a per-share basis, but can change with one-off items, accounting choices, or share issuance/buybacks. Read it alongside revenue, cash flow, debt, and notes to the accounts."),
    MarketTopic("credit, debt, and credit risk", ("credit risk", "credit rating", "credit score", "credit", "debit", "debt to equity", "interest coverage", "default risk", "margin funding"),
        "Credit in a ledger means value added or owed; a debit means value deducted. Credit risk is the chance that a borrower cannot repay. A credit rating is an agency's opinion on that risk. Debt-to-equity compares borrowings with shareholder capital, and margin funding uses borrowed trading money. These measures help analyse risk; they are not buy or sell signals."),
    MarketTopic("dividends", ("dividend", "dividend yield", "payout ratio"),
        "A dividend is a distribution a company may make to shareholders. Dividend yield is commonly the annual dividend per share divided by the share price, so it moves when either changes. A payout is not guaranteed; a high yield can reflect a falling share price or an unsustainable distribution. Review cash generation and company announcements, not yield alone."),
    MarketTopic("ipo", ("ipo", "initial public offering", "listing day", "new listing"),
        "An IPO is a company's first public share offering and listing process. The offer price, application process, allocation, and listing price are different things; an investor may receive no allocation, and the market price can rise or fall after listing. Read the offer documents and current exchange/SEBI information before making a decision. Quantx is for simulated practice and does not apply for IPOs."),
    MarketTopic("etfs", ("etf", "exchange traded fund", "index fund"),
        "An exchange-traded fund is a fund whose units trade on an exchange. Some track an index, while others follow a sector, commodity, or active strategy. Check its objective, holdings, expense ratio, tracking difference, liquidity, and risk documents. An ETF can still lose value and is not automatically diversified."),
    MarketTopic("stock splits and bonus issues", ("stock split", "share split", "bonus issue", "bonus shares"),
        "A stock split changes the number of shares and proportionally adjusts the per-share price; by itself, it does not change the company's total value or your proportional ownership. A bonus issue distributes additional shares to eligible holders under specified terms and also changes per-share figures. Check the company's official announcement for ratios, dates, and treatment."),
    MarketTopic("support and resistance", ("support level", "resistance level", "support and resistance", "support", "resistance"),
        "Support and resistance are chart areas where price has previously faced buying or selling pressure. They are zones, not exact walls: a level can break, and a former support may later act as resistance. Traders use them to structure scenarios, but historical reactions do not ensure a future bounce or reversal."),
    MarketTopic("candlesticks", ("candlestick", "candle chart", "wick", "ohlc", "open high low close"),
        "A candlestick summarizes open, high, low, and close (OHLC) for a chosen interval. The body spans open to close; the wicks show the interval's high and low. Candle color conventions can vary. A candle reveals the price range, not the sequence of trades or the cause, so read it with timeframe, volume, and broader context."),
    MarketTopic("technical analysis", ("technical analysis", "moving average", "rsi", "macd", "indicator"),
        "Technical analysis studies price, volume, and derived indicators to describe trends or define trade scenarios. Indicators such as moving averages or RSI are calculated from historical data and can lag or produce conflicting signals, especially in sideways markets. They are tools for organizing evidence, not reliable standalone forecasts."),
    MarketTopic("fundamental analysis", ("fundamental analysis", "balance sheet", "cash flow statement", "income statement", "financial statements"),
        "Fundamental analysis assesses a business, its finances, industry, and valuation. The income statement reports performance over a period; the balance sheet is a snapshot of assets and liabilities; the cash flow statement tracks cash sources and uses. Read them together across multiple periods and consider debt, margins, risks, and valuation assumptions."),
    MarketTopic("futures and options", ("futures", "options", "call option", "put option", "derivatives", "option premium", "strike price"),
        "Futures and options are derivatives whose value depends on an underlying instrument. A futures contract creates an obligation under its terms; an option gives its buyer a right, but not an obligation, while the seller takes on corresponding obligations. Premium, strike, expiry, volatility, and time decay affect option value. Derivatives can create rapid or substantial losses and require understanding contract specifications; this is not a beginner shortcut."),
    MarketTopic("short selling", ("short selling", "short sell", "short position", "going short"),
        "Short selling seeks to benefit if a price falls, but involves selling borrowed securities or using an eligible derivative position under applicable rules. Losses can be large if price rises, and borrow, margin, expiry, and settlement requirements matter. Indian market rules differ by product and can change; check your broker and current exchange/SEBI rules. Quantx only simulates practice activity."),
    MarketTopic("risk and diversification", ("diversification", "portfolio risk", "risk reward", "risk-to-reward", "position sizing", "drawdown"),
        "Diversification spreads exposure across investments, but does not eliminate broad market risk. Position sizing links the amount invested to a planned loss limit and stop distance; risk-to-reward compares a possible loss with a possible gain, without assigning the odds of either outcome. Drawdown measures a decline from a prior account peak. These are planning concepts, not guarantees."),
    MarketTopic("market orders and limit orders", ("market order", "limit order", "order type", "slippage", "partial fill"),
        "A market order prioritizes execution against available prices, so the final fill can differ from the quote you saw. A limit order sets the worst acceptable buy price or lowest acceptable sell price, but may not fill. Partial fills can occur when only some quantity is available. In Quantx, orders execute in a paper simulator and are not sent to an exchange."),
    MarketTopic("settlement", ("settlement", "t+1", "pay in", "pay out", "settle trades"),
        "Settlement is the process of completing delivery of securities and funds after a trade. The applicable cycle depends on the instrument and current market rules. Because exchange and regulatory requirements can change and exceptions exist, check the latest NSE/SEBI notices or your broker's contract note for a specific trade. Quantx's account ledger is simulated and does not settle real securities."),
    MarketTopic("circuit filters", ("circuit breaker", "circuit filter", "upper circuit", "lower circuit", "price band"),
        "Price bands and market-wide circuit breakers are exchange mechanisms that can restrict trading or pause the market after specified moves. Their scope, thresholds, and procedures depend on the instrument and current exchange rules. A stock hitting a band may have limited buyers or sellers, so an exit is not guaranteed. Check the current exchange notice for a specific symbol."),
)


def find_market_answer(text: str) -> str | None:
    normalized = " ".join(text.casefold().replace("–", "-").replace("—", "-").split())
    matches = [
        (len(phrase), topic)
        for topic in MARKET_TOPICS
        for phrase in topic.phrases
        if phrase in normalized
    ]
    if not matches:
        return None
    return max(matches, key=lambda match: match[0])[1].answer


def market_knowledge() -> str:
    return "\n".join(f"{topic.name}: {topic.answer}" for topic in MARKET_TOPICS)
