import { useEffect, useState } from 'react';
import { Activity, ArrowRight, BriefcaseBusiness, CandlestickChart, Flame, RotateCcw, Sparkles, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tradingApi, type Holding, type PortfolioSummary, type Position } from '../api';

const inr = (value: number | string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value) || 0);

export function PortfolioPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [stress, setStress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([tradingApi.summary(), tradingApi.holdings(), tradingApi.positions(), tradingApi.stressSettings()])
      .then(([nextSummary, nextHoldings, nextPositions, settings]) => { setSummary(nextSummary); setHoldings(nextHoldings); setPositions(nextPositions); setStress(settings.stress_mode); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load portfolio.'));
  }, []);
  async function toggleStress() {
    setBusy(true); setError('');
    try { const next = await tradingApi.setStressMode(!stress); setStress(next.stress_mode); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update paper trading settings.'); }
    finally { setBusy(false); }
  }
  const allocationTotal = holdings.reduce((sum, item) => sum + item.current_value, 0);
  return <section className="trade-page trade-subpage">
    <header className="trade-page-heading">
      <div>
        <p className="trade-eyebrow">PAPER ACCOUNT · PORTFOLIO</p>
        <h1>Portfolio overview</h1>
        <p className="trade-subtitle">A current view of your virtual cash, delivery holdings, and intraday exposure.</p>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="trade-secondary-button" onClick={() => navigate('/recovery')}>
          <RotateCcw size={15} style={{ color: '#15977e' }} /> Recovery Shield
        </button>
        <button className="trade-secondary-button" onClick={() => navigate('/what-if')}>
          <Sparkles size={15} style={{ color: '#098b79' }} /> What-if Lab
        </button>
        <button className="trade-secondary-button" onClick={() => navigate('/market-stress')}>
          <Flame size={15} style={{ color: '#e55353' }} /> Stress Simulator
        </button>
        <button className="trade-primary-button" onClick={() => navigate('/explore')}>
          Explore market <ArrowRight size={16} />
        </button>
      </div>
    </header>
    {error && <div className="trade-notice error" role="alert">{error}</div>}
    <div className="trade-hero-grid four">
      <article className="trade-metric-card"><span className="trade-card-label"><Activity size={15} /> ACCOUNT EQUITY</span><strong>{summary ? inr(summary.equity) : '—'}</strong><small>Cash balance plus open position value</small></article>
      <article className="trade-metric-card"><span className="trade-card-label"><Wallet size={15} /> AVAILABLE CASH</span><strong>{summary ? inr(Number(summary.cash_balance) - Number(summary.reserved_cash)) : '—'}</strong><small>{summary ? `${inr(summary.reserved_cash)} reserved for orders` : 'Loading'}</small></article>
      <article className="trade-metric-card"><span className="trade-card-label">TOTAL P&amp;L</span><strong className={Number(summary?.total_pnl ?? 0) >= 0 ? 'trade-positive' : 'trade-negative'}>{summary ? inr(summary.total_pnl) : '—'}</strong><small>Realized + unrealized</small></article>
      <article className="trade-metric-card"><span className="trade-card-label">OPEN ORDERS</span><strong>{summary?.open_orders ?? '—'}</strong><small>{summary?.open_positions ?? 0} active positions</small></article>
    </div>
    <div className="trade-dashboard-columns">
      <section className="trade-panel"><div className="trade-panel-heading"><div><span className="trade-section-kicker">PORTFOLIO MIX</span><h2><BriefcaseBusiness size={17} /> Delivery holdings</h2></div><button className="trade-link-button" onClick={() => navigate('/portfolio/holdings')}>View holdings <ArrowRight size={14} /></button></div>
        {holdings.length ? <div className="trade-allocation-list">{holdings.slice(0, 8).map((item) => { const weight = allocationTotal ? item.current_value / allocationTotal * 100 : 0; return <div className="trade-allocation-row" key={item.id}><div><strong>{item.symbol}</strong><span>{item.company_name}</span><b>{inr(item.current_value)} · {weight.toFixed(1)}%</b></div><div className="trade-allocation-track"><i style={{ width: `${weight}%` }} /></div></div>; })}</div> : <div className="trade-empty compact"><BriefcaseBusiness size={20} /><strong>No CNC holdings yet</strong><p>Your delivery holdings will appear here after an order fills.</p></div>}
      </section>
      <section className="trade-panel"><div className="trade-panel-heading"><div><span className="trade-section-kicker">INTRADAY EXPOSURE</span><h2><CandlestickChart size={17} /> Open positions</h2></div><button className="trade-link-button" onClick={() => navigate('/portfolio/positions')}>View positions <ArrowRight size={14} /></button></div>
        {positions.length ? <div className="trade-mini-list">{positions.slice(0, 5).map((item) => <button key={item.id} onClick={() => navigate(`/stocks/${item.symbol}`)}><span><strong>{item.symbol}</strong><small>{item.quantity} shares · {item.product}</small></span><b className={Number(item.unrealized_pnl) >= 0 ? 'trade-positive' : 'trade-negative'}>{inr(item.unrealized_pnl)}</b></button>)}</div> : <div className="trade-empty compact"><CandlestickChart size={20} /><strong>No open positions</strong><p>Filled MIS orders are reflected in this view.</p></div>}
      </section>
      <section className="trade-panel trade-stress-panel">
        <div className="trade-panel-heading">
          <div><span className="trade-section-kicker">PAPER SIMULATION</span><h2>Market stress mode</h2></div>
          <span className={`trade-product-chip ${stress ? 'mis' : 'cnc'}`}>{stress ? 'ON' : 'OFF'}</span>
        </div>
        <p>Apply the configured wider spreads and lower visible depth to simulated order matching. This changes only your paper account.</p>
        <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
          <button className={stress ? 'trade-cancel-button' : 'trade-secondary-button'} disabled={busy} onClick={() => void toggleStress()}>
            {busy ? 'Saving…' : stress ? 'Disable stress mode' : 'Enable stress mode'}
          </button>
          <button className="trade-secondary-button" onClick={() => navigate('/market-stress')}>
            Open Stress Simulator <ArrowRight size={14} />
          </button>
        </div>
      </section>
    </div>
  </section>;
}
