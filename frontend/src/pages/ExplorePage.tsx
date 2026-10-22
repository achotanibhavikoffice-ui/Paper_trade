import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Flame, Layers, Search, Star, TrendingDown, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { accountApi, insightsApi, marketApi, type Instrument, type MarketMover, type MarketStatus } from '../api';
import { useMarketFeed } from '../hooks/useMarketFeed';
import { useWatchlist } from '../hooks/useWatchlist';

const inr = (value: number | string | undefined | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value) || 0);
const INSTRUMENT_PAGE_SIZE = 500;

const formatVolume = (val: number | null | undefined) => {
  if (!val) return '—';
  if (val >= 10_000_000) return `${(val / 10_000_000).toFixed(2)} Cr`;
  if (val >= 100_000) return `${(val / 100_000).toFixed(2)} L`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)} K`;
  return val.toLocaleString('en-IN');
};

export function ExplorePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Instrument[]>([]);
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [visibleQuoteSymbols, setVisibleQuoteSymbols] = useState<string[]>([]);
  const [error, setError] = useState('');
  const { symbols: saved, toggle } = useWatchlist();

  // IndianAPI Top Movers / Trending state - default to Most Active NSE where real charts are guaranteed
  const [moverTab, setMoverTab] = useState<'active' | 'gainers' | 'losers'>('active');
  const [gainers, setGainers] = useState<MarketMover[]>([]);
  const [losers, setLosers] = useState<MarketMover[]>([]);
  const [mostActive, setMostActive] = useState<MarketMover[]>([]);
  const [moversLoading, setMoversLoading] = useState(true);
  const [moversError, setMoversError] = useState('');
  const [moversRetry, setMoversRetry] = useState(0);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [quoteWaitElapsed, setQuoteWaitElapsed] = useState(false);
  const [quoteRetry, setQuoteRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setMoversLoading(true);
    setMoversError('');
    Promise.allSettled([insightsApi.trending(), insightsApi.mostActive('NSE')]).then(([trendRes, activeRes]) => {
      if (!active) return;
      const failures: string[] = [];
      if (trendRes.status === 'fulfilled') {
        setGainers(trendRes.value.gainers || []);
        setLosers(trendRes.value.losers || []);
      } else failures.push(trendRes.reason instanceof Error ? trendRes.reason.message : 'Gainers and losers are unavailable.');
      if (activeRes.status === 'fulfilled') {
        setMostActive(activeRes.value.items || []);
      } else failures.push(activeRes.reason instanceof Error ? activeRes.reason.message : 'Active-share data is unavailable.');
      // Both endpoints commonly return the same upstream quota error.
      setMoversError([...new Set(failures)].join(' '));
      setMoversLoading(false);
    });
    return () => { active = false; };
  }, [moversRetry]);

  useEffect(() => {
    let active = true;
    const refresh = () => marketApi.status().then((status) => { if (active) setMarketStatus(status); }).catch(() => {});
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      accountApi.getInstruments(search, INSTRUMENT_PAGE_SIZE).then((rows) => {
        if (active) { setItems(rows); setHasMore(rows.length === INSTRUMENT_PAGE_SIZE); setError(''); }
      }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load NSE instruments.'); })
        .finally(() => { if (active) setLoading(false); });
    }, search ? 220 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);

  async function loadMoreInstruments() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const rows = await accountApi.getInstruments(search, INSTRUMENT_PAGE_SIZE, items.length);
      setItems((current) => [...current, ...rows]);
      setHasMore(rows.length === INSTRUMENT_PAGE_SIZE);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load more NSE instruments.');
    } finally {
      setLoadingMore(false);
    }
  }

  const sectors = useMemo(() => ['ALL', ...new Set(items.map((item) => item.sector).filter((value): value is string => Boolean(value)))], [items]);
  const filtered = useMemo(() => sector === 'ALL' ? items : items.filter((item) => item.sector === sector), [items, sector]);

  useEffect(() => {
    const initialSymbols = filtered.slice(0, 24).map((item) => item.symbol);
    setVisibleQuoteSymbols(initialSymbols);
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-market-symbol]'));
    if (!('IntersectionObserver' in window) || rows.length === 0) return;

    const visible = new Set(initialSymbols);
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const symbol = (entry.target as HTMLElement).dataset.marketSymbol;
        if (!symbol) continue;
        if (entry.isIntersecting) visible.add(symbol);
        else visible.delete(symbol);
      }
      const nextSymbols = [...visible].slice(0, 25);
      setVisibleQuoteSymbols((current) => current.join(',') === nextSymbols.join(',') ? current : nextSymbols);
    }, { rootMargin: '160px 0px' });
    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [filtered]);

  const quoteSymbols = useMemo(() => visibleQuoteSymbols.slice(0, 25), [visibleQuoteSymbols]);
  const { quotes } = useMarketFeed(quoteSymbols, { pollIndianApi: true, refreshKey: quoteRetry });
  useEffect(() => {
    setQuoteWaitElapsed(false);
    if (!quoteSymbols.length) return;
    const timer = window.setTimeout(() => setQuoteWaitElapsed(true), 30000);
    return () => window.clearTimeout(timer);
  }, [quoteSymbols.join(',')]);
  const hasPracticeQuotes = Object.values(quotes).some((quote) => quote.data_source === 'demo');
  const hasIndianApiQuotes = Object.values(quotes).some((quote) => quote.data_source === 'indianapi');
  const apiError = marketStatus?.indian_api?.last_error;
  const snapshotError = apiError?.code === 'not_configured' && marketStatus?.connected ? null : apiError;
  const retryWait = marketStatus?.indian_api?.retry_after_seconds ?? 0;
  const quotesUnavailable = Boolean(snapshotError || (marketStatus && !marketStatus.connected && !hasPracticeQuotes));
  const unavailableQuoteLabel = snapshotError
    ? 'Provider unavailable'
    : marketStatus?.provider_error
      ? 'Feed disconnected'
      : marketStatus?.enabled
        ? 'No current quote'
        : 'Market data not configured';

  const activeMovers = moverTab === 'active' ? mostActive : moverTab === 'gainers' ? gainers : losers;
  const moverUnavailableMessage = snapshotError
    ? 'Market movers are unavailable while the quote provider recovers. See feed status below.'
    : moversError || 'No market movers were returned by the provider.';

  return (
    <div className="trade-page">
      <header className="trade-page-heading">
        <div>
          <p className="trade-eyebrow">NSE CASH MARKET {hasPracticeQuotes && <span className="trade-demo-label">· DATA</span>}</p>
          <h1>Explore equities</h1>
            <p className="trade-subtitle">Search NSE equity and SME listings. Visible shares request IndianAPI price snapshots and refresh about once per minute.</p>
        </div>
        <div className="trade-count-chip">{items.length}{hasMore ? '+' : ''} instruments loaded</div>
      </header>

      {/* Real Top Movers & Trending from IndianAPI */}
      <section className="trade-panel trade-movers-panel" aria-label="Real Market Movers">
        <div className="trade-panel-heading">
          <div>
            <span className="trade-section-kicker"><Flame size={14} /> LIVE MARKET RADAR · INDIANAPI DATA</span>
            <h2>Market Movers &amp; Trending</h2>
          </div>
          <div className="trade-mover-tabs">
            <button className={moverTab === 'active' ? 'active' : ''} onClick={() => setMoverTab('active')}>
              <Layers size={13} /> Active NSE ({mostActive.length})
            </button>
            <button className={moverTab === 'gainers' ? 'active' : ''} onClick={() => setMoverTab('gainers')}>
              <TrendingUp size={13} /> Gainers ({gainers.length})
            </button>
            <button className={moverTab === 'losers' ? 'active' : ''} onClick={() => setMoverTab('losers')}>
              <TrendingDown size={13} /> Losers ({losers.length})
            </button>
          </div>
        </div>

        {moversLoading ? (
          <div className="trade-table-loading"><span /><span /><span /></div>
        ) : activeMovers.length === 0 ? (
          <div className="trade-inline-empty trade-provider-empty">
            <span>{moverUnavailableMessage}</span>
            <button type="button" className="trade-provider-retry" onClick={() => setMoversRetry((value) => value + 1)} disabled={retryWait > 0}>
              {retryWait > 0 ? `Retry in ${Math.ceil(retryWait / 60)} min` : 'Retry market movers'}
            </button>
          </div>
        ) : (
          <div className="trade-movers-grid">
            {activeMovers.slice(0, 10).map((mover, index) => {
              const sym = mover.symbol || '—';
              const chg = mover.percent_change ?? 0;
              const isUp = chg >= 0;
              const isBse = mover.exchange === 'BSE';
              return (
                <article
                  key={`${sym}-${index}`}
                  className="trade-mover-card"
                  onClick={() => sym !== '—' && navigate(`/stocks/${sym}`)}
                  title={isBse ? `Open quote for ${sym} (BSE)` : `Open real chart for ${sym} (NSE)`}
                >
                  <div className="trade-mover-header">
                    <div>
                      <strong>{sym}</strong>
                      <small title={mover.name || undefined}>{mover.name || 'NSE Equity'}</small>
                    </div>
                    <span className={`trade-mover-pill ${isUp ? 'up' : 'down'}`}>
                      {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {isUp ? '+' : ''}{chg.toFixed(2)}%
                    </span>
                  </div>
                  <div className="trade-mover-footer">
                    <span className="trade-mover-price">{inr(mover.price)}</span>
                    <span className="trade-mover-volume">{isBse ? 'BSE' : 'NSE'} · {formatVolume(mover.volume)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {snapshotError && <div className="trade-notice error" role="status">
        <span>
          {snapshotError.message}{retryWait > 0 ? ` Retry in about ${Math.ceil(retryWait / 60)} minute(s).` : ''}
          {marketStatus?.provider_error ? ` ${marketStatus.provider_error}` : ''}
          {!marketStatus?.connected ? ' No verified current quote is available until a provider reconnects.' : ''}
        </span>
        <button type="button" className="trade-provider-retry" onClick={() => setQuoteRetry((value) => value + 1)} disabled={retryWait > 0}>
          {retryWait > 0 ? `Retry in ${Math.ceil(retryWait / 60)} min` : 'Retry quotes'}
        </button>
      </div>}

      <section className="trade-panel trade-explore-controls">
        <label className="trade-search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by ticker or company name (e.g. TCS, RELIANCE, INFOSYS)"
            aria-label="Search instruments"
          />
          <kbd>⌘ K</kbd>
        </label>
        <div className="trade-sector-filters" aria-label="Filter by sector">
          {sectors.map((value) => (
            <button key={value} className={sector === value ? 'active' : ''} onClick={() => setSector(value)}>
              {value === 'ALL' ? 'All sectors' : value}
            </button>
          ))}
        </div>
      </section>

      {error && <div className="trade-notice error" role="alert">{error}</div>}

      <section className="trade-panel trade-table-panel">
        {loading ? (
          <div className="trade-table-loading"><span /><span /><span /><span /><span /></div>
        ) : filtered.length === 0 ? (
          <div className="trade-empty">
            <div className="trade-empty-icon"><Search size={20} /></div>
            <strong>No matching instruments</strong>
            <p>Try a ticker symbol or another company name.</p>
          </div>
        ) : (
          <div className="trade-table-wrap">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>INSTRUMENT</th>
                  <th>SECTOR</th>
                  <th>LAST PRICE</th>
                  <th>DAY CHANGE</th>
                  <th>MARKET DEPTH</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const quote = quotes[item.symbol];
                  const price = quote ? Number(quote.last_price) : null;
                  const previous = Number(quote?.previous_close ?? 0);
                  const change = price !== null && previous > 0 ? ((price - previous) / previous) * 100 : null;
                  const isSaved = saved.includes(item.symbol);
                  return (
                    <tr key={item.id} data-market-symbol={item.symbol} onClick={() => navigate(`/stocks/${item.symbol}`)}>
                      <td>
                        <div className="trade-instrument-cell">
                          <button
                            className={`trade-star ${isSaved ? 'saved' : ''}`}
                            aria-label={isSaved ? `Remove ${item.symbol} from watchlist` : `Add ${item.symbol} to watchlist`}
                            onClick={(event) => { event.stopPropagation(); toggle(item.symbol); }}
                          >
                            <Star size={16} fill={isSaved ? 'currentColor' : 'none'} />
                          </button>
                          <span><strong>{item.symbol}</strong><small>{item.name}</small></span>
                        </div>
                      </td>
                      <td>{item.sector || '—'}</td>
                      <td>{price === null ? <span className="trade-data-muted">{quotesUnavailable ? unavailableQuoteLabel : quoteWaitElapsed ? 'No current quote' : 'Requesting snapshot'}</span> : <span title={`${quote?.data_source === 'indianapi' ? 'IndianAPI snapshot' : 'Market quote'} · ${new Date(quote!.timestamp).toLocaleString('en-IN')}`}>{inr(price)}</span>}</td>
                      <td className={change === null ? '' : change >= 0 ? 'trade-positive' : 'trade-negative'}>
                        {change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
                      </td>
                      <td>
                        <span className="trade-depth-count">
                          {quote?.data_source === 'indianapi' ? 'Price only · no depth' : quote ? `${quote.bids.filter((level) => level.quantity > 0).length} bids · ${quote.asks.filter((level) => level.quantity > 0).length} asks` : quotesUnavailable || quoteWaitElapsed ? 'No quote/depth' : 'Snapshot pending'}
                        </span>
                      </td>
                      <td>
                        <button className="trade-row-action" onClick={(event) => { event.stopPropagation(); navigate(`/stocks/${item.symbol}`); }}>
                          Inspect <ArrowUpRight size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <footer className="trade-table-footer">
          <span>NSE equity and SME catalogue. Search by symbol or company name.</span>
          <span>{hasIndianApiQuotes ? 'IndianAPI snapshots are reference prices; paper orders remain simulated.' : hasPracticeQuotes ? 'Generated practice prices/depth power local paper fills.' : 'Orders are simulated locally.'}</span>
        </footer>
        {hasMore && <div className="trade-table-footer"><button className="trade-secondary-button" onClick={() => void loadMoreInstruments()} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more instruments'}</button></div>}
      </section>
    </div>
  );
}
