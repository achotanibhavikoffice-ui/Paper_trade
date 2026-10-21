import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, BriefcaseBusiness, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tradingApi, type Holding } from '../api';

const inr = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value || 0);

export function HoldingsPage() {
  const navigate = useNavigate();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = () => tradingApi.holdings().then((rows) => { if (active) { setHoldings(rows); setError(''); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load holdings.'); })
      .finally(() => { if (active) setLoading(false); });
    void load(); const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const invested = holdings.reduce((sum, row) => sum + row.invested_amount, 0);
  const value = holdings.reduce((sum, row) => sum + row.current_value, 0);
  const pnl = holdings.reduce((sum, row) => sum + row.unrealized_pnl, 0);
  return <section className="trade-page trade-subpage">
    <header className="trade-page-heading"><div><p className="trade-eyebrow">DELIVERY · CNC</p><h1>Your holdings</h1><p className="trade-subtitle">Longer-term positions held in your simulated account.</p></div><button className="trade-primary-button" onClick={() => navigate('/explore')}><ShoppingCart size={16} /> Explore instruments</button></header>
    {error && <div className="trade-notice error" role="alert">{error}</div>}
    <div className="trade-hero-grid three">
      <article className="trade-metric-card"><span className="trade-card-label">INVESTED CAPITAL</span><strong>{inr(invested)}</strong><small>Cost basis across delivery holdings</small></article>
      <article className="trade-metric-card"><span className="trade-card-label">CURRENT VALUE</span><strong>{inr(value)}</strong><small>Marked to latest available quote</small></article>
      <article className="trade-metric-card"><span className="trade-card-label">UNREALIZED P&amp;L</span><strong className={pnl >= 0 ? 'trade-positive' : 'trade-negative'}>{pnl >= 0 ? '+' : ''}{inr(pnl)}</strong><small>{invested ? `${(pnl / invested * 100).toFixed(2)}% return` : 'No invested positions yet'}</small></article>
    </div>
    <section className="trade-panel"><div className="trade-panel-heading"><div><span className="trade-section-kicker">CNC POSITIONS</span><h2><BriefcaseBusiness size={17} /> Holdings <span className="trade-count-chip">{holdings.length}</span></h2></div></div>
      {loading ? <div className="trade-inline-empty">Loading your account positions…</div> : holdings.length ? <div className="trade-table-wrap"><table className="trade-table"><thead><tr><th>INSTRUMENT</th><th>SHARES</th><th>AVERAGE</th><th>MARK</th><th>VALUE</th><th>UNREALIZED P&amp;L</th><th></th></tr></thead><tbody>{holdings.map((row) => <tr key={row.id} onClick={() => navigate(`/stocks/${row.symbol}`)}><td><strong>{row.symbol}</strong><small>{row.company_name}</small></td><td>{row.shares}</td><td>{inr(row.average_price)}</td><td>{inr(row.current_price)}</td><td>{inr(row.current_value)}</td><td className={row.unrealized_pnl >= 0 ? 'trade-positive' : 'trade-negative'}>{row.unrealized_pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{inr(row.unrealized_pnl)} <small>{row.unrealized_pnl_percent.toFixed(2)}%</small></td><td><button className="trade-secondary-button" onClick={(event) => { event.stopPropagation(); navigate(`/stocks/${row.symbol}`); }}>Trade</button></td></tr>)}</tbody></table></div> : <div className="trade-empty"><div className="trade-empty-icon"><BriefcaseBusiness size={21} /></div><strong>No delivery holdings yet</strong><p>When a CNC order fills, the position will appear here with cost basis and mark-to-market value.</p><button onClick={() => navigate('/explore')}>Find an instrument</button></div>}
    </section>
  </section>;
}
