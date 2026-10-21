import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  HistogramSeries,
  LineSeries,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type MouseEventParams,
  type Time,
} from 'lightweight-charts';
import { Activity, BarChart3, CandlestickChart, Maximize2, RotateCcw, TrendingUp, Volume2 } from 'lucide-react';
import { insightsApi, type HistoryPeriod, type HistoryPoint, type Quote } from '../../api';

type Candle = CandlestickData<Time>;
type VolumeBar = Candle & { volume: number };
type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | '1W';
type ChartStyle = 'candles' | 'line';
/** real: provider history drawn · fallback: provider failed, illustrative shown · illustrative: intraday, no provider history exists */
type HistoryMode = 'loading' | 'real' | 'fallback' | 'illustrative';
type RealSeries = { bars: VolumeBar[]; ma50: LineData<Time>[]; ma200: LineData<Time>[]; lastDate: string; stale: boolean };
type RealCacheEntry = { series: RealSeries | null; notice: string | null };

const intervals: { label: Interval; seconds: number; isIntraday?: boolean }[] = [
  { label: '1D', seconds: 86400 },
  { label: '1W', seconds: 604800 },
];

const ranges: { label: string; period: HistoryPeriod; defaultInterval: Interval }[] = [
  { label: '1M', period: '1m', defaultInterval: '1D' },
  { label: '6M', period: '6m', defaultInterval: '1D' },
  { label: '1Y', period: '1yr', defaultInterval: '1D' },
  { label: '5Y', period: '5yr', defaultInterval: '1W' },
];

const MA50_COLOR = '#f59e0b';
const MA200_COLOR = '#8b5cf6';
const isDaily = (interval: Interval) => interval === '1D' || interval === '1W';

function utcDaySeconds(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 1000;
}

/** Bucket start for a unix timestamp. Weekly buckets start on Monday (00:00 UTC). */
function bucketOf(seconds: number, interval: Interval) {
  if (interval === '1W') {
    const day = Math.floor(seconds / 86400);
    const weekday = (day + 4) % 7; // 1970-01-01 was a Thursday; 0 = Sunday
    return (day - ((weekday + 6) % 7)) * 86400;
  }
  const size = intervals.find((item) => item.label === interval)!.seconds;
  return Math.floor(seconds / size) * size;
}

/**
 * Provider history has one close per day, so each candle opens at the previous close
 * (close-to-close candles). Weekly bars aggregate those daily candles.
 */
function buildRealSeries(points: HistoryPoint[], interval: Interval, stale: boolean): RealSeries | null {
  const grouped = new Map<number, VolumeBar & { dma50: number | null; dma200: number | null }>();
  let previousClose: number | null = null;
  for (const point of points) {
    const time = bucketOf(utcDaySeconds(point.date), interval);
    const open = previousClose ?? point.close;
    const dayHigh = Math.max(open, point.close);
    const dayLow = Math.min(open, point.close);
    const current = grouped.get(time);
    grouped.set(time, current
      ? {
        ...current, high: Math.max(current.high, dayHigh), low: Math.min(current.low, dayLow), close: point.close,
        volume: current.volume + (point.volume ?? 0), dma50: point.dma50 ?? current.dma50, dma200: point.dma200 ?? current.dma200,
      }
      : { time: time as Time, open, high: dayHigh, low: dayLow, close: point.close, volume: point.volume ?? 0, dma50: point.dma50, dma200: point.dma200 });
    previousClose = point.close;
  }
  const rows = [...grouped.values()].sort((a, b) => Number(a.time) - Number(b.time));
  if (rows.length < 2) return null;
  return {
    bars: rows.map(({ dma50: _dma50, dma200: _dma200, ...bar }) => bar),
    ma50: rows.filter((row) => row.dma50 !== null).map((row) => ({ time: row.time, value: row.dma50! })),
    ma200: rows.filter((row) => row.dma200 !== null).map((row) => ({ time: row.time, value: row.dma200! })),
    lastDate: points[points.length - 1].date,
    stale,
  };
}

function makeIllustrativeHistory(symbol: string, price: number, currentBucket: number, seconds: number, interval: Interval, dailyVolume: number) {
  const bars: Candle[] = [];
  const volumes: HistogramData<Time>[] = [];
  let previous = price * 0.965;
  let index = 0;
  let cursor = currentBucket - seconds * 80;
  const averageVolume = isDaily(interval) ? dailyVolume * (interval === '1W' ? 5 : 1) : dailyVolume * (seconds / 60) / 375;
  while (bars.length < 80 && index < 120 && cursor < currentBucket) {
    const date = new Date(cursor * 1000);
    const weekday = date.getUTCDay();
    const isWeekend = interval === '1D' && (weekday === 0 || weekday === 6);
    if (!isWeekend) {
      const drift = price * 0.00042;
      const wave = Math.sin(index * 0.74 + symbol.length * 0.45) * price * 0.0022;
      const close = Math.max(0.01, previous + drift + wave);
      const wick = price * (0.0007 + ((index * 7) % 6) * 0.00018);
      const time = cursor as Time;
      bars.push({ time, open: previous, close, high: Math.max(previous, close) + wick, low: Math.max(0.01, Math.min(previous, close) - wick) });
      const relativeVolume = 0.48 + ((index * 37 + symbol.length * 11) % 100) / 100;
      volumes.push({ time, value: Math.max(1, averageVolume * relativeVolume), color: close >= previous ? '#ccebe4' : '#f9dadd' });
      previous = close;
      index += 1;
    }
    cursor += seconds;
  }
  return { bars, volumes };
}

const formatDay = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function TradingViewCandleChart({ symbol, quote }: { symbol: string; quote?: Quote }) {
  const host = useRef<HTMLDivElement>(null);
  const chartPanelRef = useRef<HTMLElement>(null);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) chartPanelRef.current?.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };
  const chart = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lineSeries = useRef<ISeriesApi<'Line'> | null>(null);
  const volumeSeries = useRef<ISeriesApi<'Histogram'> | null>(null);
  const ma50Series = useRef<ISeriesApi<'Line'> | null>(null);
  const ma200Series = useRef<ISeriesApi<'Line'> | null>(null);
  const oneMinuteBars = useRef<Map<number, Candle>>(new Map());
  const oneMinuteVolumes = useRef<Map<number, number>>(new Map());
  const illustrativeCache = useRef<Map<Interval, { bars: Candle[]; volumes: HistogramData<Time>[] }>>(new Map());
  const realCache = useRef<Map<string, RealCacheEntry>>(new Map());
  const sourceRef = useRef<string | null>(null);
  const previousProviderVolume = useRef<number | null>(null);
  const fitKey = useRef<string | null>(null);
  const [interval, setInterval] = useState<Interval>('1D');
  const [selectedPeriod, setSelectedPeriod] = useState<HistoryPeriod>('1yr');
  const [style, setStyle] = useState<ChartStyle>('candles');
  const [volumeVisible, setVolumeVisible] = useState(false);
  const [maVisible, setMaVisible] = useState(true);
  const [hasData, setHasData] = useState(false);
  const [hover, setHover] = useState<Candle | null>(null);
  const [lastBar, setLastBar] = useState<Candle | null>(null);
  const [historyMode, setHistoryMode] = useState<HistoryMode>('loading');
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    if (!host.current) return;
    const instance = createChart(host.current, {
      width: Math.max(1, host.current.clientWidth),
      height: 430,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#606a78',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 12,
        attributionLogo: true,
      },
      grid: { vertLines: { color: '#f0f2f5' }, horzLines: { color: '#f0f2f5' } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#76879b', width: 1, style: 2, labelBackgroundColor: '#34445a' },
        horzLine: { color: '#76879b', width: 1, style: 2, labelBackgroundColor: '#34445a' },
      },
      rightPriceScale: { borderColor: '#e2e6eb', scaleMargins: { top: 0.08, bottom: 0.24 } },
      timeScale: { borderColor: '#e2e6eb', timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 9 },
    });

    const priceFormat = { type: 'custom' as const, minMove: 0.01, formatter: (price: number) => `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` };
    const candles = instance.addSeries(CandlestickSeries, {
      upColor: '#089981', downColor: '#f23645', borderUpColor: '#089981', borderDownColor: '#f23645',
      wickUpColor: '#089981', wickDownColor: '#f23645', priceFormat,
    });
    const line = instance.addSeries(LineSeries, { color: '#2962ff', lineWidth: 2, crosshairMarkerRadius: 4, visible: false, priceFormat });
    const movingAverage = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat };
    const ma50 = instance.addSeries(LineSeries, { ...movingAverage, color: MA50_COLOR });
    const ma200 = instance.addSeries(LineSeries, { ...movingAverage, color: MA200_COLOR });
    const volume = instance.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: '' });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chart.current = instance;
    candleSeries.current = candles;
    lineSeries.current = line;
    volumeSeries.current = volume;
    ma50Series.current = ma50;
    ma200Series.current = ma200;
    oneMinuteBars.current.clear();
    oneMinuteVolumes.current.clear();
    illustrativeCache.current.clear();
    realCache.current.clear();
    sourceRef.current = null;
    previousProviderVolume.current = null;
    fitKey.current = null;
    setHasData(false);
    setHover(null);
    setLastBar(null);

    const handleCrosshair = (param: MouseEventParams<Time>) => {
      if (!param.time) { setHover(null); return; }
      const data = param.seriesData.get(candles);
      setHover(data && 'open' in data ? data as Candle : null);
    };
    instance.subscribeCrosshairMove(handleCrosshair);
    const observer = new ResizeObserver(() => {
      if (host.current) instance.applyOptions({ width: Math.max(1, host.current.clientWidth) });
    });
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      instance.unsubscribeCrosshairMove(handleCrosshair);
      instance.remove();
      chart.current = null;
      candleSeries.current = null;
      lineSeries.current = null;
      volumeSeries.current = null;
      ma50Series.current = null;
      ma200Series.current = null;
      oneMinuteBars.current.clear();
      oneMinuteVolumes.current.clear();
      illustrativeCache.current.clear();
      realCache.current.clear();
      previousProviderVolume.current = null;
    };
  }, [symbol]);

  const showMovingAverages = maVisible && historyMode === 'real' && isDaily(interval);
  useEffect(() => {
    candleSeries.current?.applyOptions({ visible: style === 'candles' });
    lineSeries.current?.applyOptions({ visible: style === 'line' });
    volumeSeries.current?.applyOptions({ visible: volumeVisible });
    ma50Series.current?.applyOptions({ visible: showMovingAverages });
    ma200Series.current?.applyOptions({ visible: showMovingAverages });
    chart.current?.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: volumeVisible ? 0.24 : 0.08 } });
  }, [style, volumeVisible, showMovingAverages, symbol]);

  // Load real end-of-day history for daily/weekly views based on the selected range.
  useEffect(() => {
    if (!isDaily(interval)) {
      setHistoryMode('illustrative');
      setHistoryNotice(null);
      setHistoryVersion((version) => version + 1);
      return;
    }
    const cacheKey = `${selectedPeriod}:${interval}`;
    const cached = realCache.current.get(cacheKey);
    if (cached) {
      setHistoryMode(cached.series ? 'real' : 'fallback');
      setHistoryNotice(cached.notice);
      setHistoryVersion((version) => version + 1);
      return;
    }
    let active = true;
    setHistoryMode('loading');
    setHistoryNotice(null);
    insightsApi.history(symbol, selectedPeriod).then((response) => {
      if (!active) return;
      const series = buildRealSeries(response.points, interval, response.stale);
      const entry = { series, notice: series ? response.notice : 'No historical prices were returned for this symbol.' };
      realCache.current.set(cacheKey, entry);
      setHistoryMode(series ? 'real' : 'fallback');
      setHistoryNotice(entry.notice);
      setHistoryVersion((version) => version + 1);
    }).catch((error: unknown) => {
      if (!active) return;
      const notice = error instanceof Error ? error.message : 'Real price history is unavailable.';
      realCache.current.set(cacheKey, { series: null, notice });
      setHistoryMode('fallback');
      setHistoryNotice(notice);
      setHistoryVersion((version) => version + 1);
    });
    return () => { active = false; };
  }, [symbol, interval, selectedPeriod]);

  // Accumulate streamed quotes into one-minute bars (independent of the selected interval).
  useEffect(() => {
    if (!quote) return;
    const price = Number(quote.last_price);
    const timestamp = Math.floor(Date.parse(quote.timestamp) / 1000);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp)) return;

    const source = quote.data_source ?? '021';
    if (sourceRef.current !== null && sourceRef.current !== source) {
      oneMinuteBars.current.clear();
      oneMinuteVolumes.current.clear();
      illustrativeCache.current.clear();
      previousProviderVolume.current = null;
      fitKey.current = null;
    }
    sourceRef.current = source;

    const minute = Math.floor(timestamp / 60) * 60;
    const existing = oneMinuteBars.current.get(minute);
    oneMinuteBars.current.set(minute, existing
      ? { ...existing, high: Math.max(existing.high, price), low: Math.min(existing.low, price), close: price }
      : { time: minute as Time, open: price, high: price, low: price, close: price });
    const reportedVolume = Number(quote.volume) || 0;
    const previousVolume = previousProviderVolume.current;
    const volumeDelta = previousVolume === null
      ? Math.ceil(reportedVolume / 375)
      : reportedVolume >= previousVolume ? reportedVolume - previousVolume : Math.ceil(reportedVolume / 375);
    previousProviderVolume.current = reportedVolume;
    oneMinuteVolumes.current.set(minute, (oneMinuteVolumes.current.get(minute) ?? 0) + volumeDelta);
  }, [quote]);

  // Compose history + live bars and push them to the chart.
  useEffect(() => {
    if (!candleSeries.current || !lineSeries.current || !volumeSeries.current || !ma50Series.current || !ma200Series.current) return;
    if (historyMode === 'loading') return;

    const cacheKey = `${selectedPeriod}:${interval}`;
    const real = historyMode === 'real' ? realCache.current.get(cacheKey)?.series ?? null : null;
    const price = quote ? Number(quote.last_price) : NaN;
    const timestamp = quote ? Math.floor(Date.parse(quote.timestamp) / 1000) : NaN;
    const quoteValid = Number.isFinite(price) && price > 0 && Number.isFinite(timestamp);
    // Synthetic practice quotes are not anchored to real prices, so never splice them onto real history.
    const mergeLive = quoteValid && !(real && quote?.data_source === 'demo');
    const reportedVolume = Number(quote?.volume) || 0;

    let base: VolumeBar[] = [];
    if (real) {
      base = real.bars;
    } else {
      let history = illustrativeCache.current.get(interval);
      if (!history) {
        let hash = 0;
        for (let i = 0; i < symbol.length; i++) hash = (hash * 31 + symbol.charCodeAt(i)) >>> 0;
        const seedPrice = 45 + (hash % 380) + ((hash % 99) / 100);
        const activePrice = quoteValid ? price : seedPrice;
        const activeTime = quoteValid ? timestamp : Math.floor(Date.now() / 1000);
        const bucketSeconds = intervals.find((item) => item.label === interval)!.seconds;
        history = makeIllustrativeHistory(symbol, activePrice, bucketOf(activeTime, interval), bucketSeconds, interval, reportedVolume || 1_250_000);
        illustrativeCache.current.set(interval, history);
      }
      const { bars: illustrativeBars, volumes } = history;
      base = illustrativeBars.map((bar, index) => ({ ...bar, volume: volumes[index]?.value ?? 0 }));
    }

    const merged = new Map<number, VolumeBar>(base.map((bar) => [Number(bar.time), bar]));
    if (mergeLive) {
      const currentBucket = bucketOf(timestamp, interval);
      const live = new Map<number, VolumeBar>();
      for (const [time, bar] of [...oneMinuteBars.current.entries()].sort(([a], [b]) => a - b)) {
        const bucket = bucketOf(time, interval);
        const current = live.get(bucket);
        const vol = oneMinuteVolumes.current.get(time) ?? 0;
        live.set(bucket, current
          ? { ...current, high: Math.max(current.high, bar.high), low: Math.min(current.low, bar.low), close: bar.close, volume: current.volume + vol }
          : { ...bar, time: bucket as Time, volume: vol });
      }
      const todayOpen = Number(quote?.open);
      const todayHigh = Number(quote?.high);
      const todayLow = Number(quote?.low);
      const currentBar = live.get(currentBucket);
      if (currentBar && isDaily(interval) && todayOpen > 0 && todayHigh > 0 && todayLow > 0) {
        live.set(currentBucket, {
          ...currentBar, open: todayOpen, high: Math.max(todayHigh, price), low: Math.min(todayLow, price), close: price,
          volume: reportedVolume || currentBar.volume,
        });
      } else if (currentBar && reportedVolume > 0) {
        // Provider volume is cumulative for the session; scale it to the active chart interval.
        const intervalMinutes = Math.min(intervals.find((item) => item.label === interval)!.seconds / 60, 375);
        live.set(currentBucket, { ...currentBar, volume: Math.max(currentBar.volume, reportedVolume * intervalMinutes / 375) });
      }
      const today = new Date(timestamp * 1000).toISOString().slice(0, 10);
      const historyHasToday = real?.lastDate === today;
      for (const [time, bar] of live) {
        const existing = merged.get(time);
        if (existing && real && interval === '1W') {
          // Extend the real week with today's session instead of replacing it.
          merged.set(time, {
            ...existing, high: Math.max(existing.high, bar.high), low: Math.min(existing.low, bar.low), close: bar.close,
            volume: existing.volume + (historyHasToday ? 0 : bar.volume),
          });
        } else {
          merged.set(time, bar);
        }
      }
    }

    const bars = [...merged.values()].sort((a, b) => Number(a.time) - Number(b.time));
    if (!bars.length) {
      candleSeries.current.setData([]);
      lineSeries.current.setData([]);
      volumeSeries.current.setData([]);
      ma50Series.current.setData([]);
      ma200Series.current.setData([]);
      setHasData(false);
      setLastBar(null);
      return;
    }
    candleSeries.current.setData(bars.map(({ volume: _volume, ...bar }) => bar));
    lineSeries.current.setData(bars.map((bar) => ({ time: bar.time, value: bar.close })));
    volumeSeries.current.setData(bars.map((bar) => ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? '#cde9e2' : '#f5d9dc' })));
    ma50Series.current.setData(real ? real.ma50 : []);
    ma200Series.current.setData(real ? real.ma200 : []);

    const nextFitKey = `${selectedPeriod}:${interval}:${real ? 'real' : 'illustrative'}`;
    if (fitKey.current !== nextFitKey) {
      chart.current?.timeScale().fitContent();
      fitKey.current = nextFitKey;
    }
    const { volume: _volume, ...latest } = bars[bars.length - 1];
    setLastBar(latest);
    setHasData(true);
    setHover(null);
  }, [quote, interval, selectedPeriod, symbol, historyMode, historyVersion]);

  const realSeries = historyMode === 'real' ? realCache.current.get(`${selectedPeriod}:${interval}`)?.series ?? null : null;
  const demoQuote = quote?.data_source === 'demo';
  const liveMerged = Boolean(quote) && !(realSeries && demoQuote);
  const displayed = hover ?? (quote && liveMerged ? {
    time: Math.floor(Date.parse(quote.timestamp) / 60_000) * 60 as Time,
    open: isDaily(interval) ? Number(quote.open) || Number(quote.last_price) : Number(quote.last_price),
    high: isDaily(interval) ? Number(quote.high) || Number(quote.last_price) : Number(quote.last_price),
    low: isDaily(interval) ? Number(quote.low) || Number(quote.last_price) : Number(quote.last_price),
    close: Number(quote.last_price),
  } : lastBar);
  const sourceLabel = demoQuote ? 'DATA' : quote ? 'LIVE' : 'WAITING';
  const historyLabel = historyMode === 'loading' ? 'LOADING HISTORY'
    : realSeries ? (realSeries.stale ? 'CACHED HISTORY' : 'REAL HISTORY')
    : historyMode === 'fallback' ? 'ILLUSTRATIVE (BSE / UNINDEXED)' : 'ILLUSTRATIVE';
  const footnote = historyMode === 'loading' ? 'Loading NSE price history…'
    : realSeries
      ? `NSE daily closes via IndianAPI through ${formatDay(realSeries.lastDate)} · candles drawn close-to-close${demoQuote ? ' · practice quotes not merged' : quote ? ' · latest bar from market feed' : ''}`
      : historyMode === 'fallback'
        ? `Exchange dataset not available for ${symbol} (BSE micro-cap). Showing illustrative chart · switch to NSE Active equities (e.g. PCJEWELLER, IDEA, RELIANCE, TCS) for real multi-year history.`
        : `Illustrative intraday history · select a range (1M-5Y) for real prices${demoQuote ? ' · generated practice quotes' : ''}`;

  return (
    <section className="trade-panel tv-chart-panel" aria-label={`${symbol} TradingView style chart`} ref={chartPanelRef}>
      <div className="tv-chart-topline">
        <div className="tv-chart-instrument"><span className="tv-symbol-mark">{symbol.slice(0, 1)}</span><div><strong>{symbol}</strong><small>{realSeries ? 'NSE · Equity' : 'Indian Equity'}</small></div></div>
      </div>
      <div className="tv-chart-toolbar">
        <div className="tv-chart-ranges" aria-label="Date range">
          {ranges.map(({ label, period: p, defaultInterval }) => (
            <button
              key={label}
              className={isDaily(interval) && selectedPeriod === p ? 'active' : ''}
              onClick={() => {
                setSelectedPeriod(p);
                setInterval(defaultInterval);
              }}
              title={`View real ${label} historical data via IndianAPI`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="tv-chart-divider" />
        <div className="tv-chart-intervals" aria-label="Chart interval">
          {intervals.map(({ label, isIntraday }) => (
            <button
              key={label}
              className={interval === label ? 'active' : ''}
              onClick={() => setInterval(label)}
              title={isIntraday ? `${label} Intraday (Stream ticks)` : `${label} Bar view`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="tv-chart-divider" />
        <div className="tv-chart-style-buttons" aria-label="Chart style">
          <button aria-label="Candlestick chart" title="Candlesticks" className={style === 'candles' ? 'active' : ''} onClick={() => setStyle('candles')}><CandlestickChart size={17} /></button>
          <button aria-label="Line chart" title="Line" className={style === 'line' ? 'active' : ''} onClick={() => setStyle('line')}><BarChart3 size={17} /></button>
        </div>
        <button className={`tv-chart-tool ${volumeVisible ? 'active' : ''}`} onClick={() => setVolumeVisible((visible) => !visible)}><Volume2 size={15} /> Volume</button>
        {realSeries && <button className={`tv-chart-tool ${maVisible ? 'active' : ''}`} onClick={() => setMaVisible((visible) => !visible)} title="50 and 200 day moving averages"><TrendingUp size={15} /> MA</button>}
        <span className="tv-chart-toolbar-spacer" />
        <button className="tv-chart-icon-button" aria-label="Reset chart" title="Reset chart view" onClick={() => chart.current?.timeScale().fitContent()}><RotateCcw size={16} /></button>
        <button className="tv-chart-icon-button" aria-label="Full screen" title="Full screen" onClick={toggleFullscreen}><Maximize2 size={16} /></button>
      </div>
      <div className="tv-chart-ohlc">
        <strong>{symbol}</strong><span>{interval}</span>
        {displayed && <><span>O <b>{displayed.open.toFixed(2)}</b></span><span>H <b className="up">{displayed.high.toFixed(2)}</b></span><span>L <b className="down">{displayed.low.toFixed(2)}</b></span><span>C <b>{displayed.close.toFixed(2)}</b></span></>}
        {showMovingAverages && <span className="tv-ma-legend"><i style={{ background: MA50_COLOR }} />MA 50<i style={{ background: MA200_COLOR }} />MA 200</span>}
      </div>
      <div ref={host} className="trade-live-chart tv-chart-canvas" />
      {!hasData && <div className="trade-chart-empty"><Activity size={16} /><span>{historyMode === 'loading' ? `Loading ${symbol} price history…` : `Waiting for ${symbol} market data…`}</span></div>}
      <div className="tv-chart-foot"><span>Powered by TradingView Lightweight Charts</span><span>{footnote}</span></div>
    </section>
  );
}
