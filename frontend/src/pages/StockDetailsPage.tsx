import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Layers3, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { accountApi, tradingApi, type Instrument, type OrderProduct, type OrderSide, type OrderType } from '../api';
import { useMarketFeed } from '../hooks/useMarketFeed';
import { useWatchlist } from '../hooks/useWatchlist';
import { TradingViewCandleChart } from '../components/charts/TradingViewCandleChart';
import { notificationService } from '../services/notificationService';
import { NewsFeed } from '../components/news/NewsFeed';

const inr = (value: number | string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value) || 0);
const DEFAULT_CHART_SYMBOLS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'BHARTIARTL', 'SBIN', 'TRENT', 'BAJFINANCE'];

export function StockDetailsPage() {
  const { symbol = '' } = useParams<{ symbol: string }>();
  const ticker = symbol.toUpperCase();
  const navigate = useNavigate();
  const { symbols: saved, toggle } = useWatchlist();
  const [instrument, setInstrument] = useState<Instrument | null | undefined>(undefined);
  const [side, setSide] = useState<OrderSide>('BUY');
  const [product, setProduct] = useState<OrderProduct>((localStorage.getItem('quantx_default_product') as OrderProduct) || 'MIS');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const chartSymbols = [...new Set([ticker, ...(saved.length ? saved : DEFAULT_CHART_SYMBOLS)])].slice(0, 12);
  const { quotes, state: feedState } = useMarketFeed(chartSymbols, { pollIndianApi: true });
  const quote = quotes[ticker];
  const demoQuote = quote?.data_source === 'demo';
  const snapshotQuote = quote?.data_source === 'indianapi';
  const quoteFresh = Boolean(quote && clockNow - Date.parse(quote.timestamp) <= 120_000);
  const canSubmitOrder = Boolean(instrument && instrument.is_tradable && !snapshotQuote && quoteFresh && feedState === 'live' && (instrument.provider_token || demoQuote));
  const price = Number(quote?.last_price ?? 0);
  const previous = Number(quote?.previous_close ?? 0);
  const change = previous > 0 ? ((price - previous) / previous) * 100 : null;
  const savedInWatchlist = saved.includes(ticker);
  const filledDepth = useMemo(() => ({ bids: quote?.bids.filter((level) => level.quantity > 0) ?? [], asks: quote?.asks.filter((level) => level.quantity > 0) ?? [] }), [quote]);
  const maxDepth = Math.max(1, ...filledDepth.bids.map((level) => level.quantity), ...filledDepth.asks.map((level) => level.quantity));

  useEffect(() => {
    let active = true;
    setInstrument(undefined);
    accountApi.getInstrument(ticker)
      .then((row) => {
        if (active) setInstrument(row);
      })
      .catch(() => {
        if (active) {
          setInstrument({
            id: ticker,
            symbol: ticker,
            name: ticker,
            exchange: 'NSE',
            instrument_type: 'EQUITY',
            is_tradable: false,
            lot_size: 1,
            tick_size_paise: 1,
          });
        }
      });
    return () => { active = false; };
  }, [ticker]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!quote) return;
    const ltp = Number(quote.last_price);
    if (!limitPrice) setLimitPrice(ltp.toFixed(2));
    if (!triggerPrice) {
      const defaultTrigger = side === 'BUY' ? ltp * 1.01 : ltp * 0.99;
      setTriggerPrice(defaultTrigger.toFixed(2));
    }
  }, [quote, limitPrice, triggerPrice, side]);

  async function submitOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!instrument || !canSubmitOrder) return;

    const confirm = localStorage.getItem('quantx_confirm_orders') !== 'false';
    if (confirm && !window.confirm(`Are you sure you want to ${side} ${quantity} shares of ${instrument.symbol}?`)) {
      return;
    }
    setSubmitting(true); setMessage(null);
    try {
      const order = await tradingApi.placeOrder({
        instrument_id: instrument.id, side, product, order_type: orderType, quantity: Number(quantity),
        limit_price: ['LIMIT', 'SL'].includes(orderType) && limitPrice ? limitPrice : null,
        trigger_price: ['SL', 'SL-M'].includes(orderType) && triggerPrice ? triggerPrice : null,
        validity: 'DAY', idempotency_key: crypto.randomUUID()
      });
      setMessage({ kind: 'success', text: `${order.status}: ${order.filled_quantity} of ${order.quantity} shares filled.` });
      
      // Add notification for real experience
      notificationService.addNotification(
        `Order Placed: ${side} ${ticker}`,
        `Successfully placed a ${orderType} ${product} order for ${quantity} shares of ${ticker}. Status: ${order.status}.`,
        'ACCOUNT'
      );
      
      window.setTimeout(() => navigate(`/orders/${order.id}`), 850);
    } catch (error) { setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Order could not be submitted.' }); }
    finally { setSubmitting(false); }
  }

  if (instrument === undefined) return <div className="trade-page"><section className="trade-panel trade-inline-empty">Loading instrument and market details…</section></div>;
  if (instrument === null) return <div className="trade-page"><button className="trade-back-button" onClick={() => navigate('/explore')}><ArrowLeft size={16} /> Markets</button><section className="trade-panel trade-empty"><strong>{ticker || 'Instrument'} isn’t available in the current NSE cash catalogue.</strong><p>Search the supported instruments and try again.</p><button onClick={() => navigate('/explore')}>Browse instruments</button></section></div>;

  return <div className="trade-page">
    <button className="trade-back-button" onClick={() => navigate('/explore')}><ArrowLeft size={16} /> Explore markets</button>
    <header className="trade-stock-heading">
      <div>
        <p className="trade-eyebrow">{instrument.exchange} CASH EQUITY <span>·</span> {instrument.sector || 'NSE LISTING'}</p>
        <h1>{instrument.symbol}</h1>
        <p>{instrument.name}</p>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button
          className="trade-secondary-button"
          onClick={() => navigate(`/what-if?symbol=${ticker}`)}
          title="Simulate scenario in What-If Lab"
        >
          <Sparkles size={16} style={{ color: '#098b79' }} /> What-if Lab
        </button>
        <button className={`trade-watch-button ${savedInWatchlist ? 'saved' : ''}`} onClick={() => toggle(ticker)}>
          <Star size={16} fill={savedInWatchlist ? 'currentColor' : 'none'} />
          {savedInWatchlist ? 'In watchlist' : 'Add to watchlist'}
        </button>
      </div>
    </header>
    <section className="trade-stock-quote"><div><span>{snapshotQuote ? `INDIANAPI SNAPSHOT · ${quoteFresh ? 'FRESH' : 'STALE'}` : demoQuote ? 'PRICE · DATA' : quoteFresh ? 'LAST TRADED PRICE · FRESH' : quote ? 'LAST TRADED PRICE · STALE' : 'LAST TRADED PRICE · WAITING'}</span><strong>{quote ? inr(price) : '—'}</strong>{change !== null && <small className={change >= 0 ? 'trade-positive' : 'trade-negative'}>{change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change >= 0 ? '+' : ''}{change.toFixed(2)}% today</small>}</div><dl><div><dt>Day high</dt><dd>{quote?.high ? inr(quote.high) : '—'}</dd></div><div><dt>Day low</dt><dd>{quote?.low ? inr(quote.low) : '—'}</dd></div><div><dt>Volume</dt><dd>{quote?.volume ? Number(quote.volume).toLocaleString('en-IN') : '—'}</dd></div><div><dt>{snapshotQuote ? 'Snapshot fetched' : demoQuote ? 'Data updated' : 'Quote received'}</dt><dd>{quote ? new Date(quote.timestamp).toLocaleTimeString('en-IN') : 'Awaiting quote snapshot'}</dd></div></dl></section>
    <section className="tv-workspace" aria-label="Trading chart workspace">
      <div className="tv-workspace-main"><TradingViewCandleChart symbol={ticker} quote={quote} /></div>
      <aside className="tv-watchlist" aria-label="Market watchlist">
        <header><div><strong>Watchlist</strong><small>NSE cash market</small></div><span>{chartSymbols.length}</span></header>
        <div className="tv-watchlist-columns"><span>SYMBOL</span><span>LAST</span><span>CHG%</span></div>
        <div className="tv-watchlist-rows">{chartSymbols.map((item) => {
          const itemQuote = quotes[item];
          const last = Number(itemQuote?.last_price ?? 0);
          const previousClose = Number(itemQuote?.previous_close ?? 0);
          const percent = previousClose > 0 ? ((last - previousClose) / previousClose) * 100 : null;
          return <button key={item} className={`tv-watch-row ${item === ticker ? 'selected' : ''}`} onClick={() => item !== ticker && navigate(`/stocks/${item}`)} aria-current={item === ticker ? 'page' : undefined}>
            <span className="tv-watch-symbol"><strong>{item}</strong><small>{itemQuote?.exchange ?? 'NSE'}</small></span>
            <span className="tv-watch-price">{itemQuote ? inr(last) : '—'}</span>
            <span className={`tv-watch-change ${percent === null ? '' : percent >= 0 ? 'positive' : 'negative'}`}>{percent === null ? '—' : `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`}</span>
          </button>;
        })}</div>
        <footer><i className={feedState === 'live' ? 'connected' : ''} />{snapshotQuote ? 'IndianAPI snapshot · refreshes about once per minute' : demoQuote ? 'DATA · practice quotes' : feedState === 'live' ? 'Market feed connected' : 'Waiting for market quotes'}</footer>
      </aside>
    </section>
    <div className="trade-stock-grid">
      <div className="trade-stack">
        <section className="trade-panel trade-depth-panel"><div className="trade-panel-heading"><div><span className="trade-section-kicker">{snapshotQuote ? 'INDIANAPI PRICE SNAPSHOT' : demoQuote ? 'DATA · ORDER BOOK' : 'LIVE EXCHANGE SNAPSHOT'}</span><h2><Layers3 size={18} /> Market depth</h2></div><span className={`trade-feed-badge ${feedState === 'live' ? 'feed-live' : 'feed-idle'}`}><i />{snapshotQuote ? 'NO DEPTH' : demoQuote ? 'DATA' : feedState === 'live' ? 'CONNECTED' : 'WAITING'}</span></div><p className="trade-help-copy">{snapshotQuote ? 'IndianAPI returns a price snapshot without bid/ask levels. It is shown for reference and does not drive paper fills.' : demoQuote ? 'Practice bid and ask levels are generated by the backend and drive paper fills. They are not exchange orders.' : 'The local paper matcher consumes visible bid and ask quantity. Depth shown here is from the provider feed.'}</p>
          {!quote ? <div className="trade-depth-empty">{feedState === 'offline' ? 'Market feed is offline or not configured.' : 'Waiting for the first market packet…'}</div> : <div className="trade-book-grid">{(['bids', 'asks'] as const).map((book) => <div className={`trade-book-column ${book}`} key={book}><div className="trade-book-title"><span>{book === 'bids' ? 'BUY ORDERS' : 'SELL ORDERS'}</span><span>QTY · PRICE</span></div>{(book === 'bids' ? filledDepth.bids : filledDepth.asks).slice(0, 5).map((level, index) => <div className="trade-book-row" key={`${book}-${index}`}><i style={{ width: `${Math.max(3, level.quantity / maxDepth * 100)}%` }} /><span>{level.quantity.toLocaleString('en-IN')}</span><strong>{inr(level.price)}</strong></div>)}{(book === 'bids' ? filledDepth.bids : filledDepth.asks).length === 0 && <div className="trade-depth-empty">No depth published</div>}</div>)}</div>}
        </section>
        <section className="trade-panel trade-stock-facts"><span className="trade-section-kicker">INSTRUMENT DETAILS</span><div><span>Symbol</span><strong>{instrument.symbol}</strong></div><div><span>Exchange</span><strong>{instrument.exchange}</strong></div><div><span>Segment</span><strong>{instrument.instrument_type}</strong></div><div><span>Lot size</span><strong>{instrument.lot_size} shares</strong></div><div><span>Tick size</span><strong>{(Number(instrument.tick_size_paise ?? 1) / 100).toFixed(2)}</strong></div></section>
      </div>

      <form className="trade-panel trade-ticket trade-stock-ticket" onSubmit={submitOrder}><div className="trade-panel-heading"><div><span className="trade-section-kicker">PAPER EXECUTION</span><h2>Place an order</h2></div><span className="trade-practice-mark"><ShieldCheck size={14} /> SIMULATED</span></div><p className="trade-ticket-note">Review the order terms. Quantx never routes your order to the broker.</p>
        <div className="trade-side-switch"><button type="button" className={side === 'BUY' ? 'buy-active' : ''} onClick={() => setSide('BUY')}>Buy</button><button type="button" className={side === 'SELL' ? 'sell-active' : ''} onClick={() => setSide('SELL')}>Sell</button></div>
        <label className="trade-form-label">PRODUCT<select value={product} onChange={(event) => setProduct(event.target.value as OrderProduct)}><option value="MIS">Intraday (MIS)</option><option value="CNC">Delivery (CNC)</option></select></label>
        <label className="trade-form-label">ORDER TYPE<select value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)}><option value="MARKET">Market</option><option value="LIMIT">Limit</option><option value="SL">Stop-loss limit</option><option value="SL-M">Stop-loss market</option></select></label>
        <label className="trade-form-label">QUANTITY<input type="number" min={instrument.lot_size} step={instrument.lot_size} max="1000000" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        {['LIMIT', 'SL'].includes(orderType) && <label className="trade-form-label">LIMIT PRICE<input type="number" min="0.01" step="any" value={limitPrice} onChange={(event) => setLimitPrice(event.target.value)} required /></label>}
        {['SL', 'SL-M'].includes(orderType) && <label className="trade-form-label">TRIGGER PRICE<input type="number" min="0.01" step="any" value={triggerPrice} onChange={(event) => setTriggerPrice(event.target.value)} required /></label>}
        <div className="trade-order-total"><span>Indicative value</span><strong>{quote ? inr(price * (Number(quantity) || 0)) : '—'}</strong></div>
        {message && <div className={`trade-notice ${message.kind}`} role="status">{message.text}</div>}
        <button className={`trade-submit-button ${side === 'SELL' ? 'sell' : ''}`} disabled={!canSubmitOrder || submitting}>{submitting ? 'Submitting…' : snapshotQuote ? 'Snapshot only · orders unavailable' : !quoteFresh ? 'Waiting for a fresh quote' : !instrument.is_tradable ? 'View-only (chart analysis)' : !instrument.provider_token && !demoQuote ? 'Instrument feed unavailable' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${ticker}`}</button>
        <div className="trade-session-footnote">MIS orders are scheduled for local auto square-off after 3:20 PM IST.</div>
      </form>
    </div>

    <section className="trade-panel" style={{ marginTop: '18px' }}>
      <div className="trade-panel-heading">
        <div>
          <span className="trade-section-kicker">MARKET INTELLIGENCE</span>
          <h2>Latest news for {ticker}</h2>
        </div>
      </div>
      <NewsFeed symbol={ticker} exchange={instrument.exchange} companyName={instrument.name} />
    </section>
  </div>;
}
