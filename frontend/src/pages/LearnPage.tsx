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
        description="Master stock market mechanics, order types, and risk management with 60-second lessons."
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
