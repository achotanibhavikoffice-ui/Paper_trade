"""Product knowledge shared by Quantx Guide's AI and built-in help modes."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Feature:
    key: str
    title: str
    path: str
    terms: tuple[str, ...]
    explanation: str


FEATURES = (
    Feature(
        "what_if", "What-if Lab", "/what-if",
        ("what-if", "what if", "whatif", "scenario", "hypothetical", "allocation simulation"),
        "What-if Lab is a read-only simulator for exploring possible outcomes before changing a real paper position. It has three tools: "
        "Stock estimates the result of investing a chosen rupee amount or share quantity, with an optional manual purchase price and either a percentage move or a manual future price over a chosen holding period. "
        "Stress Test applies a broad percentage move to the portfolio and lets you override individual shares; presets provide starting points such as a mild correction. "
        "Allocation previews the cash and portfolio impact of a hypothetical buy or sell. After a run, review projected value, P&L, and assumptions. Save a named scenario, reopen it later, or compare up to three saved scenarios. "
        "These calculations do not place orders or change cash, holdings, or positions, and they do not predict future returns. Open the lab from the left menu or from What-if buttons on a stock page."
    ),
    Feature(
        "dashboard", "Overview", "/dashboard", ("dashboard", "overview", "home", "equity", "buying power"),
        "Overview summarizes the practice account: simulated account equity, available cash, open positions, and orders in progress. The positions panel links to the portfolio; the market watch links to Explore. Quick order lets you choose a symbol, buy or sell, product, and quantity, then submit a simulated order. The quote/source badge identifies whether the feed is an exchange stream, an API snapshot, or practice data."
    ),
    Feature(
        "explore", "Explore equities", "/explore", ("explore", "stock search", "share search", "instrument", "market movers", "gainers", "losers"),
        "Explore searches the supported Indian equity catalogue by symbol or company name and can filter by sector. Market Movers shows the provider's active instruments, gainers, and losers. Select a row or card to open its stock detail page; the star saves it to Watchlist. A quote labeled API Snapshot is a price-only provider snapshot that refreshes periodically and has no exchange depth. A DATA label means generated practice values, not a live exchange quote."
    ),
    Feature(
        "quote_sources", "Quote sources and feed status", "/explore", ("quote labels", "quote source", "api snapshot", "data badge", "waiting for feed", "not connected", "live data", "feed status"),
        "The quote badge describes where a displayed price came from. API SNAPSHOT means a third-party price snapshot that refreshes periodically; it is not a streaming tick and does not include bid/ask depth. DATA means generated practice quotes, not exchange prices. MARKET FEED LIVE or CONNECTED means an exchange stream is connected. WAITING FOR FEED or NOT CONNECTED means the app has no current stream quote for that symbol. Historical chart data may load separately from the current quote. Check the badge and fetched/update time before treating a value as current."
    ),
    Feature(
        "stock", "Stock details", "/explore", ("stock detail", "company page", "candlestick", "chart", "market depth", "order ticket", "quote"),
        "A stock detail page combines the symbol and company name, quote summary, historical chart, watchlist control, What-if shortcut, market depth, instrument facts, an order ticket, and related market news. Chart ranges and candle/line controls change the chart view. Exchange depth is available only when the connected provider supplies it; API snapshots contain a price only. The order ticket submits to Quantx's local paper simulator, never to a broker."
    ),
    Feature(
        "news", "Market News", "/news", ("market news", "news", "headline", "sentiment"),
        "Market News lists recent financial headlines with company references and an automatically scored sentiment label where available. Use it for market context, not as a promise of price direction. A story can be opened to inspect its source and details."
    ),
    Feature(
        "watchlist", "Watchlist", "/watchlist", ("watchlist", "watch list", "starred", "favorites", "favourites"),
        "Watchlist is a personal shortlist of symbols. Add a stock from Explore or its detail page, open a symbol to inspect its chart, and remove it with the row action. When the page is open, selected symbols can receive periodic IndianAPI price snapshots (up to the configured provider limit); snapshots do not include order-book depth."
    ),
    Feature(
        "portfolio", "Portfolio overview", "/portfolio", ("portfolio", "portfolio mix", "delivery holdings", "intraday exposure"),
        "Portfolio overview summarizes account value and P&L, then separates delivery holdings from intraday exposure. Holdings are CNC delivery positions; Positions are MIS intraday positions. Use the links on the page to open either list. Values are for the simulated account and depend on available quote data."
    ),
    Feature(
        "holdings", "Holdings", "/portfolio/holdings", ("holding", "holdings", "cnc", "delivery"),
        "Holdings shows delivery (CNC) shares retained in the simulated account, including quantity, average price, current value, and unrealized P&L. Explore instruments to view another share. CNC is the simulated delivery product; no exchange delivery occurs."
    ),
    Feature(
        "positions", "Open positions", "/portfolio/positions", ("position", "positions", "mis", "intraday", "square off"),
        "Open positions shows intraday (MIS) exposure with quantity, average price, market value, and mark-to-market P&L. MIS positions are intended to be squared off during the session; Quantx schedules simulated exits after 3:20 PM IST on weekdays when the backend and usable quote depth are available."
    ),
    Feature(
        "orders", "Orders", "/orders", ("orders", "order book", "cancel order", "order status", "limit order", "market order", "stop loss"),
        "Orders is the account's simulated order book. It shows open, pending, partially filled, filled, cancelled, or rejected orders and lets you inspect order details or cancel eligible open orders. Order types include Market, Limit, SL, and SL-M; validity may be DAY or IOC. A filled order changes only the local paper account. Open an order for its terms, fills, charges, and event history."
    ),
    Feature(
        "stress", "Market Stress", "/market-stress", ("market stress", "stress mode", "volatility", "vix", "panic mode"),
        "Market Stress is a practice tool for examining behavior in more volatile conditions. The page has a master ON/OFF switch, Mild, High, and Panic intensity controls, a volatility meter, status/tick information, and portfolio exposure views. In the paper simulator, stress settings affect simulated execution conditions such as spread and available depth; they do not change exchange prices or involve real orders. Switch it off to return to normal practice conditions."
    ),
    Feature(
        "recovery", "Recovery Shield", "/recovery", ("recovery", "recovery shield", "safepoint", "safe point", "rollback", "restore"),
        "Recovery Shield records SafePoints: snapshots of the simulated account used to inspect or recover from a test disruption. The page shows protected cash, portfolio equity, and saved checkpoints. Capture SafePoint creates a named manual checkpoint; the test disruption control demonstrates recovery behavior. Review checkpoint details before any rollback, because a rollback restores earlier simulated state. This is an application recovery feature, not protection for real money or a brokerage account."
    ),
    Feature(
        "learn", "Learn", "/learn", ("learn", "lesson", "learning module", "quiz", "course", "tutorial"),
        "Learn contains short modules about market mechanics, order types, chart concepts, and risk management. Open a module to read a lesson and answer its knowledge-check questions. It is educational material and does not recommend a particular investment."
    ),
    Feature(
        "notifications", "Notifications", "/notifications", ("notification", "notifications", "alerts", "unread"),
        "Notifications collects workspace updates such as paper-account activity, market-session notices, and security messages. Use it to review recent items and mark or clear them where the available controls allow. Notifications are app messages, not broker or exchange alerts."
    ),
    Feature(
        "account", "Practice Account", "/account", ("practice account", "virtual capital", "cash audit", "ledger", "initial capital", "available cash", "starting balance"),
        "Practice Account displays available virtual cash, the starting capital, account status and currency, account number, creation date, and the Cash Audit Ledger. The ledger records the initial virtual capital grant and subsequent simulated trade debits, credits, charges, and adjustments. The chosen starting balance is virtual and orders/fills never use real money."
    ),
    Feature(
        "profile", "Profile & Settings", "/profile", ("profile", "settings", "display name", "trading preference", "dark mode", "password"),
        "Profile & Settings manages the display name, account preferences, and sign-in/security options available to the user. The email is the sign-in identity. Dark mode is a workspace appearance toggle in the left navigation; Settings currently opens Profile & Settings. Password recovery starts from the sign-in page."
    ),
    Feature(
        "authentication", "Sign-in and account setup", "/login", ("sign in", "login", "register", "create account", "capital slider", "forgot password"),
        "Register creates a Quantx login and a paper account. After first sign-in, account setup asks for a virtual starting balance from ₹1 lakh to ₹50 lakh using the input, presets, or slider. That choice becomes the Initial virtual capital grant. Forgot password sends a one-time reset link; in local development it may be printed in the backend terminal instead of emailed."
    ),
    Feature(
        "workspace", "Workspace navigation and controls", "/dashboard", ("sidebar", "navigation", "workspace menu", "top bar", "global search", "theme", "dark mode", "help and support"),
        "The left navigation opens Overview, Explore, Market News, Watchlist, Portfolio, Orders, What-if Lab, Market Stress, Recovery Shield, Learn, Notifications, Practice Account, and Profile & Settings. The top bar has global stock search, a market-source/status badge, available virtual cash, notifications, and the profile menu. The moon/sun control switches light and dark appearance. Help & support opens this guide. On small screens, use the menu button to open navigation and the bottom tabs for Home, Explore, Watchlist, and Portfolio."
    ),
)

def find_feature(text: str, page: str = "") -> Feature | None:
    normalized = text.casefold().replace("–", "-").replace("—", "-")
    matches = [feature for feature in FEATURES if any(term in normalized for term in feature.terms)]
    if matches:
        # Prefer the most specific phrase when one question mentions multiple features.
        return max(matches, key=lambda feature: max((len(term) for term in feature.terms if term in normalized), default=0))
    route_value = page.rsplit("(", 1)[-1].rstrip(") ") if "(" in page else page
    route = route_value.split("?", 1)[0].rstrip("/") or "/dashboard"
    if route.startswith("/stocks/"):
        return next(feature for feature in FEATURES if feature.key == "stock")
    if route.startswith("/portfolio/holdings"):
        return next(feature for feature in FEATURES if feature.key == "holdings")
    if route.startswith("/portfolio/positions"):
        return next(feature for feature in FEATURES if feature.key == "positions")
    if route.startswith("/orders/"):
        return next(feature for feature in FEATURES if feature.key == "orders")
    return next((feature for feature in FEATURES if feature.path == route), None)


def project_knowledge() -> str:
    return "\n".join(f"{feature.title} ({feature.path}): {feature.explanation}" for feature in FEATURES)
