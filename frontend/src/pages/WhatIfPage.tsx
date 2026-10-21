import { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bookmark,
  Layers,
  RefreshCw,
  Save,
  ShieldAlert,
  Sliders,
  Sparkles,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import {
  whatIfApi,
  type PortfolioBaseline,
  type SingleStockResult,
  type StressTestResult,
  type AllocationResult,
  type SavedScenario,
  type ScenarioCompareResponse,
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

function formatNum(val: any, decimals = 2): string {
  return num(val).toFixed(decimals);
}

export function WhatIfPage() {
  const location = useLocation();

  const queryParams = new URLSearchParams(location.search);
  const initialSymbol = queryParams.get('symbol') || 'RELIANCE';
  const initialMode = (queryParams.get('mode') as 'stock' | 'stress' | 'allocation') || 'stock';

  const [activeTab, setActiveTab] = useState<'stock' | 'stress' | 'allocation'>(initialMode);
  const [baseline, setBaseline] = useState<PortfolioBaseline | null>(null);
  const [loadingBaseline, setLoadingBaseline] = useState(true);

  // Single Stock Form State
  const [stockSymbol, setStockSymbol] = useState(initialSymbol.toUpperCase());
  const [inputMode, setInputMode] = useState<'amount' | 'quantity'>('amount');
  const [investmentAmount, setInvestmentAmount] = useState('10000');
  const [quantity, setQuantity] = useState('10');
  const [useManualEntryPrice, setUseManualEntryPrice] = useState(false);
  const [manualEntryPrice, setManualEntryPrice] = useState('');
  const [futurePriceMode, setFuturePriceMode] = useState<'percent' | 'manual'>('percent');
  const [futureShiftPercent, setFutureShiftPercent] = useState(10);
  const [manualFuturePrice, setManualFuturePrice] = useState('');
  const [holdingPeriod, setHoldingPeriod] = useState('1 Month');

  // Stress Test Form State
  const [globalShift, setGlobalShift] = useState(-10);
  const [presetName, setPresetName] = useState('Mild Correction (-10%)');
  const [stockShifts, setStockShifts] = useState<Record<string, number>>({});

  // Allocation Form State
  const [allocSymbol, setAllocSymbol] = useState('TCS');
  const [allocAction, setAllocAction] = useState<'BUY' | 'SELL'>('BUY');
  const [allocQuantity, setAllocQuantity] = useState('10');
  const [allocManualPrice, setAllocManualPrice] = useState('');

  // Results State
  const [stockResult, setStockResult] = useState<SingleStockResult | null>(null);
  const [stressResult, setStressResult] = useState<StressTestResult | null>(null);
  const [allocResult, setAllocResult] = useState<AllocationResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Saved Scenarios State
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [loadingScenarios, setLoadingScenarios] = useState(false);

  // Save Modal State
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [scenarioNameInput, setScenarioNameInput] = useState('');

  // Comparison State
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [comparisonResult, setComparisonResult] = useState<ScenarioCompareResponse | null>(null);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  // Fetch baseline & scenarios
  useEffect(() => {
    fetchBaseline();
    fetchScenarios();
  }, []);

  function fetchBaseline() {
    setLoadingBaseline(true);
    whatIfApi
      .getBaseline()
      .then((b) => setBaseline(b))
      .catch(() => {})
      .finally(() => setLoadingBaseline(false));
  }

  function fetchScenarios() {
    setLoadingScenarios(true);
    whatIfApi
      .getScenarios()
      .then((sc) => {
        if (Array.isArray(sc)) setSavedScenarios(sc);
      })
      .catch(() => {})
      .finally(() => setLoadingScenarios(false));
  }

  // Run Single Stock Simulation
  async function handleRunSingleStock() {
    setSimulating(true);
    setSimError(null);
    try {
      const payload: any = {
        symbol: stockSymbol,
        holding_period_label: holdingPeriod,
      };
      if (inputMode === 'amount') {
        payload.investment_amount = Number(investmentAmount) || 10000;
      } else {
        payload.quantity = Number(quantity) || 10;
      }
      if (useManualEntryPrice && manualEntryPrice) {
        payload.manual_purchase_price = Number(manualEntryPrice);
      }
      if (futurePriceMode === 'percent') {
        payload.future_shift_percent = futureShiftPercent;
      } else if (manualFuturePrice) {
        payload.manual_future_price = Number(manualFuturePrice);
      }

      const res = await whatIfApi.simulateStock(payload);
      setStockResult(res);
    } catch (err: any) {
      setSimError(err.message || 'Simulation failed');
    } finally {
      setSimulating(false);
    }
  }

  // Run Stress Test Simulation
  async function handleRunStressTest() {
    setSimulating(true);
    setSimError(null);
    try {
      const res = await whatIfApi.simulateStress({
        global_shift_percent: globalShift,
        stock_shifts: stockShifts,
        preset_name: presetName,
      });
      setStressResult(res);
    } catch (err: any) {
      setSimError(err.message || 'Stress test failed');
    } finally {
      setSimulating(false);
    }
  }

  // Run Allocation Simulation
  async function handleRunAllocation() {
    setSimulating(true);
    setSimError(null);
    try {
      const payload: any = {
        symbol: allocSymbol,
        action: allocAction,
        quantity: Number(allocQuantity) || 10,
      };
      if (allocManualPrice) {
        payload.manual_price = Number(allocManualPrice);
      }

      const res = await whatIfApi.simulateAllocation(payload);
      setAllocResult(res);
    } catch (err: any) {
      setSimError(err.message || 'Allocation simulation failed');
    } finally {
      setSimulating(false);
    }
  }

  // Preset buttons handler
  function applyPreset(name: string, shift: number) {
    setPresetName(name);
    setGlobalShift(shift);
    setStockShifts({});
  }

  // Save Scenario
  async function handleSaveCurrentScenario() {
    if (!scenarioNameInput.trim()) return;
    try {
      let inputs: any = {};
      let assumptions: string[] = [];
      let result: any = {};

      if (activeTab === 'stock' && stockResult) {
        inputs = { symbol: stockSymbol, mode: inputMode, investmentAmount, quantity, holdingPeriod };
        assumptions = stockResult.assumptions;
        result = stockResult;
      } else if (activeTab === 'stress' && stressResult) {
        inputs = { globalShift, presetName, stockShifts };
        assumptions = stressResult.assumptions;
        result = stressResult;
      } else if (activeTab === 'allocation' && allocResult) {
        inputs = { symbol: allocSymbol, action: allocAction, quantity: allocQuantity };
        assumptions = allocResult.assumptions;
        result = allocResult;
      }

      await whatIfApi.saveScenario({
        name: scenarioNameInput.trim(),
        scenario_type: activeTab === 'stock' ? 'single_stock' : activeTab === 'stress' ? 'portfolio_stress' : 'allocation',
        inputs,
        assumptions,
        baseline_snapshot: baseline || {},
        result,
      });

      setSaveModalOpen(false);
      setScenarioNameInput('');
      fetchScenarios();
    } catch (err: any) {
      alert(err.message || 'Failed to save scenario.');
    }
  }

  // Delete Scenario
  async function handleDeleteScenario(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this saved scenario?')) return;
    try {
      await whatIfApi.deleteScenario(id);
      setSelectedForCompare((prev) => prev.filter((i) => i !== id));
      fetchScenarios();
    } catch (err: any) {
      alert(err.message || 'Failed to delete scenario.');
    }
  }

  // Compare Scenarios
  async function handleRunComparison() {
    if (selectedForCompare.length === 0) return;
    try {
      const res = await whatIfApi.compareScenarios({ scenario_ids: selectedForCompare });
      setComparisonResult(res);
      setCompareModalOpen(true);
    } catch (err: any) {
      alert(err.message || 'Failed to run scenario comparison.');
    }
  }

  function toggleCompareSelect(id: string) {
    if (selectedForCompare.includes(id)) {
      setSelectedForCompare((prev) => prev.filter((i) => i !== id));
    } else {
      if (selectedForCompare.length >= 3) {
        alert('You can select a maximum of 3 scenarios to compare.');
        return;
      }
      setSelectedForCompare((prev) => [...prev, id]);
    }
  }

  return (
    <>
      <PageHeader
        title="What-If Lab"
        eyebrow="FINANCIAL SIMULATION ENGINE"
        description="Explore hypothetical market moves and understand their impact before making a decision."
        breadcrumbs={[{ label: 'What-If Lab' }]}
        actions={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/30 text-xs font-semibold">
              <ShieldAlert size={14} />
              SIMULATION ONLY — NO ORDERS EXECUTED
            </span>
          </div>
        }
      />

      {/* Baseline Summary Bar */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2 text-xs text-black">
            <Wallet size={16} className="text-teal-400" />
            <span className="font-semibold text-black">PORTFOLIO BASELINE</span>
            {baseline?.valuation_timestamp && (
              <span className="text-[11px] text-black">
                • Valuation as of {new Date(baseline.valuation_timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
              baseline?.quotes_status === 'live'
                ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20'
                : 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20'
            }`}>
              {baseline?.quotes_status === 'live' ? '● Live Quotes' : '○ Normalized Quotes'}
            </span>
            <button
              onClick={fetchBaseline}
              className="p-1 rounded bg-slate-800 text-black hover:text-black transition-colors"
              title="Refresh Baseline Data"
            >
              <RefreshCw size={13} className={loadingBaseline ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-3 text-xs">
          <div>
            <span className="block text-[10px] uppercase text-black font-semibold">Virtual Cash</span>
            <strong className="text-black text-sm font-mono">
              ₹{baseline ? formatMoney(baseline.cash_balance) : '100,000.00'}
            </strong>
          </div>
          <div>
            <span className="block text-[10px] uppercase text-black font-semibold">Holdings Value</span>
            <strong className="text-black text-sm font-mono">
              ₹{baseline ? formatMoney(baseline.holdings_value) : '0.00'}
            </strong>
          </div>
          <div>
            <span className="block text-[10px] uppercase text-black font-semibold">Total Portfolio</span>
            <strong className="text-black text-sm font-mono">
              ₹{baseline ? formatMoney(baseline.total_portfolio_value) : '100,000.00'}
            </strong>
          </div>
          <div>
            <span className="block text-[10px] uppercase text-black font-semibold">Unrealised P&L</span>
            <strong
              className={`text-sm font-mono ${
                num(baseline?.unrealized_pnl) >= 0 ? 'text-emerald-800' : 'text-rose-600'
              }`}
            >
              {num(baseline?.unrealized_pnl) >= 0 ? '+' : ''}
              ₹{baseline ? formatMoney(baseline.unrealized_pnl) : '0.00'}
            </strong>
          </div>
          <div>
            <span className="block text-[10px] uppercase text-black font-semibold">Holdings</span>
            <strong className="text-black text-sm font-mono">
              {baseline ? baseline.holdings_count : 0} positions
            </strong>
          </div>
        </div>
      </div>

      {/* Main Lab Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Scenario Builder */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white/60 p-5 space-y-5">
            <h3 className="text-sm font-semibold text-black flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sliders size={16} className="text-emerald-800" /> Scenario Builder
              </span>
              <span className="text-[10px] text-black uppercase">Configuration</span>
            </h3>

            {/* Scenario Type Selector Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-black">
              <button
                onClick={() => setActiveTab('stock')}
                className={`py-1.5 rounded transition-colors ${
                  activeTab === 'stock' ? 'bg-emerald-600 text-white' : 'hover:text-black'
                }`}
              >
                Stock
              </button>
              <button
                onClick={() => setActiveTab('stress')}
                className={`py-1.5 rounded transition-colors ${
                  activeTab === 'stress' ? 'bg-emerald-600 text-white' : 'hover:text-black'
                }`}
              >
                Stress Test
              </button>
              <button
                onClick={() => setActiveTab('allocation')}
                className={`py-1.5 rounded transition-colors ${
                  activeTab === 'allocation' ? 'bg-emerald-600 text-white' : 'hover:text-black'
                }`}
              >
                Allocation
              </button>
            </div>

            {/* TAB 1: Single Stock Investment */}
            {activeTab === 'stock' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black uppercase mb-1">Target Instrument</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={stockSymbol}
                      onChange={(e) => setStockSymbol(e.target.value.toUpperCase())}
                      placeholder="Enter Symbol (e.g. RELIANCE, TCS)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-black focus:outline-none focus:border-emerald-500 uppercase"
                    />
                  </div>
                </div>

                {/* Investment Input Mode Toggle */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-black uppercase mb-1">
                    <span>Investment Input</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setInputMode('amount')}
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          inputMode === 'amount' ? 'bg-emerald-500/20 text-emerald-800 font-bold' : 'text-black'
                        }`}
                      >
                        Amount (₹)
                      </button>
                      <button
                        onClick={() => setInputMode('quantity')}
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          inputMode === 'quantity' ? 'bg-emerald-500/20 text-emerald-800 font-bold' : 'text-black'
                        }`}
                      >
                        Quantity
                      </button>
                    </div>
                  </div>

                  {inputMode === 'amount' ? (
                    <input
                      type="number"
                      value={investmentAmount}
                      onChange={(e) => setInvestmentAmount(e.target.value)}
                      placeholder="Investment amount (₹)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-black focus:outline-none focus:border-emerald-500"
                    />
                  ) : (
                    <input
                      type="number"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="Share quantity"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-black focus:outline-none focus:border-emerald-500"
                    />
                  )}
                </div>

                {/* Purchase Price Assumption */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-black uppercase mb-1">
                    <span>Entry Price Source</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-black">
                      <input
                        type="checkbox"
                        checked={useManualEntryPrice}
                        onChange={(e) => setUseManualEntryPrice(e.target.checked)}
                        className="rounded bg-slate-50 border-slate-200 text-emerald-800"
                      />
                      Custom Entry Price
                    </label>
                  </div>
                  {useManualEntryPrice ? (
                    <input
                      type="number"
                      value={manualEntryPrice}
                      onChange={(e) => setManualEntryPrice(e.target.value)}
                      placeholder="Enter custom purchase price (₹)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-black focus:outline-none focus:border-emerald-500"
                    />
                  ) : (
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-black flex justify-between">
                      <span>Live / Cached Market Quote</span>
                      <strong className="text-emerald-800">Auto-fetched</strong>
                    </div>
                  )}
                </div>

                {/* Future Price Assumption */}
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-black uppercase mb-1">
                    <span>Future Price Assumption</span>
                    <div className="flex gap-2 text-[10px]">
                      <button
                        onClick={() => setFuturePriceMode('percent')}
                        className={futurePriceMode === 'percent' ? 'text-emerald-800 font-bold' : 'text-black'}
                      >
                        Shift %
                      </button>
                      <button
                        onClick={() => setFuturePriceMode('manual')}
                        className={futurePriceMode === 'manual' ? 'text-emerald-800 font-bold' : 'text-black'}
                      >
                        Target Price
                      </button>
                    </div>
                  </div>

                  {futurePriceMode === 'percent' ? (
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-black">
                        <span>Expected Price Change:</span>
                        <strong className={futureShiftPercent >= 0 ? 'text-emerald-800' : 'text-rose-600'}>
                          {futureShiftPercent >= 0 ? '+' : ''}
                          {futureShiftPercent}%
                        </strong>
                      </div>
                      <input
                        type="range"
                        min="-50"
                        max="100"
                        step="5"
                        value={futureShiftPercent}
                        onChange={(e) => setFutureShiftPercent(Number(e.target.value))}
                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <div className="flex justify-between text-[10px] text-black">
                        <span>-50% Bear</span>
                        <span>0% Base</span>
                        <span>+100% Bull</span>
                      </div>
                    </div>
                  ) : (
                    <input
                      type="number"
                      value={manualFuturePrice}
                      onChange={(e) => setManualFuturePrice(e.target.value)}
                      placeholder="Target Future Price (₹)"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-black focus:outline-none focus:border-emerald-500"
                    />
                  )}
                </div>

                {/* Holding Period Label */}
                <div>
                  <label className="block text-xs font-semibold text-black uppercase mb-1">Scenario Timeframe</label>
                  <select
                    value={holdingPeriod}
                    onChange={(e) => setHoldingPeriod(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-black focus:outline-none focus:border-emerald-500"
                  >
                    <option value="1 Week">1 Week</option>
                    <option value="1 Month">1 Month</option>
                    <option value="3 Months">3 Months</option>
                    <option value="6 Months">6 Months</option>
                    <option value="1 Year">1 Year</option>
                  </select>
                </div>

                <button
                  onClick={handleRunSingleStock}
                  disabled={simulating}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-900/30"
                >
                  <Sparkles size={15} />
                  {simulating ? 'Calculating Scenario...' : 'Run Stock Simulation'}
                </button>
              </div>
            )}

            {/* TAB 2: Portfolio Stress Test */}
            {activeTab === 'stress' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black uppercase mb-2">Preset Scenarios</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      onClick={() => applyPreset('Mild Correction (-5%)', -5)}
                      className={`p-2 rounded-lg border text-left text-[11px] font-semibold transition-colors ${
                        presetName === 'Mild Correction (-5%)'
                          ? 'bg-amber-500/10 border-amber-500/40 text-amber-700'
                          : 'bg-slate-50 border-slate-200 text-black hover:border-slate-700'
                      }`}
                    >
                      Mild (-5%)
                    </button>
                    <button
                      onClick={() => applyPreset('Broad Decline (-15%)', -15)}
                      className={`p-2 rounded-lg border text-left text-[11px] font-semibold transition-colors ${
                        presetName === 'Broad Decline (-15%)'
                          ? 'bg-rose-500/10 border-rose-500/40 text-rose-700'
                          : 'bg-slate-50 border-slate-200 text-black hover:border-slate-700'
                      }`}
                    >
                      Decline (-15%)
                    </button>
                    <button
                      onClick={() => applyPreset('Strong Rally (+15%)', 15)}
                      className={`p-2 rounded-lg border text-left text-[11px] font-semibold transition-colors ${
                        presetName === 'Strong Rally (+15%)'
                          ? 'bg-emerald-500/10 border-emerald-500/40 text-black'
                          : 'bg-slate-50 border-slate-200 text-black hover:border-slate-700'
                      }`}
                    >
                      Rally (+15%)
                    </button>
                    <button
                      onClick={() => applyPreset('Market Crash (-30%)', -30)}
                      className={`p-2 rounded-lg border text-left text-[11px] font-semibold transition-colors ${
                        presetName === 'Market Crash (-30%)'
                          ? 'bg-rose-950/60 border-rose-800 text-rose-600'
                          : 'bg-slate-50 border-slate-200 text-black hover:border-slate-700'
                      }`}
                    >
                      Crash (-30%)
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-semibold text-black uppercase mb-1">
                    <span>Global Market Move</span>
                    <strong className={globalShift >= 0 ? 'text-emerald-800' : 'text-rose-600'}>
                      {globalShift >= 0 ? '+' : ''}
                      {globalShift}%
                    </strong>
                  </div>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    step="1"
                    value={globalShift}
                    onChange={(e) => {
                      setGlobalShift(Number(e.target.value));
                      setPresetName(`Custom (${Number(e.target.value) >= 0 ? '+' : ''}${e.target.value}% Market Shift)`);
                    }}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-black mt-1">
                    <span>-40% Crash</span>
                    <span>0% Neutral</span>
                    <span>+40% Boom</span>
                  </div>
                </div>

                {baseline && baseline.holdings.length > 0 && (
                  <div className="border-t border-slate-200 pt-3 space-y-2">
                    <span className="block text-xs font-semibold text-black uppercase">Individual Stock Adjustments</span>
                    <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1">
                      {baseline.holdings.map((h) => (
                        <div key={h.symbol} className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded border border-slate-200">
                          <span className="font-semibold text-black">{h.symbol}</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={stockShifts[h.symbol] ?? globalShift}
                              onChange={(e) =>
                                setStockShifts({ ...stockShifts, [h.symbol]: Number(e.target.value) })
                              }
                              className="w-16 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-right text-black"
                            />
                            <span className="text-black text-[10px]">%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleRunStressTest}
                  disabled={simulating}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-900/30"
                >
                  <Activity size={15} />
                  {simulating ? 'Running Stress Test...' : 'Run Portfolio Stress Test'}
                </button>
              </div>
            )}

            {/* TAB 3: Buy/Sell Allocation */}
            {activeTab === 'allocation' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-black uppercase mb-1">Select Instrument</label>
                  <input
                    type="text"
                    value={allocSymbol}
                    onChange={(e) => setAllocSymbol(e.target.value.toUpperCase())}
                    placeholder="Symbol (e.g. TCS, RELIANCE)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-black focus:outline-none focus:border-emerald-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black uppercase mb-1">Hypothetical Action</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setAllocAction('BUY')}
                      className={`py-2 rounded-lg border text-xs font-semibold transition-colors ${
                        allocAction === 'BUY'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-800'
                          : 'bg-slate-50 border-slate-200 text-black hover:border-slate-700'
                      }`}
                    >
                      Buy Shares
                    </button>
                    <button
                      onClick={() => setAllocAction('SELL')}
                      className={`py-2 rounded-lg border text-xs font-semibold transition-colors ${
                        allocAction === 'SELL'
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-600'
                          : 'bg-slate-50 border-slate-200 text-black hover:border-slate-700'
                      }`}
                    >
                      Sell Shares
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black uppercase mb-1">Quantity of Shares</label>
                  <input
                    type="number"
                    value={allocQuantity}
                    onChange={(e) => setAllocQuantity(e.target.value)}
                    placeholder="Number of shares"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-black focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-black uppercase mb-1">
                    Assumed Price (₹) <span className="text-[10px] text-black">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    value={allocManualPrice}
                    onChange={(e) => setAllocManualPrice(e.target.value)}
                    placeholder="Leave blank for live market quote"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-black focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={handleRunAllocation}
                  disabled={simulating}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-black rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-900/30"
                >
                  <Layers size={15} />
                  {simulating ? 'Simulating Allocation...' : `Simulate ${allocAction} Allocation`}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right 2 Columns: Results Area & Visualizations */}
        <div className="lg:col-span-2 space-y-6">
          {simError && (
            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-700 text-xs flex items-center gap-3">
              <AlertCircle size={18} className="shrink-0" />
              <span>{simError}</span>
            </div>
          )}

          {/* SINGLE STOCK RESULTS */}
          {activeTab === 'stock' && stockResult && (
            <div className="rounded-xl border border-slate-200 bg-white/60 p-6 space-y-6 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-black">{stockResult.symbol}</h2>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-black border border-slate-700">
                      {stockResult.exchange}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-800 border border-emerald-500/20">
                      {stockResult.holding_period_label} Target
                    </span>
                  </div>
                  <p className="text-xs text-black mt-0.5">{stockResult.name}</p>
                </div>

                <button
                  onClick={() => {
                    setScenarioNameInput(`${stockResult.symbol} ${stockResult.holding_period_label} Simulation`);
                    setSaveModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-black border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Save size={14} className="text-emerald-800" /> Save Scenario
                </button>
              </div>

              {/* Main Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Actual Investment</span>
                  <strong className="text-lg font-mono text-black">
                    ₹{formatMoney(stockResult.actual_investment)}
                  </strong>
                  <span className="block text-xs text-black mt-0.5">{stockResult.quantity} shares @ ₹{formatNum(stockResult.assumed_entry_price, 2)}</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Target Position Value</span>
                  <strong className="text-lg font-mono text-black">
                    ₹{formatMoney(stockResult.future_position_value)}
                  </strong>
                  <span className="block text-xs text-black mt-0.5">Assumed price: ₹{formatNum(stockResult.hypothetical_future_price, 2)}</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Hypothetical P&L</span>
                  <strong
                    className={`text-lg font-mono ${
                      num(stockResult.hypothetical_pnl) >= 0 ? 'text-emerald-800' : 'text-rose-600'
                    }`}
                  >
                    {num(stockResult.hypothetical_pnl) >= 0 ? '+' : ''}
                    ₹{formatMoney(stockResult.hypothetical_pnl)}
                  </strong>
                  <span className="block text-xs text-black mt-0.5">Simulated gain / loss</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Hypothetical Return</span>
                  <strong
                    className={`text-lg font-mono flex items-center gap-1 ${
                      num(stockResult.return_percent) >= 0 ? 'text-emerald-800' : 'text-rose-600'
                    }`}
                  >
                    {num(stockResult.return_percent) >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                    {num(stockResult.return_percent) >= 0 ? '+' : ''}
                    {formatNum(stockResult.return_percent, 2)}%
                  </strong>
                  <span className="block text-xs text-black mt-0.5">Return on investment</span>
                </div>
              </div>

              {/* Scenario Range Grid Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-black uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 size={14} className="text-emerald-800" /> Scenario Outcome Matrix
                </h4>
                <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-white/80 text-[10px] uppercase text-black border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4">Market Scenario</th>
                        <th className="py-2.5 px-4 text-right">Hypothetical Price</th>
                        <th className="py-2.5 px-4 text-right">Position Value</th>
                        <th className="py-2.5 px-4 text-right">Hypothetical P&L</th>
                        <th className="py-2.5 px-4 text-right">Return %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {stockResult.scenario_grid.map((grid) => (
                        <tr key={grid.label} className="hover:bg-white/40">
                          <td className="py-2.5 px-4 font-sans font-semibold text-black">{grid.label}</td>
                          <td className="py-2.5 px-4 text-right text-black">₹{formatNum(grid.hypothetical_price, 2)}</td>
                          <td className="py-2.5 px-4 text-right text-black">₹{formatMoney(grid.future_position_value)}</td>
                          <td className={`py-2.5 px-4 text-right font-semibold ${num(grid.hypothetical_pnl) >= 0 ? 'text-emerald-800' : 'text-rose-600'}`}>
                            {num(grid.hypothetical_pnl) >= 0 ? '+' : ''}₹{formatMoney(grid.hypothetical_pnl)}
                          </td>
                          <td className={`py-2.5 px-4 text-right font-semibold ${num(grid.return_percent) >= 0 ? 'text-emerald-800' : 'text-rose-600'}`}>
                            {num(grid.return_percent) >= 0 ? '+' : ''}{formatNum(grid.return_percent, 2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Assumptions Box */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2 text-xs text-black">
                <span className="font-semibold text-black uppercase text-[10px] block">Scenario Assumptions & Disclaimers</span>
                <ul className="list-disc list-inside space-y-1">
                  {stockResult.assumptions.map((asm, idx) => (
                    <li key={idx}>{asm}</li>
                  ))}
                  <li>Simulations use assumptions and do not predict future market performance.</li>
                </ul>
              </div>
            </div>
          )}

          {/* STRESS TEST RESULTS */}
          {activeTab === 'stress' && stressResult && (
            <div className="rounded-xl border border-slate-200 bg-white/60 p-6 space-y-6 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-black">{stressResult.preset_name}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold border ${
                      num(stressResult.portfolio_impact) >= 0
                        ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                    }`}>
                      {num(stressResult.portfolio_impact) >= 0 ? '+' : ''}
                      {formatNum(stressResult.portfolio_impact_percent, 2)}% Impact
                    </span>
                  </div>
                  <p className="text-xs text-black mt-0.5">Portfolio Stress Simulation Result</p>
                </div>

                <button
                  onClick={() => {
                    setScenarioNameInput(`Portfolio Stress Test (${stressResult.preset_name})`);
                    setSaveModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-black border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Save size={14} className="text-emerald-800" /> Save Scenario
                </button>
              </div>

              {/* Stress Comparison Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Baseline Portfolio</span>
                  <strong className="text-lg font-mono text-black">
                    ₹{formatMoney(stressResult.baseline_portfolio_value)}
                  </strong>
                  <span className="block text-xs text-black mt-0.5">Holdings + Unchanged Cash</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Simulated Portfolio</span>
                  <strong className="text-lg font-mono text-black">
                    ₹{formatMoney(stressResult.simulated_portfolio_value)}
                  </strong>
                  <span className="block text-xs text-black mt-0.5">Post market move valuation</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Portfolio Impact</span>
                  <strong
                    className={`text-lg font-mono flex items-center gap-1 ${
                      num(stressResult.portfolio_impact) >= 0 ? 'text-emerald-800' : 'text-rose-600'
                    }`}
                  >
                    {num(stressResult.portfolio_impact) >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                    {num(stressResult.portfolio_impact) >= 0 ? '+' : ''}
                    ₹{formatMoney(stressResult.portfolio_impact)}
                  </strong>
                  <span className="block text-xs text-black mt-0.5">
                    ({num(stressResult.portfolio_impact_percent) >= 0 ? '+' : ''}
                    {formatNum(stressResult.portfolio_impact_percent, 2)}%)
                  </span>
                </div>
              </div>

              {/* Holdings Stress Breakdown Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold text-black uppercase tracking-wider flex items-center gap-2">
                  <Layers size={14} className="text-emerald-800" /> Holding Impact Breakdown
                </h4>
                {stressResult.holdings_breakdown.length > 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-white/80 text-[10px] uppercase text-black border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">Holding</th>
                          <th className="py-2.5 px-4 text-right">Baseline Price</th>
                          <th className="py-2.5 px-4 text-right">Simulated Price</th>
                          <th className="py-2.5 px-4 text-right">Baseline Value</th>
                          <th className="py-2.5 px-4 text-right">Simulated Value</th>
                          <th className="py-2.5 px-4 text-right">Impact (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {stressResult.holdings_breakdown.map((h) => (
                          <tr key={h.symbol} className="hover:bg-white/40">
                            <td className="py-2.5 px-4 font-sans font-semibold text-black">
                              {h.symbol}
                              <small className="block text-[10px] text-black font-normal">{h.quantity} shares</small>
                            </td>
                            <td className="py-2.5 px-4 text-right text-black">₹{formatNum(h.baseline_price, 2)}</td>
                            <td className="py-2.5 px-4 text-right text-black">₹{formatNum(h.simulated_price, 2)}</td>
                            <td className="py-2.5 px-4 text-right text-black">₹{formatMoney(h.baseline_value)}</td>
                            <td className="py-2.5 px-4 text-right text-black">₹{formatMoney(h.simulated_value)}</td>
                            <td className={`py-2.5 px-4 text-right font-semibold ${num(h.pnl_impact) >= 0 ? 'text-emerald-800' : 'text-rose-600'}`}>
                              {num(h.pnl_impact) >= 0 ? '+' : ''}₹{formatMoney(h.pnl_impact)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-center text-xs text-black bg-slate-50 rounded-xl border border-slate-200">
                    No active positions found in portfolio. Open positions in Tradeo to run holdings-level stress testing.
                  </div>
                )}
              </div>

              {/* Assumptions Box */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2 text-xs text-black">
                <span className="font-semibold text-black uppercase text-[10px] block">Scenario Assumptions & Disclaimers</span>
                <ul className="list-disc list-inside space-y-1">
                  {stressResult.assumptions.map((asm, idx) => (
                    <li key={idx}>{asm}</li>
                  ))}
                  <li>Simulations use assumptions and do not predict future market performance.</li>
                </ul>
              </div>
            </div>
          )}

          {/* ALLOCATION RESULTS */}
          {activeTab === 'allocation' && allocResult && (
            <div className="rounded-xl border border-slate-200 bg-white/60 p-6 space-y-6 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-black">{allocResult.symbol}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded font-bold border ${
                      allocResult.action === 'BUY'
                        ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-600 border-rose-500/30'
                    }`}>
                      Hypothetical {allocResult.action}
                    </span>
                  </div>
                  <p className="text-xs text-black mt-0.5">{allocResult.name}</p>
                </div>

                <button
                  onClick={() => {
                    setScenarioNameInput(`Hypothetical ${allocResult.action} ${allocResult.simulated_quantity} ${allocResult.symbol}`);
                    setSaveModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-black border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Save size={14} className="text-emerald-800" /> Save Scenario
                </button>
              </div>

              {/* Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Transaction Value</span>
                  <strong className="text-lg font-mono text-black">
                    ₹{formatMoney(allocResult.total_transaction_value)}
                  </strong>
                  <span className="block text-xs text-black mt-0.5">{allocResult.simulated_quantity} shares @ ₹{formatNum(allocResult.assumed_price, 2)}</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Resulting Cash</span>
                  <strong className="text-lg font-mono text-black">
                    ₹{formatMoney(allocResult.hypothetical_cash)}
                  </strong>
                  <span className="block text-xs text-black mt-0.5">Was ₹{formatMoney(allocResult.baseline_cash)}</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Position Quantity</span>
                  <strong className="text-lg font-mono text-black">
                    {allocResult.hypothetical_position_quantity} shares
                  </strong>
                  <span className="block text-xs text-black mt-0.5">Was {allocResult.baseline_position_quantity} shares</span>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="block text-[10px] uppercase font-semibold text-black mb-1">Portfolio Allocation %</span>
                  <strong className="text-lg font-mono text-emerald-800">
                    {formatNum(allocResult.allocation_percent_after, 2)}%
                  </strong>
                  <span className="block text-xs text-black mt-0.5">Was {formatNum(allocResult.allocation_percent_before, 2)}%</span>
                </div>
              </div>

              {/* Assumptions Box */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2 text-xs text-black">
                <span className="font-semibold text-black uppercase text-[10px] block">Scenario Assumptions & Disclaimers</span>
                <ul className="list-disc list-inside space-y-1">
                  {allocResult.assumptions.map((asm, idx) => (
                    <li key={idx}>{asm}</li>
                  ))}
                  <li>Simulations use assumptions and do not predict future market performance.</li>
                </ul>
              </div>
            </div>
          )}

          {/* EMPTY RESULTS INITIAL PLACEHOLDER */}
          {!stockResult && !stressResult && !allocResult && (
            <div className="p-12 text-center rounded-xl border border-slate-200 bg-white/40 text-black space-y-4">
              <Sparkles size={40} className="mx-auto text-emerald-800/60" />
              <div>
                <h3 className="text-base font-semibold text-black">No Scenario Calculated Yet</h3>
                <p className="text-xs text-black max-w-md mx-auto mt-1">
                  Configure your parameters in the Scenario Builder on the left and click Run Simulation to view outcome summaries, P&L projections, and matrix breakdowns.
                </p>
              </div>
            </div>
          )}

          {/* SAVED SCENARIOS & COMPARISON SECTION */}
          <div className="rounded-xl border border-slate-200 bg-white/60 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-black flex items-center gap-2">
                <Bookmark size={16} className="text-amber-600" /> Saved Scenarios ({savedScenarios.length})
              </h3>
              {selectedForCompare.length > 0 && (
                <button
                  onClick={handleRunComparison}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <BarChart3 size={14} /> Compare Selected ({selectedForCompare.length})
                </button>
              )}
            </div>

            {loadingScenarios ? (
              <div className="py-6 text-center text-xs text-black">Loading saved scenarios...</div>
            ) : savedScenarios.length === 0 ? (
              <div className="py-6 text-center text-xs text-black italic border border-slate-200/80 rounded-lg">
                No saved scenarios yet. Run a simulation above and click "Save Scenario" to persist it.
              </div>
            ) : (
              <div className="space-y-2">
                {savedScenarios.map((sc) => {
                  const isSelected = selectedForCompare.includes(sc.id);
                  return (
                    <div
                      key={sc.id}
                      className={`p-3.5 rounded-lg border transition-colors flex flex-wrap items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-blue-950/40 border-emerald-500/50'
                          : 'bg-slate-50 border-slate-200/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCompareSelect(sc.id)}
                          className="rounded bg-white border-slate-700 text-emerald-800 cursor-pointer"
                        />
                        <div>
                          <strong className="text-xs font-semibold text-black block">{sc.name}</strong>
                          <span className="text-[10px] text-black">
                            {sc.scenario_type.toUpperCase()} • Saved {new Date(sc.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            if (sc.scenario_type === 'single_stock') {
                              setActiveTab('stock');
                              setStockResult(sc.result);
                            } else if (sc.scenario_type === 'portfolio_stress') {
                              setActiveTab('stress');
                              setStressResult(sc.result);
                            } else {
                              setActiveTab('allocation');
                              setAllocResult(sc.result);
                            }
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-black rounded text-[11px] font-medium"
                        >
                          View Output
                        </button>
                        <button
                          onClick={(e) => handleDeleteScenario(sc.id, e)}
                          className="p-1 text-black hover:text-rose-600 transition-colors"
                          title="Delete scenario"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SAVE SCENARIO MODAL */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-black flex items-center gap-2">
                <Save size={18} className="text-emerald-800" /> Save What-If Scenario
              </h3>
              <button onClick={() => setSaveModalOpen(false)} className="text-black hover:text-black">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-black uppercase mb-1">Scenario Name</label>
              <input
                type="text"
                value={scenarioNameInput}
                onChange={(e) => setScenarioNameInput(e.target.value)}
                placeholder="Name your scenario..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs text-black focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSaveModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-black rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCurrentScenario}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
              >
                Save Scenario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPARE SCENARIOS MODAL */}
      {compareModalOpen && comparisonResult && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full p-6 space-y-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-black flex items-center gap-2">
                <BarChart3 size={18} className="text-emerald-800" /> Scenario Side-by-Side Comparison
              </h3>
              <button onClick={() => setCompareModalOpen(false)} className="text-black hover:text-black">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {comparisonResult.scenarios.map((sc, idx) => (
                <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3 text-xs">
                  <div className="border-b border-slate-200 pb-2">
                    <strong className="text-sm font-bold text-black block">{sc.name}</strong>
                    <span className="text-[10px] text-emerald-800 uppercase font-semibold">{sc.scenario_type}</span>
                  </div>

                  <div>
                    <span className="block text-[10px] text-black uppercase">Input / Action</span>
                    <strong className="text-black">{sc.initial_cash_deployed_or_shift}</strong>
                  </div>

                  <div>
                    <span className="block text-[10px] text-black uppercase">Resulting Portfolio</span>
                    <strong className="text-black font-mono">₹{formatMoney(sc.resulting_portfolio_value)}</strong>
                  </div>

                  <div>
                    <span className="block text-[10px] text-black uppercase">Hypothetical P&L</span>
                    <strong className={num(sc.hypothetical_pnl) >= 0 ? 'text-emerald-800' : 'text-rose-600'}>
                      {num(sc.hypothetical_pnl) >= 0 ? '+' : ''}₹{formatMoney(sc.hypothetical_pnl)} ({formatNum(sc.return_percent, 2)}%)
                    </strong>
                  </div>

                  <div>
                    <span className="block text-[10px] text-black uppercase">Cash Remaining</span>
                    <strong className="text-black font-mono">₹{formatMoney(sc.cash_remaining)}</strong>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setCompareModalOpen(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
              >
                Close Comparison
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
