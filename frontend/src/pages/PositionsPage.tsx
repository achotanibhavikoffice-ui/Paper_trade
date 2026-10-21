import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CandlestickChart, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tradingApi, type Position } from '../api';

const inr = (value: number | string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value) || 0);

export function PositionsPage() {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    const load = () => tradingApi.positions().then((rows) => { if (active) { setPositions(rows); setError(''); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load positions.'); })
      .finally(() => { if (active) setLoading(false); });
    void load(); const timer = window.setInterval(() => void load(), 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const mtm = positions.reduce((sum, row) => sum + Number(row.unrealized_pnl), 0);
  return <section className="trade-page trade-subpage">
    <header className="trade-page-heading"><div><p className="trade-eyebrow">INTRADAY · MIS</p><h1>Open positions</h1><p className="trade-subtitle">Intraday exposure and mark-to-market P&amp;L in your paper account.</p></div><span className="trade-feed-badge feed-idle"><i /> AUTO SQUARE-OFF 3:20 PM IST</span></header>
    {error && <div className="trade-notice error" role="alert">{error}</div>}
    <div className="trade-hero-grid two"><article className="trade-metric-card"><span className="trade-card-label">ACTIVE POSITIONS</span><strong>{loading ? '—' : positions.length}</strong><small>Net open MIS positions</small></article><article className="trade-metric-card"><span className="trade-card-label">UNREALIZED INTRADAY P&amp;L</span><strong className={mtm >= 0 ? 'trade-positive' : 'trade-negative'}>{mtm >= 0 ? '+' : ''}{inr(mtm)}</strong><small>Uses the latest quote available to the simulator</small></article></div>
    <section className="trade-panel"><div className="trade-panel-heading"><div><span className="trade-section-kicker">LIVE EXPOSURE</span><h2><CandlestickChart size={17} /> Positions <span className="trade-count-chip">{positions.length}</span></h2></div></div>
      {loading ? <div className="trade-inline-empty">Loading open positions…</div> : positions.length ? <div className="trade-table-wrap"><table className="trade-table"><thead><tr><th>INSTRUMENT</th><th>PRODUCT</th><th>NET QTY</th><th>AVERAGE</th><th>MARK</th><th>REALIZED</th><th>UNREALIZED</th><th></th></tr></thead><tbody>{positions.map((row) => { const pnl = Number(row.unrealized_pnl); return <tr key={row.id} onClick={() => navigate(`/stocks/${row.symbol}`)}><td><strong>{row.symbol}</strong><small>{row.company_name}</small></td><td><span className={`trade-product-chip ${row.product.toLowerCase()}`}>{row.product}</span></td><td>{row.quantity > 0 ? `+${row.quantity}` : row.quantity}</td><td>{inr(row.average_price)}</td><td>{inr(row.current_price)}</td><td>{inr(row.realized_pnl)}</td><td className={pnl >= 0 ? 'trade-positive' : 'trade-negative'}>{pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{inr(pnl)}</td><td><button className="trade-secondary-button" onClick={(event) => { event.stopPropagation(); navigate(`/stocks/${row.symbol}`); }}><LogOut size={14} /> Exit</button></td></tr>; })}</tbody></table></div> : <div className="trade-empty"><div className="trade-empty-icon"><CandlestickChart size={21} /></div><strong>No intraday positions</strong><p>Positions appear here after a simulated MIS order fills against available market depth.</p><button onClick={() => navigate('/explore')}>Explore instruments</button></div>}
    </section>
  </section>;
}
