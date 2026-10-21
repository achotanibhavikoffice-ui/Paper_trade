import { useEffect, useState, useRef } from 'react';
import {
  Zap,
  ShieldAlert,
  Flame,
  Activity,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Info,
  CheckCircle2,
  Sliders,
  BarChart3,
  Layers,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  whatIfApi,
  marketDataApi,
  type PortfolioBaseline,
  type MarketStressStateResponse,
} from '../api';
import { PageHeader } from '../components/common/PageHeader';

function num(val: any): number {
  if (val === null || val === undefined) return 0;
  const parsed = typeof val === 'number' ? val : parseFloat(String(val));
  return isNaN(parsed) ? 0 : parsed;
}

function formatMoney(val: any): string {
  return num(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Default fallback blue-chip dataset for immediate rich demonstration
const DEMO_HOLDINGS_BASE = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd.', quantity: 50, average_price: 2800.00, base_price: 2850.00 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', quantity: 30, average_price: 3850.00, base_price: 3920.00 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd.', quantity: 100, average_price: 1500.00, base_price: 1540.00 },
  { symbol: 'INFYS', name: 'Infosys Ltd.', quantity: 60, average_price: 1650.00, base_price: 1680.00 },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd.', quantity: 80, average_price: 900.00, base_price: 940.00 },
];

export function MarketStressPage() {
  const [stressState, setStressState] = useState<MarketStressStateResponse | null>(null);
  const [toggling, setToggling] = useState(false);
  const [baseline, setBaseline] = useState<PortfolioBaseline | null>(null);
  const [marketQuotes, setMarketQuotes] = useState<Record<string, any>>({});
  const [lastTickTime, setLastTickTime] = useState<string>('');

  const timerRef = useRef<any>(null);

  useEffect(() => {
    loadAllData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Poll for quote updates every 2 seconds when stress mode is active to show live fluctuating ticks
  useEffect(() => {
    if (stressState?.enabled) {
      timerRef.current = setInterval(() => {
        refreshQuotes();
      }, 2000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stressState?.enabled]);

  async function loadAllData() {
    try {
      const [st, bl, quotes] = await Promise.all([
        whatIfApi.getStressModeState().catch(() => null),
        whatIfApi.getBaseline().catch(() => null),
        marketDataApi.getQuotes().catch(() => ({})),
      ]);
      if (st) setStressState(st);
      if (bl) setBaseline(bl);
      if (quotes) setMarketQuotes(quotes);
      setLastTickTime(new Date().toLocaleTimeString());
    } catch {
      /* ignore init errors */
    }
  }

  async function refreshQuotes() {
    try {
      const [bl, st, quotes] = await Promise.all([
        whatIfApi.getBaseline().catch(() => null),
        whatIfApi.getStressModeState().catch(() => null),
        marketDataApi.getQuotes().catch(() => ({})),
      ]);
      if (bl) setBaseline(bl);
      if (st) setStressState(st);
      if (quotes) setMarketQuotes(quotes);
      setLastTickTime(new Date().toLocaleTimeString());
    } catch {
      /* ignore polling errors */
    }
  }

  async function handleToggleMode(enabled: boolean, level: 'mild' | 'high' | 'panic' = 'high') {
    setToggling(true);
    try {
      const updated = await whatIfApi.toggleStressMode({ enabled, level });
      setStressState(updated);
      await refreshQuotes();
    } catch (err: any) {
      alert(err.message || 'Failed to update Market Stress mode');
    } finally {
      setToggling(false);
    }
  }

  // Determine whether to render user's actual portfolio holdings or fallback demo holdings
  const hasUserHoldings = baseline && baseline.holdings && baseline.holdings.length > 0;

  const displayHoldings = hasUserHoldings
    ? baseline.holdings.map((h) => ({
        symbol: h.symbol,
        name: h.name,
        quantity: h.quantity,
        average_price: num(h.average_price),
        current_price: num(h.current_price),
        quote_source: h.quote_source,
      }))
    : DEMO_HOLDINGS_BASE.map((demo) => {
        const liveQ = marketQuotes[demo.symbol];
        const currentPrice = liveQ ? num(liveQ.price) : demo.base_price;
        const source = liveQ?.source || (stressState?.enabled ? 'stressed' : 'cached');
        return {
          symbol: demo.symbol,
          name: demo.name,
          quantity: demo.quantity,
          average_price: demo.average_price,
          current_price: currentPrice > 0 ? currentPrice : demo.base_price,
          quote_source: source,
        };
      });

  // Calculate live portfolio summary totals
  let totalHoldingsValue = 0;
  let totalUnrealizedPnl = 0;

  displayHoldings.forEach((h) => {
    const val = h.current_price * h.quantity;
    const cost = h.average_price * h.quantity;
    totalHoldingsValue += val;
    totalUnrealizedPnl += val - cost;
  });

  // VIX color mapping
  const vixValue = stressState?.vix_index ?? 14.5;
  const isPanic = stressState?.enabled && stressState.level === 'panic';
  const isHigh = stressState?.enabled && stressState.level === 'high';

  const vixColorClass = !stressState?.enabled
    ? 'text-emerald-800 bg-emerald-500/10 border-emerald-500/30'
    : isPanic
    ? 'text-rose-500 bg-rose-500/20 border-rose-500/40 animate-pulse'
    : isHigh
    ? 'text-amber-600 bg-amber-500/20 border-amber-500/40'
    : 'text-black bg-blue-500/20 border-blue-500/40';

  return (
    <div className="trade-page space-y-6 pb-12">
      <PageHeader
        title="Market Stress Mode (USP)"
        eyebrow="REAL-TIME VOLATILITY SIMULATOR"
        description="Amplify market volatility on incoming data feeds to stress-test portfolio resilience in real time."
        breadcrumbs={[{ label: 'Market Stress' }]}
        actions={
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-bold ${
                stressState?.enabled
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30'
              }`}
            >
              <Zap size={14} className={stressState?.enabled ? 'animate-bounce' : ''} />
              STRESS MODE: {stressState?.enabled ? `ACTIVE (${stressState.level.toUpperCase()})` : 'DISABLED (NORMAL)'}
            </span>
          </div>
        }
      />

      {/* Feature Logic & Formula Banner */}
      <div className="trade-panel bg-gradient-to-r from-blue-50/50 to-white border-blue-100">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-black shrink-0">
            <Sparkles size={22} />
          </div>
          <div className="space-y-2 text-xs">
            <h3 className="text-sm font-bold text-black flex items-center gap-2">
              How Market Stress Engine Works
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-700 font-mono">
                Real-Time Volatility Transformation
              </span>
            </h3>
            <p className="text-black leading-relaxed">
              Market Stress transforms incoming stock quote feeds in memory by applying deterministic harmonic sine waves
              coupled with random drift: $S_t = S_0 \times (1 + \sin(\omega t + \phi) \cdot \sigma \cdot M + \epsilon)$.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-[11px]">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <strong className="text-black flex items-center gap-1.5">
                  <Activity size={13} className="text-black" /> 1. Live Feed Ingestion
                </strong>
                <p className="text-black">
                  Intercepts live and cached stock quotes without changing actual paper balances or trade execution.
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <strong className="text-black flex items-center gap-1.5">
                  <Flame size={13} className="text-amber-600" /> 2. Multiplicative Swings
                </strong>
                <p className="text-black">
                  Applies scaling multipliers (1.8x to 5.0x) generating $\pm 2\%$ to $\pm 10\%$ rapid tick movements.
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <strong className="text-black flex items-center gap-1.5">
                  <ShieldAlert size={13} className="text-rose-600" /> 3. Real-Time Portfolio Impact
                </strong>
                <p className="text-black">
                  Recalculates position values and unrealized P&L dynamically on every incoming tick.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Control Console & Quantx VIX Meter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Control Panel */}
        <div className="trade-panel space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="text-sm font-semibold text-black flex items-center gap-2">
              <Sliders size={16} className="text-black" /> Mode Controls
            </h3>
            {lastTickTime && (
              <span className="text-[11px] text-black flex items-center gap-1">
                <RefreshCw size={11} className={stressState?.enabled ? 'animate-spin text-black' : ''} />
                Tick: {lastTickTime}
              </span>
            )}
          </div>

          {/* Master Toggle */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-black uppercase">Master Stress Switch</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleToggleMode(false)}
                disabled={toggling}
                className={`py-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                  !stressState?.enabled
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-900/30'
                    : 'bg-slate-50 border-slate-200 text-black hover:text-black'
                }`}
              >
                <CheckCircle2 size={16} />
                OFF (Normal Data)
              </button>
              <button
                onClick={() => handleToggleMode(true, stressState?.level || 'high')}
                disabled={toggling}
                className={`py-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                  stressState?.enabled
                    ? 'bg-rose-600 text-black border-rose-500 shadow-lg shadow-rose-900/30'
                    : 'bg-slate-50 border-slate-200 text-black hover:text-black'
                }`}
              >
                <Flame size={16} className={stressState?.enabled ? 'animate-bounce' : ''} />
                ON (Fluctuating Data)
              </button>
            </div>
          </div>

          {/* Intensity Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-black uppercase">Stress Intensity Level</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleToggleMode(true, 'mild')}
                disabled={toggling || !stressState?.enabled}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  stressState?.enabled && stressState.level === 'mild'
                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-700 font-bold'
                    : 'bg-slate-50 border-slate-200 text-black hover:border-slate-700 disabled:opacity-40'
                }`}
              >
                <span className="block text-xs">MILD</span>
                <span className="block text-[10px] text-black font-mono mt-0.5">1.8x Volatility</span>
              </button>
              <button
                onClick={() => handleToggleMode(true, 'high')}
                disabled={toggling || !stressState?.enabled}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  stressState?.enabled && stressState.level === 'high'
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                    : 'bg-slate-50 border-slate-200 text-black hover:border-slate-700 disabled:opacity-40'
                }`}
              >
                <span className="block text-xs">HIGH</span>
                <span className="block text-[10px] text-black font-mono mt-0.5">3.5x Volatility</span>
              </button>
              <button
                onClick={() => handleToggleMode(true, 'panic')}
                disabled={toggling || !stressState?.enabled}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  stressState?.enabled && stressState.level === 'panic'
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 font-bold animate-pulse'
                    : 'bg-slate-50 border-slate-200 text-black hover:border-slate-700 disabled:opacity-40'
                }`}
              >
                <span className="block text-xs">PANIC</span>
                <span className="block text-[10px] text-black font-mono mt-0.5">5.0x Swings</span>
              </button>
            </div>
          </div>

          <div className="pt-2 text-[11px] text-black border-t border-slate-200 flex items-center justify-between">
            <span>Status Message:</span>
            <span className="text-black font-mono text-[10px] text-right max-w-[200px]">
              {stressState?.message || 'Ready'}
            </span>
          </div>
        </div>

        {/* Quantx VIX Fear Index Meter */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white/80 p-5 space-y-4 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 size={18} className="text-amber-600" />
              <h3 className="text-sm font-semibold text-black">Quantx VIX Fear Index Meter</h3>
            </div>
            <span className={`px-2.5 py-1 rounded-full border text-xs font-mono font-bold ${vixColorClass}`}>
              VIX: {vixValue.toFixed(1)}
            </span>
          </div>

          {/* VIX Bar Visualizer */}
          <div className="space-y-3 py-2">
            <div className="flex justify-between text-xs text-black font-medium">
              <span>Implied Market Turbulence Score</span>
              <span className="font-mono">
                {vixValue < 20
                  ? 'Calm Market (10-20)'
                  : vixValue < 35
                  ? 'Elevated Risk (20-35)'
                  : vixValue < 50
                  ? 'High Volatility (35-50)'
                  : 'Panic & Crash (50-80+)'}
              </span>
            </div>
            <div className="h-4 bg-slate-50 rounded-full border border-slate-200 overflow-hidden p-0.5 relative">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  vixValue < 20
                    ? 'bg-emerald-500'
                    : vixValue < 35
                    ? 'bg-blue-500'
                    : vixValue < 50
                    ? 'bg-amber-500'
                    : 'bg-rose-600 animate-pulse'
                }`}
                style={{ width: `${Math.min(100, (vixValue / 80) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-black font-mono">
              <span>10.0 Base</span>
              <span>25.0 Mild</span>
              <span>45.0 High</span>
              <span>75.0 Panic</span>
            </div>
          </div>

          {/* Alert Banner when Panic mode is active */}
          {isPanic && (
            <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-3 animate-pulse">
              <AlertTriangle size={18} className="shrink-0 text-rose-600" />
              <div>
                <strong>SIMULATED MARGIN RISK WARNING:</strong> Panic stress mode active! High portfolio drawdown detected. Simulated margin maintenance threshold at risk.
              </div>
            </div>
          )}

          {!stressState?.enabled && (
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 text-black text-xs flex items-center gap-2">
              <Info size={15} className="text-black shrink-0" />
              <span>Turn Market Stress ON using the switch to see live stock quotes fluctuate sharply in real-time.</span>
            </div>
          )}
        </div>
      </div>

      {/* Real-Time Stressed Portfolio Live Monitor */}
      <div className="rounded-xl border border-slate-200 bg-white/80 p-6 space-y-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-black flex items-center gap-2">
                <Layers size={18} className="text-black" />
                Stressed Portfolio Live Monitor
              </h3>
              {!hasUserHoldings && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  DEMO PORTFOLIO ACTIVE (5 POSITIONS)
                </span>
              )}
            </div>
            <p className="text-xs text-black mt-0.5">
              Observe how open portfolio holdings fluctuate live in real-time when Market Stress is applied.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-black text-[10px] block uppercase font-sans">Holdings Value</span>
              <strong className="text-black font-mono">₹{formatMoney(totalHoldingsValue)}</strong>
            </div>
            <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <span className="text-black text-[10px] block uppercase font-sans">Simulated P&L</span>
              <strong className={totalUnrealizedPnl >= 0 ? 'text-emerald-800' : 'text-rose-600'}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}₹{formatMoney(totalUnrealizedPnl)}
              </strong>
            </div>
          </div>
        </div>

        {/* Holdings Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase text-black font-semibold bg-slate-50/60">
                <th className="py-3 px-4">Instrument</th>
                <th className="py-3 px-4 text-right">Quantity</th>
                <th className="py-3 px-4 text-right">Avg Price</th>
                <th className="py-3 px-4 text-right">Current Price</th>
                <th className="py-3 px-4 text-right">Feed Source</th>
                <th className="py-3 px-4 text-right">Position Value</th>
                <th className="py-3 px-4 text-right">Unrealized P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {displayHoldings.map((h) => {
                const posValue = h.current_price * h.quantity;
                const costValue = h.average_price * h.quantity;
                const pnl = posValue - costValue;
                const pnlPct = costValue > 0 ? (pnl / costValue) * 100 : 0;

                return (
                  <tr key={h.symbol} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-sans font-semibold text-black">
                      {h.symbol}
                      <span className="block text-[10px] font-normal text-black">{h.name}</span>
                    </td>
                    <td className="py-3 px-4 text-right text-black">{h.quantity}</td>
                    <td className="py-3 px-4 text-right text-black">₹{formatMoney(h.average_price)}</td>
                    <td className="py-3 px-4 text-right font-bold text-black">
                      ₹{formatMoney(h.current_price)}
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      <span
                        className={`inline-block text-[10px] px-2 py-0.5 rounded border ${
                          h.quote_source === 'stressed'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse'
                            : 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20'
                        }`}
                      >
                        {h.quote_source === 'stressed' ? '● Stressed Feed' : '○ Normal Feed'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-black">₹{formatMoney(posValue)}</td>
                    <td
                      className={`py-3 px-4 text-right font-bold ${
                        pnl >= 0 ? 'text-emerald-800' : 'text-rose-600'
                      }`}
                    >
                      {pnl >= 0 ? '+' : ''}₹{formatMoney(pnl)} ({pnlPct >= 0 ? '+' : ''}
                      {pnlPct.toFixed(2)}%)
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Market Instrument Ticker Stream */}
      <div className="rounded-xl border border-slate-200 bg-white/80 p-5 space-y-4 shadow-sm">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <h3 className="text-sm font-semibold text-black flex items-center gap-2">
            <Activity size={16} className="text-black" /> Live Market Ticker Stream (10 Blue-Chips)
          </h3>
          <span className="text-[11px] text-black font-mono">
            {stressState?.enabled ? `Fluctuating at ${stressState.multiplier}x multiplier` : 'Standard Feeds'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
          {Object.keys(marketQuotes).length > 0 ? (
            Object.values(marketQuotes).slice(0, 10).map((q: any) => {
              const price = num(q.price);
              const changePct = num(q.change_percent);
              const isUp = changePct >= 0;

              return (
                <div key={q.symbol} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                  <div className="flex justify-between items-center font-sans font-semibold text-black">
                    <span>{q.symbol}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-mono flex items-center gap-0.5 ${
                        isUp ? 'bg-emerald-500/10 text-emerald-800' : 'bg-rose-500/10 text-rose-600'
                      }`}
                    >
                      {isUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {isUp ? '+' : ''}{changePct.toFixed(2)}%
                    </span>
                  </div>
                  <div className="text-black font-mono font-bold text-sm">₹{formatMoney(price)}</div>
                  <div className="flex justify-between text-[10px] text-black font-sans">
                    <span>Source:</span>
                    <span className={q.source === 'stressed' ? 'text-rose-600 font-bold' : 'text-black'}>
                      {q.source || 'cached'}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            DEMO_HOLDINGS_BASE.map((demo) => (
              <div key={demo.symbol} className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
                <div className="flex justify-between items-center font-sans font-semibold text-black">
                  <span>{demo.symbol}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-emerald-500/10 text-emerald-800">
                    +0.50%
                  </span>
                </div>
                <div className="text-black font-mono font-bold text-sm">₹{formatMoney(demo.base_price)}</div>
                <div className="text-[10px] text-black font-sans">Source: cached</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
