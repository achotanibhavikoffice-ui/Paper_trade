import { useState } from 'react';
import { ArrowRight, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import type { Lesson } from '../types';

export const sampleLessons: Lesson[] = [
  {
    id: 'order-types',
    title: 'Market Orders vs Limit Orders',
    category: 'Order Types & Execution',
    summary: 'Learn the exact mechanics behind market price execution versus waiting for a specific limit price.',
    read_time: '2 min read',
    difficulty: 'Beginner',
    objectives: [
      'Understand how a Market order executes immediately at the best available price.',
      'Learn how a Limit order specifies the maximum price you are willing to pay.',
      'Choose between execution speed versus price precision.',
    ],
    content: `
      ### Market Orders
      A Market order instructs the exchange to buy or sell an instrument immediately at the current prevailing market price. The key priority of a market order is **speed of execution**, not price control. In volatile market sessions, the actual fill price may differ slightly from the last traded price (known as slippage).

      ### Limit Orders
      A Limit order sets a strict price boundary. A Buy Limit order can only execute at your limit price or lower. A Sell Limit order can only execute at your limit price or higher. If the market price does not reach your limit price, your order remains pending in the order book until filled or cancelled.
    `,
    key_takeaways: [
      'Market orders prioritize immediate execution speed.',
      'Limit orders prioritize price control at the cost of potential non-execution.',
      'Paper trading allows testing limit pricing without financial risk.',
    ],
    quiz: {
      question: 'Which order type guarantees execution speed over exact price?',
      options: ['Limit Order', 'Market Order', 'Stop-Loss Order', 'Trailing Order'],
      answer_index: 1,
      explanation: 'Market orders execute immediately at the best available prevailing market price.',
    },
  },
  {
    id: 'mis-vs-cnc',
    title: 'MIS Intraday vs CNC Delivery Trading',
    category: 'Product Types',
    summary: 'Understand intraday auto square-off rules versus holding stock in your portfolio delivery account.',
    read_time: '3 min read',
    difficulty: 'Beginner',
    objectives: [
      'Define MIS (Margin Intraday Square-off) and CNC (Cash and Carry delivery).',
      'Learn why intraday orders auto close by 3:20 PM IST.',
      'Understand how delivery trading requires full cash funding.',
    ],
    content: `
      ### Intraday Trading (MIS)
      MIS stands for Margin Intraday Square-off. MIS orders are designed to be opened and closed within the same market session. Since all intraday positions are closed before the market bell (typically 3:20 PM IST), brokerages allow lower margin requirements.

      ### Delivery Trading (CNC)
      CNC stands for Cash and Carry. When you buy equities using CNC, you pay the full transaction value using your paper cash balance. The shares are held in your portfolio for multiple days, weeks, or years.
    `,
    key_takeaways: [
      'MIS positions must be closed before 3:20 PM IST on the same trading day.',
      'CNC orders represent long-term portfolio delivery holdings.',
      'Quantx provides separate workspace tabs for MIS and CNC management.',
    ],
    quiz: {
      question: 'What happens to open MIS positions at 3:20 PM IST?',
      options: [
        'They are automatically converted to CNC delivery',
        'They are auto squared-off by the system',
        'They remain open overnight',
        'They are cancelled without notice',
      ],
      answer_index: 1,
      explanation: 'MIS intraday positions are automatically squared off before the market session closes.',
    },
  },
  {
    id: 'risk-management',
    title: 'Position Sizing and Capital Risk Rules',
    category: 'Risk & Portfolio Management',
    summary: 'Discover how top traders calculate position size to preserve trading capital across market cycles.',
    read_time: '4 min read',
    difficulty: 'Intermediate',
    objectives: [
      'Learn the 1% risk rule for single trade exposure.',
      'Calculate quantity based on stop-loss distance.',
      'Avoid over-leveraging paper trading capital.',
    ],
    content: `
      ### The 1% Risk Principle
      Disciplined portfolio management starts by capping maximum loss on any single trade to 1% of total account capital. On a ₹1,00,000 paper trading account, maximum risk per trade should not exceed ₹1,000.

      ### Calculating Position Size
      Position Size (Quantity) = (Account Risk Amount) / (Entry Price - Stop Loss Price).
    `,
    key_takeaways: [
      'Never risk more than 1-2% of total capital on a single position.',
      'Position size depends on stop loss distance, not guesswork.',
    ],
    quiz: {
      question: 'On a ₹100,000 paper account, what is the 1% risk threshold?',
      options: ['₹500', '₹1,000', '₹5,000', '₹10,000'],
      answer_index: 1,
      explanation: '1% of ₹100,000 capital is ₹1,000 maximum risk per trade.',
    },
  },
  {
    id: 'support-resistance',
    title: 'Support and Resistance Basics',
    category: 'Technical Analysis',
    summary: 'Learn how to identify key price levels where supply and demand historically balance out.',
    read_time: '3 min read',
    difficulty: 'Beginner',
    objectives: [
      'Define Support and Resistance in price charts.',
      'Learn how historical price points affect future price movements.',
      'Understand how support becomes resistance when broken.',
    ],
    content: `
      ### Support (The Floor)
      Support is a price level where a downtrend tends to pause due to a concentration of demand (buying interest). As the price drops, cheaper shares look more attractive to buyers, stopping the price from falling further.
      
      ### Resistance (The Ceiling)
      Resistance is a price level where an uptrend tends to pause due to a concentration of supply (selling interest). As the price rises, sellers take profits, creating an invisible ceiling.
    `,
    key_takeaways: [
      'Support acts like a floor; resistance acts like a ceiling.',
      'Old support often becomes new resistance when broken.',
    ],
    quiz: {
      question: 'What usually happens when a strong support level is broken?',
      options: ['It becomes a new resistance level', 'The stock is delisted', 'It remains a support level indefinitely', 'The price doubles'],
      answer_index: 0,
      explanation: 'In technical analysis, a broken support level often acts as a new resistance level.',
    },
  },
  {
    id: 'fundamental-analysis',
    title: 'Intro to Fundamental Analysis',
    category: 'Investing Strategies',
    summary: 'Learn how to evaluate a company’s intrinsic value through financial statements and ratios.',
    read_time: '5 min read',
    difficulty: 'Intermediate',
    objectives: [
      'Understand the difference between P/E, EPS, and Book Value.',
      'Learn how to read a basic balance sheet and income statement.',
      'Determine if a stock is overvalued or undervalued.',
    ],
    content: `
      ### What is Fundamental Analysis?
      Fundamental analysis is the process of evaluating a security to measure its intrinsic value. You study everything from the overall economy and industry conditions, to the financial condition and management of companies.
      
      ### Key Metrics
      - **Earnings Per Share (EPS):** A company's profit divided by the outstanding shares of its common stock.
      - **Price-to-Earnings Ratio (P/E):** The ratio for valuing a company that measures its current share price relative to its EPS.
    `,
    key_takeaways: [
      'Fundamentals focus on the underlying business value.',
      'P/E ratio is a common way to compare valuations across similar companies.',
    ],
    quiz: {
      question: 'Which ratio compares a company\'s share price to its earnings per share?',
      options: ['Debt-to-Equity', 'Current Ratio', 'P/E Ratio', 'ROE'],
      answer_index: 2,
      explanation: 'The Price-to-Earnings (P/E) ratio is calculated by dividing the market price per share by the earnings per share.',
    },
  },
  ...[
    {
      id: 'stop-orders', title: 'Stop-Loss and Stop-Limit Orders', category: 'Order Types & Execution',
      summary: 'See how stop orders can trigger an exit and why a stop price does not always guarantee a fill.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `A stop order stays inactive until the market reaches its trigger price. Once triggered, it becomes the order type you selected. Traders often use stops to define in advance where a trade idea is no longer valid. A stop is a tool, not a guarantee against losses.\n\nStop-market: when the trigger is reached, a market order is sent. It is more likely to execute, but a fast-moving price can produce slippage. Stop-limit: when triggered, a limit order is sent. It controls the worst acceptable price, but the order may remain unfilled if the market moves past that limit.\n\nBefore placing one, check whether the platform supports the order and trigger rules you intend to use. In this paper workspace, treat it as practice and verify the resulting order status in Orders.`,
      key_takeaways: ['A stop price triggers an order; it is not necessarily the execution price.', 'Stop-market favors execution while stop-limit sets a price boundary.', 'Gaps and fast markets can cause slippage or leave a limit order unfilled.'],
      quiz: { question: 'What is a key risk of a stop-limit order?', options: ['It always fills at the stop price', 'It may not fill if price moves beyond its limit', 'It cannot be cancelled', 'It guarantees a maximum loss'], answer_index: 1, explanation: 'A stop-limit becomes a limit order after triggering, and a limit order can remain unfilled.' },
    },
    {
      id: 'day-ioc-validity', title: 'DAY and IOC Order Validity', category: 'Order Types & Execution',
      summary: 'Learn how time-in-force instructions determine whether an order waits or cancels.', read_time: '2 min read', difficulty: 'Beginner' as const,
      content: `An order's validity describes how long it may remain active. A DAY order can rest during the trading session and is typically cancelled when that session ends if it has not filled. It does not mean the order will execute that day.\n\nIOC means Immediate or Cancel. The system attempts to execute the available quantity immediately; any remainder is cancelled. For example, an IOC order for 100 shares might fill 35 and cancel the remaining 65, depending on available matching liquidity and the venue's rules.\n\nAlways read the order confirmation and status. Product availability and exact handling can vary by broker and exchange.`,
      key_takeaways: ['DAY orders can remain pending through the session.', 'IOC attempts an immediate fill and cancels the unfilled remainder.', 'Validity is separate from order price and order side.'],
      quiz: { question: 'An IOC order for 100 shares fills 35 immediately. What happens to the remaining quantity?', options: ['It stays open overnight', 'It is cancelled', 'It converts to a DAY order', 'It doubles'], answer_index: 1, explanation: 'IOC means the immediate fill is attempted and the unfilled remainder is cancelled.' },
    },
    {
      id: 'order-book-liquidity', title: 'Reading the Order Book', category: 'Order Types & Execution',
      summary: 'Understand bids, offers, spread, and visible depth before practicing an order.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `The bid side shows buy orders and the offer (ask) side shows sell orders. The best bid is the highest visible buy price; the best offer is the lowest visible sell price. The difference between them is the bid–ask spread.\n\nDepth shows the quantities displayed at different price levels. More displayed quantity may suggest more visible liquidity, but it does not guarantee that all of it will remain available or that an order will fill. Orders can be cancelled, and the book can change quickly.\n\nA market buy generally matches available offers, while a market sell generally matches bids. A large order may consume multiple levels, which can change its average fill price.`,
      key_takeaways: ['Bids are buyers; offers are sellers.', 'The spread is the gap between best bid and best offer.', 'Displayed depth changes and cannot promise a fill price.'],
      quiz: { question: 'Which side does a market buy generally match against first?', options: ['Best available offers', 'Lowest bids', 'Only closing prices', 'Previous day volume'], answer_index: 0, explanation: 'A buy order matches with sell interest, beginning at the best available offer.' },
    },
    {
      id: 'slippage-execution', title: 'Slippage and Average Fill Price', category: 'Order Types & Execution',
      summary: 'Explore why an order can fill at a different price from the quote you last saw.', read_time: '3 min read', difficulty: 'Intermediate' as const,
      content: `Slippage is the difference between an expected price and the actual execution price. It can occur because quotes update continuously, because the market moves while an order is travelling, or because the displayed quantity is not enough for the whole order.\n\nIf a buy order fills in parts at ₹100, ₹100.10, and ₹100.20, the average fill depends on the quantity filled at each price. This average, rather than a single last-traded price, determines the position's effective entry.\n\nLiquid instruments and limit prices can help manage execution uncertainty, but neither removes market risk. Compare order time, quote, and fills in the order details to understand what happened.`,
      key_takeaways: ['Quotes can change before an order reaches the market.', 'Partial fills at several prices create a weighted average fill.', 'Last traded price is not a guaranteed execution price.'],
      quiz: { question: 'What determines the average price of a multi-part fill?', options: ['The opening price only', 'The quantity-weighted prices of its fills', 'The previous close', 'The highest price in the day'], answer_index: 1, explanation: 'Average fill price weights each executed price by the quantity filled there.' },
    },
    {
      id: 'intraday-lifecycle', title: 'An Intraday Trade From Entry to Exit', category: 'Product Types',
      summary: 'Follow the lifecycle of a practice intraday position and the checks to make before the session ends.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `An intraday trade begins when an entry order receives a fill. Until then, a submitted order may be open, partially filled, rejected, or cancelled. A position exists only for the executed quantity.\n\nAfter entry, track the position quantity, average price, and unrealized profit or loss. Decide in advance what would invalidate the trade and how you plan to exit. An exit order also needs to fill before the position is closed.\n\nIntraday product rules, square-off times, and broker handling vary. Check the product details in the app instead of assuming a fixed time. Quantx simulates orders and does not submit orders to an exchange.`,
      key_takeaways: ['A submitted order is not the same as a filled position.', 'Track filled quantity and average price through the trade.', 'Confirm product-specific exit and square-off rules.'],
      quiz: { question: 'When does an order create an open position?', options: ['As soon as the ticket is opened', 'When some or all quantity is filled', 'When the stock is added to a watchlist', 'At market close'], answer_index: 1, explanation: 'Only executed quantity creates a position; unfilled quantity remains an order.' },
    },
    {
      id: 'charges-turnover', title: 'Order Value, Turnover, and Trading Costs', category: 'Product Types',
      summary: 'Distinguish order value from account cash and learn where transaction costs can affect results.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `Order value is usually price multiplied by quantity. Turnover commonly refers to the total value traded across transactions over a period. These figures are not the same as profit or loss.\n\nReal equity trades can involve brokerage and statutory charges such as exchange transaction charges, taxes, and other levies. The exact calculation depends on the instrument, product, venue, and current rules. Check your broker's current charge schedule and contract note for authoritative amounts.\n\nA paper trading result may omit or approximate these costs. Treat simulated P&L as a learning aid and do not assume it equals a real account's net result.`,
      key_takeaways: ['Order value is price × quantity.', 'Turnover is not the same thing as profit.', 'Check current broker statements for actual charges; simulations may differ.'],
      quiz: { question: 'Does a simulated gross profit necessarily equal real net profit?', options: ['Yes, always', 'No; real costs and execution can differ', 'Only for limit orders', 'Only for large companies'], answer_index: 1, explanation: 'Real execution and charges can differ from a paper simulation.' },
    },
    {
      id: 'market-sessions', title: 'Market Sessions and Order Status', category: 'Product Types',
      summary: 'Learn why market hours, holidays, and order states matter when placing an order.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `Exchanges publish trading sessions, holidays, and special session notices. An order submitted outside an active session may be rejected, queued, or handled according to broker settings. Do not assume the same behavior across platforms.\n\nOrder status tells you what happened: open or pending means it is awaiting execution; partially filled means some quantity traded; filled means the requested quantity executed; cancelled means it will no longer execute; rejected means it was not accepted. Read any rejection reason.\n\nThis workspace generates practice activity locally. Its status labels are for learning and do not represent an exchange connection.`,
      key_takeaways: ['Check official session calendars for current trading times and holidays.', 'Order statuses describe execution progress.', 'Quantx practice statuses are simulated.'],
      quiz: { question: 'What does “partially filled” mean?', options: ['The entire order executed', 'Some quantity executed and some remains', 'The order was rejected', 'The account is closed'], answer_index: 1, explanation: 'A partial fill means only part of the requested quantity has executed so far.' },
    },
    {
      id: 'diversification', title: 'Diversification and Concentration Risk', category: 'Risk & Portfolio Management',
      summary: 'See how spreading exposure can reduce dependence on a single company or sector.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `Diversification means spreading investments across companies, sectors, or asset types whose returns may not move in exactly the same way. It can reduce the impact of a problem specific to one holding.\n\nOwning many stocks does not automatically create diversification if most holdings depend on the same industry, customer, or economic factor. Review both the number of holdings and what risks they share.\n\nDiversification cannot eliminate broad market losses or guarantee returns. It is one part of a plan, alongside time horizon, liquidity needs, and risk tolerance.`,
      key_takeaways: ['Diversification can reduce company-specific concentration.', 'Holdings may share hidden sector or economic risks.', 'Diversification does not prevent all losses.'],
      quiz: { question: 'A portfolio owns ten companies from the same industry. What risk may remain high?', options: ['Concentration in shared sector risks', 'No market risk at all', 'Guaranteed profit risk', 'Currency conversion only'], answer_index: 0, explanation: 'Many holdings can still move together when they share the same sector exposure.' },
    },
    {
      id: 'risk-reward', title: 'Risk-to-Reward Before Entry', category: 'Risk & Portfolio Management',
      summary: 'Compare a planned loss with a possible target before deciding whether a trade fits your rules.', read_time: '3 min read', difficulty: 'Intermediate' as const,
      content: `Risk-to-reward compares the amount you plan to risk with the potential reward in a trade setup. If entry is ₹100, the planned exit for a loss is ₹95, and a target is ₹110, the setup risks ₹5 per share to seek ₹10 per share: a 1:2 risk-to-reward ratio.\n\nThis ratio does not predict whether the target will be reached. A favorable ratio can still lose, and repeated losses are possible. Include fees, slippage, gaps, and the chance that an exit cannot execute at the planned price.\n\nUse the calculation as one decision input, alongside the underlying thesis and a maximum account-risk limit.`,
      key_takeaways: ['Compare potential loss and potential gain using the same units.', 'A ratio is a planning tool, not a probability forecast.', 'Include execution uncertainty and costs.'],
      quiz: { question: 'Entry ₹100, planned stop ₹95, target ₹110. What is the reward-to-risk ratio?', options: ['1:2', '2:1', '1:1', '3:1'], answer_index: 1, explanation: 'The potential reward is ₹10 and risk is ₹5, so reward is twice the risk (2:1).' },
    },
    {
      id: 'drawdown', title: 'Drawdowns and Recovery Math', category: 'Risk & Portfolio Management',
      summary: 'Understand peak-to-trough losses and why recovering from a loss takes a larger percentage gain.', read_time: '3 min read', difficulty: 'Intermediate' as const,
      content: `A drawdown measures a decline from an account's prior peak to a later low. If virtual equity falls from ₹1,00,000 to ₹90,000, the drawdown is 10% from that peak.\n\nLosses and gains are asymmetric: after a 10% loss, ₹90,000 needs an 11.11% gain to return to ₹1,00,000. After a 50% loss, the remaining balance needs a 100% gain to recover.\n\nTracking drawdowns can help you notice when position sizes or repeated decisions are creating too much risk. It does not tell you what a market will do next.`,
      key_takeaways: ['Drawdown is measured from a previous equity peak.', 'A percentage loss requires a larger percentage gain to recover.', 'Monitoring drawdown can support risk discipline.'],
      quiz: { question: 'After a 50% loss, what gain on the remaining balance is needed to recover?', options: ['50%', '75%', '100%', '150%'], answer_index: 2, explanation: 'A balance reduced by half must double, requiring a 100% gain, to reach its starting value.' },
    },
    {
      id: 'cash-and-exposure', title: 'Available Cash and Position Exposure', category: 'Risk & Portfolio Management',
      summary: 'Read the difference between cash, reserved funds, invested value, and total account equity.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `Available cash is the amount not currently committed or reserved for orders, according to the app's accounting rules. An open order can reserve funds before it fills. A filled purchase can reduce cash and create a holding.\n\nAccount equity combines the account's cash and the marked value of holdings, subject to the product's calculation. Market value changes as share prices move, so equity can move even when you do not place a new order.\n\nIn Quantx, all balances and fills are virtual. Review the ledger, open orders, and holdings together when a cash figure changes.`,
      key_takeaways: ['Available cash can exclude funds reserved for open orders.', 'A purchase shifts value from cash into a holding.', 'Virtual equity changes with simulated holding prices.'],
      quiz: { question: 'Why might available cash fall before an order fills?', options: ['Funds may be reserved for the open order', 'The share price deleted the account', 'The watchlist charged a fee', 'Equity always equals zero'], answer_index: 0, explanation: 'The practice account may reserve cash for an unfilled order.' },
    },
    {
      id: 'candlesticks', title: 'Candlestick Anatomy', category: 'Technical Analysis',
      summary: 'Read the open, high, low, and close shown by a candle and understand its limits.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `A candlestick summarizes price action over a selected interval. The body spans the open and close; the upper and lower wicks (shadows) extend to the high and low. A rising candle usually means the close was above the open; a falling candle means it was below. Chart colors can be configured, so check the legend.\n\nA candle tells you what prices were recorded during its interval, but not the exact path or the reasons behind the moves. A short interval can be noisy; a longer interval compresses more activity into each candle.\n\nRead candles with volume, context, and a clear time range. One candle pattern alone does not guarantee a future direction.`,
      key_takeaways: ['Body shows open-to-close range; wicks show high and low.', 'The chosen interval changes what a candle represents.', 'A candle pattern is not a prediction guarantee.'],
      quiz: { question: 'What do a candle’s wicks represent?', options: ['Only the closing price', 'The interval high and low beyond the body', 'Company earnings', 'Number of shareholders'], answer_index: 1, explanation: 'The wick or shadow extends from the body to the interval high and low.' },
    },
    {
      id: 'volume-basics', title: 'Volume: What It Can and Cannot Tell You', category: 'Technical Analysis',
      summary: 'Use traded quantity as context for price moves without treating it as a standalone signal.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `Volume is the quantity traded during a period. Analysts often compare current volume with the instrument's own recent history because typical activity differs by stock and time of day. A price move with unusually high volume may attract attention, but it does not reveal the identity or intention of traders.\n\nVolume can help confirm that a move involved more trading activity than usual. It cannot prove that the move will continue or reverse. Low displayed volume can also reflect incomplete or delayed data.\n\nUse volume alongside price structure and reliable data context. In a simulated workspace, confirm whether the displayed volume is live, delayed, or generated for practice.`,
      key_takeaways: ['Volume measures traded quantity over an interval.', 'Compare volume with the same instrument’s normal activity.', 'Volume alone does not forecast direction.'],
      quiz: { question: 'What is a sensible way to interpret a volume spike?', options: ['It guarantees the price will rise', 'It indicates more activity and needs price/context analysis', 'It proves insider trading', 'It means the market is closed'], answer_index: 1, explanation: 'A volume spike shows increased activity, but its meaning depends on price behavior and context.' },
    },
    {
      id: 'moving-averages', title: 'Moving Averages and Trend Context', category: 'Technical Analysis',
      summary: 'Learn what a moving average smooths and why it reacts more slowly than price.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `A simple moving average (SMA) is the average closing price over a chosen number of periods. A 20-period average on a daily chart uses 20 daily closes; on an hourly chart it uses 20 hourly closes. The same period number therefore means different elapsed time on different chart intervals.\n\nA moving average smooths short-term fluctuations and can help describe trend context. Because it uses past prices, it lags and can give misleading signals in sideways or rapidly changing markets.\n\nTreat crossovers and price interactions as observations to investigate, not automatic buy or sell instructions.`,
      key_takeaways: ['A moving average summarizes past prices over a selected period.', 'Its meaning depends on the chart timeframe.', 'It lags and can whipsaw in choppy markets.'],
      quiz: { question: 'Why does a moving average lag price?', options: ['It is calculated from past observations', 'It predicts tomorrow exactly', 'It excludes all closing prices', 'It is a company balance sheet'], answer_index: 0, explanation: 'A moving average is built from historical prices, so it responds after prices have changed.' },
    },
    {
      id: 'chart-timeframes', title: 'Choosing a Chart Timeframe', category: 'Technical Analysis',
      summary: 'Match chart intervals to the question you are studying and avoid mixing time horizons.', read_time: '2 min read', difficulty: 'Beginner' as const,
      content: `A chart timeframe sets how much time each bar represents. A five-minute candle summarizes five minutes; a daily candle summarizes a full trading day. Shorter intervals reveal more detail but also more noise. Longer intervals show broader movement while hiding intraday swings.\n\nStart with the time horizon of your practice idea. A short-term setup and a long-term investment question need different context. Looking at more than one timeframe can help, but signals may conflict because each summarizes different data.\n\nCheck the selected range and interval before interpreting a chart. Quantx charts may use available historical or simulated data, so inspect the data label and update time.`,
      key_takeaways: ['Each bar summarizes its selected interval.', 'Shorter timeframes contain more detail and noise.', 'Check chart range and data status before drawing conclusions.'],
      quiz: { question: 'What does one daily candlestick generally summarize?', options: ['One trading day', 'One year', 'One order', 'One company report'], answer_index: 0, explanation: 'A daily candle summarizes the prices recorded over a trading day.' },
    },
    {
      id: 'financial-statements', title: 'Income Statement, Balance Sheet, Cash Flow', category: 'Investing Strategies',
      summary: 'Get oriented to the three core financial statements and the different questions they answer.', read_time: '4 min read', difficulty: 'Beginner' as const,
      content: `The income statement reports revenue, expenses, and profit over a period. It helps you ask whether sales and margins are growing, while remembering that accounting profit is not the same as cash received.\n\nThe balance sheet is a snapshot of assets, liabilities, and shareholders' equity at a date. It can help assess resources, debt, and financial structure. The cash flow statement explains cash generated and used by operating, investing, and financing activities.\n\nRead the statements together and compare several periods. Accounting policies, one-off events, and business models affect the figures; no single line item gives a complete view of a company.`,
      key_takeaways: ['Income statement covers performance over a period.', 'Balance sheet shows a point-in-time financial position.', 'Cash flow statement tracks cash sources and uses.'],
      quiz: { question: 'Which statement is primarily a snapshot at a specific date?', options: ['Income statement', 'Balance sheet', 'Cash flow statement', 'Watchlist'], answer_index: 1, explanation: 'The balance sheet reports assets, liabilities, and equity at a particular date.' },
    },
    {
      id: 'pe-ratio-caveats', title: 'Using the P/E Ratio Carefully', category: 'Investing Strategies',
      summary: 'Understand price-to-earnings comparisons and why a low or high P/E does not explain everything.', read_time: '3 min read', difficulty: 'Intermediate' as const,
      content: `The price-to-earnings ratio compares a share price with earnings per share (EPS). A trailing P/E uses reported past earnings; a forward P/E uses estimates, which may not be achieved. Comparisons are most useful among businesses with reasonably similar economics and accounting.\n\nA low P/E can reflect weak growth expectations, cyclically high earnings, debt, or specific risks. A high P/E can reflect expected growth, but it can also leave less room for disappointment. If earnings are zero or negative, the ratio may not be meaningful.\n\nUse P/E with cash flow, debt, margins, business quality, and valuation assumptions. It is a comparison tool, not a standalone buy/sell rule.`,
      key_takeaways: ['Know whether earnings are trailing or forecast.', 'Compare companies with similar business characteristics.', 'P/E alone cannot establish fair value.'],
      quiz: { question: 'Why might a P/E ratio be unhelpful for a company with negative earnings?', options: ['The ratio may not be meaningful', 'It guarantees a bargain', 'It shows the share count', 'It measures trading volume'], answer_index: 0, explanation: 'A price divided by negative or near-zero earnings is difficult to interpret as a conventional valuation multiple.' },
    },
    {
      id: 'dividends-basics', title: 'Dividends and Total Return', category: 'Investing Strategies',
      summary: 'Learn how dividends fit into investment returns and why a payout is never guaranteed.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `A dividend is a distribution a company may make to shareholders, often from profits or reserves. The board and shareholders follow the applicable company process; the amount and timing can change, and dividends are not guaranteed.\n\nTotal return considers both price change and cash distributions over a period, with details depending on whether distributions are reinvested and how taxes and costs are treated. On an ex-dividend date, the market price may adjust, though actual price movement also reflects broader market forces.\n\nReview the company's cash generation, payout history, and plans rather than selecting a share only for a recent yield. A high yield can signal risk as well as income potential.`,
      key_takeaways: ['Companies can change or omit dividends.', 'Total return includes price movement and distributions.', 'Yield should be evaluated with business and payout sustainability.'],
      quiz: { question: 'Are future dividends guaranteed because a company paid one last year?', options: ['Yes', 'No, payouts can change or stop', 'Only for small companies', 'Only when share prices fall'], answer_index: 1, explanation: 'A past dividend does not obligate a company to make the same future payment.' },
    },
    {
      id: 'etfs-and-shares', title: 'ETFs and Individual Shares', category: 'Investing Strategies',
      summary: 'Compare owning a basket through an ETF with selecting individual company shares.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `An exchange-traded fund (ETF) is a fund whose units trade on an exchange. Many ETFs hold a basket designed to track an index, sector, or other strategy, though fund structures and holdings vary. An individual share represents an ownership interest in one company.\n\nA broad ETF can spread company-specific exposure across holdings, but it still carries market, sector, tracking, liquidity, and other risks. An individual share gives more direct exposure to one business and usually more company-specific concentration.\n\nCheck the fund's objective, holdings, costs, tracking approach, and liquidity documents. Do not assume every ETF is broadly diversified or low risk.`,
      key_takeaways: ['An ETF is a fund unit traded on an exchange.', 'ETF exposures vary; inspect the actual holdings and objective.', 'An individual share concentrates exposure in one company.'],
      quiz: { question: 'What should you check before assuming an ETF is diversified?', options: ['Its holdings and stated objective', 'Its ticker length', 'Only its latest price', 'Whether it has a colorful logo'], answer_index: 0, explanation: 'An ETF may focus narrowly, so its objective and holdings determine its actual exposure.' },
    },
    {
      id: 'trading-investing-horizons', title: 'Trading vs Investing Time Horizons', category: 'Investing Strategies',
      summary: 'Separate short-term trade planning from long-term ownership decisions.', read_time: '3 min read', difficulty: 'Beginner' as const,
      content: `Trading and investing can both involve shares, but they often use different time horizons and decision processes. A trade plan may focus on a defined setup, entry, invalidation point, and exit. An investment thesis may focus on business fundamentals, valuation, portfolio role, and a longer review horizon.\n\nNeither label removes risk. Short-term activity can be affected by volatility and execution; long-term ownership can still lose value or face a changed business outlook. Time horizon should fit your goals, liquidity needs, and ability to tolerate losses.\n\nWrite down why you entered and what evidence would change your view. Revisit the plan consistently rather than changing horizons impulsively after a price move.`,
      key_takeaways: ['Decisions should fit a stated time horizon and plan.', 'Both trading and investing involve risk of loss.', 'Define what evidence would change your thesis.'],
      quiz: { question: 'What is a useful practice for either a trade or investment?', options: ['Change the plan after every price tick', 'Write down the thesis and review conditions', 'Ignore liquidity needs', 'Assume past returns repeat'], answer_index: 1, explanation: 'A written thesis and review conditions help keep decisions tied to a plan.' },
    },
  ].map((item) => ({
    ...item,
    objectives: [
      `Explain the core ideas behind ${item.title.toLowerCase()}.`,
      'Identify the main risks and limitations of the concept.',
      'Apply the concept when reviewing a Quantx practice account or chart.',
    ],
  })),
];

export function LearnPage() {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const categories = ['ALL', 'Order Types & Execution', 'Product Types', 'Risk & Portfolio Management', 'Technical Analysis', 'Investing Strategies'];

  const filtered = sampleLessons.filter(
    (l) => selectedCategory === 'ALL' || l.category === selectedCategory
  );

  return (
    <>
      <PageHeader
        title="Learning Modules"
        eyebrow="QUANTX ACADEMY"
        description="Build practical market knowledge with short lessons on orders, risk, charts, and investing."
        breadcrumbs={[{ label: 'Learn' }]}
      />

      {/* Category Pills */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
              selectedCategory === cat ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Lesson Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((lesson) => (
          <article
            key={lesson.id}
            onClick={() => navigate(`/learn/${lesson.id}`)}
            className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 cursor-pointer hover:border-emerald-300 hover:shadow-md transition-all flex flex-col justify-between group"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{lesson.category}</span>
                <span className="flex items-center gap-1 text-slate-500"><Clock size={13} /> {lesson.read_time}</span>
              </div>
              <h3 className="text-base font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">
                {lesson.title}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                {lesson.summary}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-emerald-600 font-semibold">
              <span>Read lesson</span>
              <ArrowRight size={15} className="group-hover:translate-x-1 transition-transform" />
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
