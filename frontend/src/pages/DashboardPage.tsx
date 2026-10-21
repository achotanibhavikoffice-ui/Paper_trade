import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, CandlestickChart, CircleDollarSign, Clock3, Layers3, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { accountApi, marketApi, tradingApi, type AccountInfo, type Instrument, type MarketStatus, type PortfolioSummary, type Position, type User } from '../api';
import { useMarketFeed } from '../hooks/useMarketFeed';
import { TradingViewCandleChart } from '../components/charts/TradingViewCandleChart';

const initialSymbols = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN'];
const formatINR = (value: number | string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value) || 0);
const num = (value: number | string | undefined) => Number(value ?? 0);

export function DashboardPage({ user }: { user: User | null }) {
  const navigate = useNavigate();
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [marketStatusUnavailable, setMarketStatusUnavailable] = useState(false);
  const [selected, setSelected] = useState('TATASTEEL');
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [product, setProduct] = useState<'MIS' | 'CNC'>((localStorage.getItem('quantx_default_product') as 'MIS' | 'CNC') || 'MIS');
  const [quantity, setQuantity] = useState('1');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const trackedSymbols = useMemo(() => [...new Set([...initialSymbols, selected, ...positions.map((p) => p.symbol)])], [positions, selected]);
  const { quotes, state: feedState } = useMarketFeed(trackedSymbols);
  const selectedQuote = quotes[selected];
  const quoteFresh = Boolean(selectedQuote && Date.now() - Date.parse(selectedQuote.timestamp) <= (marketStatus?.quote_max_age_seconds ?? 120) * 1000);
  const selectedInstrument = instruments.find((item) => item.symbol === selected);
  const demoQuote = selectedQuote?.data_source === 'demo';
  const snapshotQuote = selectedQuote?.data_source === 'indianapi' || (!demoQuote && marketStatus?.mode === 'indianapi');
  const canSubmitOrder = Boolean(selectedInstrument && !snapshotQuote && (selectedInstrument.provider_token || demoQuote) && quoteFresh && feedState === 'live');

  const refreshPortfolio = useCallback(async () => {
    const [accountResult, summaryResult, positionsResult, statusResult] = await Promise.allSettled([
      accountApi.getAccount(), tradingApi.summary(), tradingApi.positions(), marketApi.status(),
    ]);
    if (accountResult.status === 'fulfilled') setAccount(accountResult.value);
    if (summaryResult.status === 'fulfilled') setSummary(summaryResult.value);
    if (positionsResult.status === 'fulfilled') setPositions(positionsResult.value);
    if (statusResult.status === 'fulfilled') {
      setMarketStatus(statusResult.value);
      setMarketStatusUnavailable(false);
    } else {
      setMarketStatusUnavailable(true);
    }
  }, []);

  useEffect(() => {
    void refreshPortfolio();
    accountApi.getInstruments('', 100).then(async (rows) => {
      let tradable = rows.filter((row) => row.is_tradable);
      if (!tradable.some((row) => row.symbol === selected)) {
        try {
          const inst = await accountApi.getInstrument(selected);
          if (inst && inst.is_tradable) tradable = [inst, ...tradable];
        } catch (e) { /* ignore */ }
      }
      setInstruments(tradable);
      if (!tradable.some((row) => row.symbol === selected)) setSelected(tradable[0]?.symbol ?? '');
    }).catch(() => setInstruments([]));
    const timer = window.setInterval(() => void refreshPortfolio(), 15000);
    return () => window.clearInterval(timer);
  }, [refreshPortfolio]);

  async function submitOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedInstrument || !canSubmitOrder) return;

    const confirm = localStorage.getItem('quantx_confirm_orders') !== 'false';
    if (confirm && !window.confirm(`Are you sure you want to ${side} ${quantity} shares of ${selectedInstrument.symbol}?`)) {
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      const order = await tradingApi.placeOrder({ instrument_id: selectedInstrument.id, side, product, order_type: 'MARKET', quantity: Number(quantity), validity: 'DAY', idempotency_key: crypto.randomUUID() });
      setNotice({ kind: 'success', text: `${order.symbol} ${order.side.toLowerCase()} order ${order.status.toLowerCase()} · ${order.filled_quantity}/${order.quantity} filled.` });
      import('../services/notificationService').then(({ notificationService }) => {
        notificationService.addNotification(
          `Order Placed: ${side} ${selectedInstrument.symbol}`,
          `Successfully placed a MARKET ${product} order for ${quantity} shares of ${selectedInstrument.symbol}. Status: ${order.status}.`,
          'ACCOUNT'
        );
      });
      await refreshPortfolio();
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Could not submit your paper order.' });
    } finally { setSending(false); }
  }

  const marketConnected = Boolean(marketStatus?.connected && feedState === 'live');
  const demoMode = marketStatus?.mode === 'demo' || demoQuote;
  const totalPnl = num(summary?.total_pnl);

  return (
    <div className="trade-page dashboard-page">
      <section className="trade-welcome">
        <div>
          <p className="trade-eyebrow"><span className={`trade-live-dot ${marketConnected ? 'is-live' : ''}`} /> YOUR PAPER TRADING DESK <span>·</span> {new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toUpperCase()}</p>
          <h1>Good day, {user?.name.split(' ')[0] ?? 'Trader'}.</h1>
          <p className="trade-subtitle">Build conviction by practicing against current market depth.</p>
        </div>
        <div className={`trade-feed-badge ${marketConnected ? 'feed-live' : 'feed-idle'}`} title={snapshotQuote ? 'IndianAPI price snapshots refresh about once per minute. They do not include market depth and cannot drive simulated fills.' : demoMode ? 'The backend generates practice prices when 021 has no current quote. Trades settle only in the local paper account.' : marketStatusUnavailable ? 'Could not read the authenticated market status endpoint.' : undefined}><i />{snapshotQuote ? 'API SNAPSHOT' : demoMode ? 'DATA' : marketConnected ? 'LIVE MARKET FEED' : marketStatusUnavailable ? 'MARKET STATUS UNAVAILABLE' : !marketStatus ? 'CHECKING MARKET FEED' : marketStatus.enabled ? 'CONNECTING TO FEED' : 'MARKET FEED NOT CONFIGURED'}</div>
      </section>

      <section className="trade-hero-grid four" aria-label="Paper portfolio summary">
        <article className="trade-equity-card">
          <div className="trade-card-label"><span>SIMULATED ACCOUNT EQUITY</span><span className="trade-card-icon"><Activity size={17} /></span></div>
          <strong className="trade-equity-value">{summary ? formatINR(summary.equity) : '—'}</strong>
          <div className="trade-equity-foot"><span className={totalPnl >= 0 ? 'trade-positive' : 'trade-negative'}>{totalPnl >= 0 ? '+' : ''}{formatINR(totalPnl)} net P&amp;L</span><span>cash + open positions</span></div>
          <div className="trade-equity-mark"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div>
        </article>
        <article className="trade-metric-card"><div className="trade-card-label"><span>AVAILABLE CASH</span><Wallet size={17} /></div><strong>{summary ? formatINR(num(summary.cash_balance) - num(summary.reserved_cash)) : '—'}</strong><small>{formatINR(summary?.reserved_cash ?? 0)} reserved for open orders</small><button onClick={() => navigate('/account')}>View account ledger <ArrowRight size={14} /></button></article>
        <article className="trade-metric-card"><div className="trade-card-label"><span>OPEN POSITIONS</span><CandlestickChart size={17} /></div><strong>{summary?.open_positions ?? '—'}</strong><small>{summary ? `${formatINR(summary.market_value)} market exposure` : 'Loading your portfolio'}</small><button onClick={() => navigate('/portfolio/positions')}>Review positions <ArrowRight size={14} /></button></article>
        <article className="trade-metric-card"><div className="trade-card-label"><span>ORDERS IN PROGRESS</span><Clock3 size={17} /></div><strong>{summary?.open_orders ?? '—'}</strong><small>Open, pending, or partially filled</small><button onClick={() => navigate('/orders')}>Open order book <ArrowRight size={14} /></button></article>
      </section>

      <div className="trade-dashboard-columns">
        <div className="trade-stack">
          <section className="trade-panel trade-positions-panel">
            <div className="trade-panel-heading"><div><span className="trade-section-kicker">ACCOUNT EXPOSURE</span><h2>Open positions</h2></div><button className="trade-link-button" onClick={() => navigate('/portfolio')}>Portfolio overview <ArrowRight size={14} /></button></div>
            {positions.length === 0 ? <div className="trade-empty"><div className="trade-empty-icon"><Layers3 size={21} /></div><strong>Your portfolio starts here</strong><p>Place a paper order to see live positions and mark-to-market P&amp;L in this table.</p><button onClick={() => navigate('/explore')}>Explore NSE equities <ArrowRight size={14} /></button></div> : (
              <div className="trade-table-wrap"><table className="trade-table"><thead><tr><th>INSTRUMENT</th><th>PRODUCT</th><th>NET QTY</th><th>AVG / LTP</th><th>UNREALIZED P&amp;L</th></tr></thead><tbody>{positions.map((position) => {
                const quote = quotes[position.symbol];
                const ltp = num(quote?.last_price ?? position.current_price);
                const pnl = (ltp - num(position.average_price)) * position.quantity;
                return <tr key={position.id} onClick={() => navigate(`/stocks/${position.symbol}`)}><td><strong>{position.symbol}</strong><small>{position.company_name}</small></td><td><span className={`trade-product-chip ${position.product.toLowerCase()}`}>{position.product}</span></td><td>{position.quantity > 0 ? `+${position.quantity}` : position.quantity}</td><td>{formatINR(position.average_price)}<small>{formatINR(ltp)}</small></td><td className={pnl >= 0 ? 'trade-positive' : 'trade-negative'}>{pnl >= 0 ? '+' : ''}{formatINR(pnl)}</td></tr>;
              })}</tbody></table></div>
            )}
          </section>

          <TradingViewCandleChart symbol={selected} quote={selectedQuote} />

          <section className="trade-panel">
            <div className="trade-panel-heading"><div><span className="trade-section-kicker">NSE CASH MARKET</span><h2>Market watch</h2></div><button className="trade-link-button" onClick={() => navigate('/explore')}>All instruments <ArrowRight size={14} /></button></div>
            <div className="trade-market-grid">{initialSymbols.map((symbol) => {
              const quote = quotes[symbol];
              const price = quote ? num(quote.last_price) : undefined;
              const change = quote?.previous_close ? ((price! - num(quote.previous_close)) / num(quote.previous_close)) * 100 : undefined;
              return <button className="trade-market-tile" key={symbol} onClick={() => navigate(`/stocks/${symbol}`)}><span>{symbol}</span><strong>{price === undefined ? '—' : formatINR(price)}</strong><small className={change === undefined ? '' : change >= 0 ? 'trade-positive' : 'trade-negative'}>{change === undefined ? 'Waiting for quote' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}% today`}</small></button>;
            })}</div>
          </section>
        </div>

        <aside className="trade-stack">
          <form className="trade-panel trade-ticket" onSubmit={submitOrder}>
            <div className="trade-panel-heading"><div><span className="trade-section-kicker">SIMULATED EXECUTION</span><h2>Quick order</h2></div><span className="trade-practice-mark"><ShieldCheck size={14} /> PAPER</span></div>
            <p className="trade-ticket-note">{demoMode ? 'Practice prices and order-book depth are generated locally. Filled orders update your paper account, never a broker.' : 'Orders execute locally against the live NSE bid and ask book.'}</p>
            <div className="trade-side-switch"><button type="button" className={side === 'BUY' ? 'buy-active' : ''} onClick={() => setSide('BUY')}>Buy</button><button type="button" className={side === 'SELL' ? 'sell-active' : ''} onClick={() => setSide('SELL')}>Sell</button></div>
            <label className="trade-form-label">INSTRUMENT<select value={selected} onChange={(event) => setSelected(event.target.value)} required>{instruments.map((instrument) => <option value={instrument.symbol} key={instrument.id}>{instrument.symbol} · {instrument.name}</option>)}</select></label>
            <div className="trade-quote-line"><span>{demoQuote ? 'Price · Data' : quoteFresh ? 'Fresh market quote' : selectedQuote ? 'Quote is stale' : 'Live quote unavailable'}</span><strong>{selectedQuote ? formatINR(selectedQuote.last_price) : '—'}</strong></div>
            <div className="trade-form-row"><label className="trade-form-label">PRODUCT<select value={product} onChange={(event) => setProduct(event.target.value as 'MIS' | 'CNC')}><option value="MIS">Intraday (MIS)</option><option value="CNC">Delivery (CNC)</option></select></label><label className="trade-form-label">QUANTITY<input type="number" min="1" max="1000000" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label></div>
            <div className="trade-order-total"><span>Estimated turnover</span><strong>{selectedQuote ? formatINR(num(selectedQuote.last_price) * (Number(quantity) || 0)) : '—'}</strong></div>
            {notice && <div className={`trade-notice ${notice.kind}`} role="status">{notice.text}</div>}
        <button className={`trade-submit-button ${side === 'SELL' ? 'sell' : ''}`} disabled={sending || !canSubmitOrder}>{sending ? 'Submitting…' : snapshotQuote ? 'Snapshot only · orders unavailable' : !quoteFresh ? 'Waiting for a fresh quote' : !selectedInstrument?.provider_token && !demoQuote ? 'Market instrument unavailable' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${selected || 'instrument'}`}</button>
            <small className="trade-compliance-note">Paper trading only. No real orders or funds are involved.</small>
          </form>

          <section className="trade-session-card"><div className="trade-session-icon"><CircleDollarSign size={19} /></div><div><strong>Practice capital</strong><span>{account?.account_number ?? 'Loading paper account'}</span></div><button aria-label="View practice account" onClick={() => navigate('/account')}><ArrowRight size={16} /></button><p>Every fill, charge, and balance change is written to your account ledger.</p></section>
          <button className="trade-refresh-button" onClick={() => void refreshPortfolio()}><RefreshCw size={14} /> Refresh account data</button>
        </aside>
      </div>
    </div>
  );
}
