import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Info, RefreshCw, Search, X } from 'lucide-react';
import { newsApi, type NewsArticle, type NewsResponse, type SentimentLabel } from '../../api';
import { EmptyState } from '../common/EmptyState';
import { NewsCard, NewsCardSkeleton } from './NewsCard';

type SentimentFilter = 'all' | SentimentLabel;

const sentimentTabs: { value: SentimentFilter; label: string }[] = [
  { value: 'all', label: 'Latest news' },
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' },
  { value: 'neutral', label: 'Neutral' },
];

export interface NewsFeedProps {
  /** Company mode: fixed to one Quantx symbol; hides ticker/keyword filters. */
  symbol?: string;
  exchange?: string;
  companyName?: string;
}

export function NewsFeed({ symbol, exchange, companyName }: NewsFeedProps) {
  const companyMode = Boolean(symbol);
  const [sentiment, setSentiment] = useState<SentimentFilter>('all');
  const [keywordInput, setKeywordInput] = useState('');
  const [tickerInput, setTickerInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [ticker, setTicker] = useState('');

  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [meta, setMeta] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (page: number) => {
      const id = ++requestId.current;
      if (page === 1) {
        setLoading(true);
        setArticles([]);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const sentimentParam = sentiment === 'all' ? undefined : sentiment;
        const response = symbol
          ? await newsApi.company(symbol, { exchange, sentiment: sentimentParam, page })
          : await newsApi.list({ symbols: ticker || undefined, q: keyword || undefined, sentiment: sentimentParam, page });
        if (id !== requestId.current) return;
        setMeta(response);
        setArticles((current) => {
          if (page === 1) return response.items;
          const seen = new Set(current.map((a) => a.id));
          return [...current, ...response.items.filter((a) => !seen.has(a.id))];
        });
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'Unable to load news right now.');
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [symbol, exchange, sentiment, ticker, keyword],
  );

  useEffect(() => {
    void load(1);
  }, [load]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setKeyword(keywordInput.trim());
    setTicker(tickerInput.trim().toUpperCase().replace(/\s+/g, ''));
  }

  function resetFilters() {
    setSentiment('all');
    setKeywordInput('');
    setTickerInput('');
    setKeyword('');
    setTicker('');
  }

  const hasFilters = sentiment !== 'all' || Boolean(keyword) || Boolean(ticker);
  const nextPage = (meta?.page ?? 1) + 1;
  const subject = companyName ?? symbol;

  return (
    <section aria-label="Market news">
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/60 p-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Sentiment filter">
          {sentimentTabs.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={sentiment === tab.value}
              onClick={() => setSentiment(tab.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                sentiment === tab.value ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {!companyMode && (
          <form onSubmit={applyFilters} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder="Search keywords, e.g. earnings"
                aria-label="Keyword search"
                maxLength={100}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <input
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value)}
              placeholder="Ticker, e.g. TSLA or INFY.NS"
              aria-label="Company ticker"
              maxLength={60}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder-slate-500 focus:border-blue-500 focus:outline-none sm:w-56"
            />
            <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500">
              Apply
            </button>
            {hasFilters && (
              <button type="button" onClick={resetFilters} className="inline-flex items-center justify-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 hover:text-white">
                <X size={13} /> Clear
              </button>
            )}
          </form>
        )}
      </div>

      {meta && !error && (
        <p className="mb-3 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500" data-testid="news-meta">
          <span>
            Retrieved {new Date(meta.fetched_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            {meta.cached ? ' (cached)' : ''}
          </span>
          <span>•</span>
          <span>Times on each article show when it was published, not when it was retrieved.</span>
        </p>
      )}

      {meta?.stale && meta.notice && (
        <div role="status" className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          <Info size={14} className="mt-0.5 shrink-0" /> {meta.notice} Data may be out of date.
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading news">
          {[0, 1, 2].map((i) => (
            <NewsCardSkeleton key={i} />
          ))}
        </div>
      ) : error && articles.length === 0 ? (
        <div role="alert" className="flex flex-col items-center rounded-xl border border-rose-500/30 bg-rose-500/5 p-8 text-center">
          <AlertTriangle className="mb-2 text-rose-400" size={24} />
          <h3 className="mb-1 text-base font-semibold text-slate-700">Couldn’t load news</h3>
          <p className="mb-4 max-w-md text-sm text-slate-500">{error}</p>
          <button onClick={() => void load(1)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-700">
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          title="No articles found"
          description={
            companyMode
              ? `No recent news was found for ${subject}. The news provider may not cover this symbol.`
              : hasFilters
                ? 'Nothing matched your filters. Try a different keyword, ticker, or sentiment.'
                : 'No news is available right now. Please check back soon.'
          }
          action={
            hasFilters && !companyMode ? (
              <button onClick={resetFilters} className="button button-dark text-xs">
                Reset filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {articles.map((article) => (
              <NewsCard key={article.id} article={article} />
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-center text-xs text-rose-400">
              {error}
            </p>
          )}

          {meta?.has_more && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => void load(nextPage)}
                disabled={loadingMore}
                className="rounded-lg border border-slate-200 bg-white px-5 py-2 text-xs font-semibold text-slate-700 hover:border-slate-600 disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}

      <p className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
        <Info size={13} className="mt-0.5 shrink-0" />
        News and sentiment are supplied by Marketaux and scored automatically per company. Headlines are not verified by Quantx and may
        include rumours or unconfirmed reports — always check the original source. Sentiment does not predict price movement and is not
        investment advice.
      </p>
    </section>
  );
}
