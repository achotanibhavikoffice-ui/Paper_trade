import { useEffect, useMemo, useState } from 'react';
import { marketApi, type Quote } from '../api';

type FeedMessage = { type: string; data?: Quote; snapshots?: Quote[] };

export function useMarketFeed(symbols: string[]) {
  const subscription = useMemo(() => [...new Set(symbols.map((value) => value.trim().toUpperCase()).filter(Boolean))].sort(), [symbols.join(',')]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [state, setState] = useState<'idle' | 'connecting' | 'live' | 'offline'>('idle');

  useEffect(() => {
    if (subscription.length === 0) { setState('idle'); return; }
    let socket: WebSocket | undefined;
    let retryTimer = 0;
    let stopped = false;
    let delay = 1000;
    setState('connecting');

    const connect = () => {
      if (stopped) return;
      socket = new WebSocket(marketApi.socketUrl());
      socket.onopen = () => {
        delay = 1000;
        setState('live');
        socket?.send(JSON.stringify({ task: 'subscribe', symbols: subscription }));
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as FeedMessage;
          if (message.type === 'quote' && message.data) {
            setQuotes((current) => ({ ...current, [message.data!.symbol]: message.data! }));
          } else if (message.type === 'subscribed' && message.snapshots) {
            setQuotes((current) => ({ ...current, ...Object.fromEntries(message.snapshots!.map((quote) => [quote.symbol, quote])) }));
          } else if (message.type === 'error') {
            setState('offline');
          }
        } catch { /* Ignore malformed feed messages and keep the connection alive. */ }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        if (stopped) return;
        setState('offline');
        retryTimer = window.setTimeout(connect, delay);
        delay = Math.min(delay * 2, 15000);
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, [subscription.join(',')]);

  return { quotes, state };
}
