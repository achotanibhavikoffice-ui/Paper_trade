import { useEffect, useState } from 'react';

const KEY = 'tradeo.watchlist.v1';
const MAX_WATCHLIST_SYMBOLS = 50;
function readWatchlist(): string[] {
  try {
    const values = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(values) ? values.filter((value) => typeof value === 'string').slice(0, MAX_WATCHLIST_SYMBOLS) : [];
  } catch { return []; }
}

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(readWatchlist);
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(symbols)); }, [symbols]);
  const toggle = (symbol: string) => setSymbols((current) => current.includes(symbol)
    ? current.filter((item) => item !== symbol)
    : current.length < MAX_WATCHLIST_SYMBOLS ? [...current, symbol] : current);
  const remove = (symbol: string) => setSymbols((current) => current.filter((item) => item !== symbol));
  return { symbols, toggle, remove, limit: MAX_WATCHLIST_SYMBOLS };
}
