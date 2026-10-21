import { useEffect, useState } from 'react';
import { ArrowUpRight, Plus, Star, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { accountApi, type Instrument } from '../api';
import { useMarketFeed } from '../hooks/useMarketFeed';
import { useWatchlist } from '../hooks/useWatchlist';

const inr = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(value);

export function WatchlistPage() {
  const navigate = useNavigate();
  const { symbols, remove } = useWatchlist();
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [error, setError] = useState('');
  const { quotes } = useMarketFeed(symbols, { pollIndianApi: true });
  const hasPracticeQuotes = Object.values(quotes).some((quote) => quote.data_source === 'demo');
  const hasIndianApiQuotes = Object.values(quotes).some((quote) => quote.data_source === 'indianapi');

  useEffect(() => {
    let active = true;
    if (!symbols.length) { setInstruments([]); return; }
    Promise.all(symbols.map(async (symbol) => (await accountApi.getInstruments(symbol, 20)).find((item) => item.symbol === symbol)))
      .then((items) => { if (active) { setInstruments(items.filter((item): item is Instrument => Boolean(item))); setError(''); } })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load your saved instruments.'); });
    return () => { active = false; };
  }, [symbols.join(',')]);

  return <div className="trade-page">
    <header className="trade-page-heading"><div><p className="trade-eyebrow">YOUR MARKET SHORTLIST {hasIndianApiQuotes && <span className="trade-demo-label">· INDIANAPI SNAPSHOTS</span>} {hasPracticeQuotes && <span className="trade-demo-label">· DATA</span>}</p><h1>Watchlist</h1><p className="trade-subtitle">IndianAPI snapshots refresh about once per minute while this page is open (up to 25 stocks). They do not include exchange timestamps or order-book depth.</p></div><button className="trade-primary-button" onClick={() => navigate('/explore')}><Plus size={16} /> Add instruments</button></header>
    {error && <div className="trade-notice error" role="alert">{error}</div>}
    {symbols.length === 0 ? <section className="trade-panel trade-empty"><div className="trade-empty-icon"><Star size={20} /></div><strong>Save the instruments you follow</strong><p>Your shortlist stays in this browser and updates when market data is available.</p><button onClick={() => navigate('/explore')}>Explore equities <ArrowUpRight size={15} /></button></section> : (
      <section className="trade-panel trade-table-panel"><div className="trade-table-wrap"><table className="trade-table"><thead><tr><th>INSTRUMENT</th><th>LAST PRICE</th><th>HIGH / LOW</th><th>DEPTH</th><th></th></tr></thead><tbody>{symbols.map((symbol) => {
        const item = instruments.find((instrument) => instrument.symbol === symbol);
        const quote = quotes[symbol];
        return <tr key={symbol} onClick={() => navigate(`/stocks/${symbol}`)}><td><div className="trade-instrument-cell"><span className="trade-symbol-token">{symbol.slice(0, 1)}</span><span><strong>{symbol}</strong><small>{item?.name ?? 'Loading instrument…'}</small></span></div></td><td>{quote ? inr(Number(quote.last_price)) : <span className="trade-data-muted">Waiting for feed</span>}</td><td>{quote?.data_source === 'indianapi' ? 'Not provided' : quote?.high != null && quote?.low != null ? `${inr(Number(quote.high))} / ${inr(Number(quote.low))}` : '—'}</td><td><span className="trade-depth-count">{quote?.data_source === 'indianapi' ? 'No exchange depth' : quote ? `${quote.bids.length} bids · ${quote.asks.length} asks` : '—'}</span></td><td><div className="trade-row-actions"><button className="trade-row-action" onClick={(event) => { event.stopPropagation(); navigate(`/stocks/${symbol}`); }}>View <ArrowUpRight size={14} /></button><button className="trade-icon-action" aria-label={`Remove ${symbol}`} onClick={(event) => { event.stopPropagation(); remove(symbol); }}><Trash2 size={15} /></button></div></td></tr>;
      })}</tbody></table></div></section>
    )}
  </div>;
}
