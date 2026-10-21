export const API_URL = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? '/api' : 'http://localhost:4000/api')).replace(/\/$/, '');

export type User = { id: string; name: string; email: string; created_at: string; updated_at: string };
export type Numeric = number | string;
export type Instrument = {
  id: string; symbol: string; name: string; exchange: string; instrument_type: string;
  sector?: string | null; is_tradable: boolean; lot_size: number; provider_token?: number | null;
  tick_size_paise?: number; price?: Numeric; change?: string; change_percent?: number | null; up?: boolean;
};
export type Quote = {
  symbol: string; exchange: string; token: number; last_price: Numeric; previous_close?: Numeric | null;
  open?: Numeric | null; high?: Numeric | null; low?: Numeric | null; volume?: number | null;
  bids: { price: Numeric; quantity: number; orders?: number }[];
  asks: { price: Numeric; quantity: number; orders?: number }[]; timestamp: string; data_source?: 'demo' | '021' | 'indianapi';
};
export type AccountInfo = {
  id: string; user_id: string; account_number: string; account_type: string; currency: string;
  initial_capital: string; cash_balance: string; reserved_cash: string; capital_configured: boolean; status: string;
  created_at: string; updated_at: string;
};
export type LedgerEntry = {
  id: string; account_id: string; entry_type: 'INITIAL_CAPITAL' | 'TRADE_DEBIT' | 'TRADE_CREDIT' | 'CHARGE' | 'ADJUSTMENT' | 'RESET';
  amount: string; balance_after: string; reference_id?: string | null; description: string; created_at: string;
};
export type OrderSide = 'BUY' | 'SELL';
export type OrderProduct = 'CNC' | 'MIS';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type OrderStatus = 'PENDING' | 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
export type Order = {
  id: string; account_id: string; instrument_id: string; symbol: string; company_name: string;
  side: OrderSide; product: OrderProduct; order_type: OrderType; quantity: number; filled_quantity: number;
  limit_price?: string | null; trigger_price?: string | null; average_execution_price?: string | null;
  status: OrderStatus; rejection_reason?: string | null; validity: 'DAY' | 'IOC'; idempotency_key?: string | null;
  created_at: string; updated_at: string;
};
export type Trade = {
  id: string; account_id: string; order_id: string; instrument_id: string; sequence: number;
  quantity: number; price: string; side: OrderSide; product: OrderProduct; created_at: string;
  charges?: { brokerage: string; exchange_fee: string; sebi_fee: string; stt: string; stamp_duty: string; gst: string; total: string } | null;
};
export type Position = {
  id: string; account_id: string; instrument_id: string; symbol: string; company_name: string; product: OrderProduct;
  quantity: number; buy_quantity: number; sell_quantity: number; buy_amount: string; sell_amount: string;
  average_price: string; current_price: number; realized_pnl: string; unrealized_pnl: string; updated_at: string;
};
export type Holding = {
  id: string; symbol: string; company_name: string; shares: number; average_price: number; current_price: number;
  invested_amount: number; current_value: number; unrealized_pnl: number; unrealized_pnl_percent: number; day_change_percent: number;
};
export type OrderEvent = { id: string; order_id: string; event_type: string; status: string; details: Record<string, unknown>; created_at: string };
export type Scenario = {
  id: string; name: string; shocks: Record<string, string>;
  result: { positions: { symbol: string; quantity: number; current_price: string; shock_percent: string; projected_price: string; current_pnl: string; projected_pnl: string }[];
    current_market_value: string; projected_market_value: string; projected_value_change: string; note: string };
  created_at: string;
};
export type MarketStatus = { enabled: boolean; connected: boolean; quote_count: number; last_update: string | null; mode: 'demo' | 'full' | 'hybrid' | string; order_execution: string; quote_max_age_seconds?: number };
export type PortfolioSummary = { cash_balance: string; reserved_cash: string; market_value: string; equity: string; realized_pnl: string; unrealized_pnl: string; total_pnl: string; open_positions: number; open_orders: number; stress_mode: boolean };
export type SupportChatMessage = { role: 'user' | 'assistant'; content: string };
export type SupportChatReply = { answer: string; mode: 'ai' | 'guide'; actions: { label: string; path: string }[] };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const payload = await response.json().catch(() => ({}));
  const detail = typeof payload.detail === 'string' ? payload.detail
    : Array.isArray(payload.detail) ? payload.detail.map((item: { msg?: string }) => item.msg).join(', ') : undefined;
  if (!response.ok) throw new Error(payload.error ?? detail ?? `Request failed (${response.status}).`);
  return payload as T;
}

export const supportApi = {
  chat: (message: string, history: SupportChatMessage[], page: string) =>
    request<SupportChatReply>('/support/chat', { method: 'POST', body: JSON.stringify({ message, history, page }) }),
};

export const authApi = {
  me: () => request<{ user: User }>('/auth/me'),
  login: (email: string, password: string) => request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) => request<{ user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  updateProfile: (name: string) => request<{ user: User }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ name }) }),
  requestPasswordReset: (email: string) => request<{ message: string }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) => request<{ message: string }>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, new_password: newPassword }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
};

export const accountApi = {
  getAccount: () => request<AccountInfo>('/account/me'),
  setInitialCapital: (initial_capital: number) => request<AccountInfo>('/account/initial-capital', { method: 'PUT', body: JSON.stringify({ initial_capital }) }),
  getLedger: (limit = 20, offset = 0) => request<{ items: LedgerEntry[]; total: number; limit: number; offset: number }>(`/account/ledger?limit=${limit}&offset=${offset}`),
  getInstruments: (query = '', limit = 100, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (query.trim()) params.set('q', query.trim());
    return request<Instrument[]>(`/instruments?${params}`);
  },
  getInstrument: (symbol: string) => request<Instrument>(`/instruments/${encodeURIComponent(symbol)}`),
};

export const tradingApi = {
  orders: (limit = 100, offset = 0) => request<{ items: Order[]; total: number; limit: number; offset: number }>(`/orders?limit=${limit}&offset=${offset}`),
  order: (id: string) => request<Order>(`/orders/${id}`),
  placeOrder: (order: { instrument_id: string; side: OrderSide; product: OrderProduct; order_type: OrderType; quantity: number; limit_price?: string | null; trigger_price?: string | null; validity?: 'DAY' | 'IOC'; idempotency_key: string }) => request<Order>('/orders', { method: 'POST', body: JSON.stringify(order) }),
  modifyOrder: (id: string, order: { quantity: number; limit_price?: string | null; trigger_price?: string | null; validity?: 'DAY' | 'IOC' }) => request<Order>(`/orders/${id}`, { method: 'PUT', body: JSON.stringify(order) }),
  cancelOrder: (id: string) => request<Order>(`/orders/${id}`, { method: 'DELETE' }),
  orderTrades: (id: string) => request<Trade[]>(`/orders/${id}/trades`),
  orderEvents: (id: string) => request<OrderEvent[]>(`/orders/${id}/events`),
  trades: (limit = 100) => request<{ items: Trade[]; total: number; limit: number; offset: number }>(`/trades?limit=${limit}`),
  positions: () => request<Position[]>('/portfolio/positions'),
  holdings: () => request<Holding[]>('/portfolio/holdings'),
  summary: () => request<PortfolioSummary>('/portfolio/summary'),
  stressSettings: () => request<{ stress_mode: boolean; stress_spread_percent: number; stress_liquidity_percent: number }>('/account/trading-settings'),
  setStressMode: (enabled: boolean) => request<{ stress_mode: boolean }>('/account/trading-settings/stress-mode', { method: 'PUT', body: JSON.stringify({ enabled }) }),
  scenarios: (limit = 20) => request<Scenario[]>(`/scenarios?limit=${limit}`),
  createScenario: (name: string, shocks: Record<string, number>) => request<Scenario>('/scenarios', { method: 'POST', body: JSON.stringify({ name, shocks }) }),
};

export interface MarketDataStatus {
  status: 'disconnected' | 'connecting' | 'live' | 'stale' | 'unavailable' | 'error' | 'replay';
  feed_connected: boolean;
  subscription_sent: boolean;
  subscribed_count: number;
  first_heartbeat_received: boolean;
  first_quote_received: boolean;
  last_auth_time: string | null;
  last_ephemeral_key_time: string | null;
  last_ws_frame_time: string | null;
  last_heartbeat: string | null;
  last_quote_time: string | null;
  heartbeat_frames_count: number;
  decoded_packets_count: number;
  malformed_packets_count: number;
  monitored_instruments_count: number;
  quotes_stored_count: number;
  unique_instruments_with_quotes: number;
  replay_active: boolean;
  replay_tick_count: number;
  last_error: string | null;
}

export const marketApi = {
  quotes: (symbols?: string[]) => request<Quote[]>(`/market/quotes${symbols?.length ? `?symbols=${encodeURIComponent(symbols.join(','))}` : ''}`),
  status: () => request<MarketStatus>('/market/status'),
  socketUrl: () => API_URL.startsWith('/')
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${API_URL}/market/ws`
    : `${API_URL.replace(/^http/, 'ws')}/market/ws`,
};

export const marketDataApi = {
  getStatus: () => marketApi.status(),
  getQuotes: (symbols?: string[]) => marketApi.quotes(symbols).then((quotes) => {
    const map: Record<string, any> = {};
    (quotes || []).forEach((q) => { map[q.symbol] = q; });
    return map;
  }),
  getQuote: (symbol: string) => marketApi.quotes([symbol]).then((arr) => arr[0] || null),
  startReplay: () => Promise.resolve({ status: 'ok', message: 'Live 021 feed active', replay_active: false }),
  stopReplay: () => Promise.resolve({ status: 'ok', message: 'Live 021 feed active', replay_active: false }),
};

export interface PortfolioBaseline {
  cash_balance: number;
  holdings_value: number;
  total_portfolio_value: number;
  unrealized_pnl: number;
  holdings_count: number;
  valuation_timestamp: string;
  is_complete: boolean;
  quotes_status: string;
  holdings: Array<{
    instrument_id: string;
    symbol: string;
    name: string;
    exchange: string;
    product: string;
    quantity: number;
    average_price: number;
    current_price: number;
    current_value: number;
    unrealized_pnl: number;
    unrealized_pnl_percent: number;
    quote_source: string;
    is_fresh: boolean;
  }>;
}

export interface SingleStockResult {
  symbol: string;
  name: string;
  exchange: string;
  assumed_entry_price: number;
  is_manual_entry_price: boolean;
  hypothetical_future_price: number;
  is_manual_future_price: boolean;
  quantity: number;
  actual_investment: number;
  unused_cash: number;
  future_position_value: number;
  hypothetical_pnl: number;
  return_percent: number;
  quote_timestamp: string;
  quote_source: string;
  holding_period_label: string;
  scenario_grid: Array<{
    label: string;
    shift_percent: number;
    hypothetical_price: number;
    future_position_value: number;
    hypothetical_pnl: number;
    return_percent: number;
  }>;
  assumptions: string[];
}

export interface StressTestResult {
  preset_name?: string;
  global_shift_percent: number;
  baseline_holdings_value: number;
  simulated_holdings_value: number;
  baseline_cash: number;
  simulated_cash: number;
  baseline_portfolio_value: number;
  simulated_portfolio_value: number;
  portfolio_impact: number;
  portfolio_impact_percent: number;
  holdings_count: number;
  missing_price_count: number;
  holdings_breakdown: Array<{
    symbol: string;
    name: string;
    quantity: number;
    baseline_price: number;
    simulated_price: number;
    baseline_value: number;
    simulated_value: number;
    pnl_impact: number;
    pnl_impact_percent: number;
    quote_source: string;
  }>;
  assumptions: string[];
}

export interface AllocationResult {
  symbol: string;
  name: string;
  action: 'BUY' | 'SELL';
  assumed_price: number;
  is_manual_price: boolean;
  simulated_quantity: number;
  total_transaction_value: number;
  baseline_cash: number;
  hypothetical_cash: number;
  baseline_position_quantity: number;
  hypothetical_position_quantity: number;
  baseline_position_value: number;
  hypothetical_position_value: number;
  baseline_portfolio_value: number;
  hypothetical_portfolio_value: number;
  allocation_percent_before: number;
  allocation_percent_after: number;
  assumptions: string[];
}

export interface SavedScenario {
  id: string;
  user_id: string;
  name: string;
  scenario_type: 'single_stock' | 'portfolio_stress' | 'allocation';
  inputs: any;
  assumptions: string[];
  baseline_snapshot: any;
  result: any;
  created_at: string;
  updated_at: string;
}

export interface ScenarioCompareResponse {
  scenarios: Array<{
    id?: string;
    name: string;
    scenario_type: string;
    initial_cash_deployed_or_shift: string;
    resulting_portfolio_value: number;
    hypothetical_pnl: number;
    return_percent: number;
    cash_remaining: number;
    largest_position_symbol?: string;
    largest_position_allocation_percent?: number;
    assumptions: string[];
  }>;
  compared_at: string;
}

export interface MarketStressStateResponse {
  enabled: boolean;
  level: 'mild' | 'high' | 'panic';
  vix_index: number;
  multiplier: number;
  message: string;
}

export const whatIfApi = {
  getBaseline: () => request<PortfolioBaseline>('/what-if/baseline'),
  simulateStock: (payload: {
    symbol: string;
    investment_amount?: number;
    quantity?: number;
    manual_purchase_price?: number;
    manual_future_price?: number;
    future_shift_percent?: number;
    holding_period_label?: string;
  }) => request<SingleStockResult>('/what-if/simulate/stock', { method: 'POST', body: JSON.stringify(payload) }),
  simulateStress: (payload: {
    global_shift_percent?: number;
    stock_shifts?: Record<string, number>;
    preset_name?: string;
  }) => request<StressTestResult>('/what-if/simulate/stress', { method: 'POST', body: JSON.stringify(payload) }),
  simulateAllocation: (payload: {
    symbol: string;
    action: 'BUY' | 'SELL';
    quantity?: number;
    amount?: number;
    manual_price?: number;
  }) => request<AllocationResult>('/what-if/simulate/allocation', { method: 'POST', body: JSON.stringify(payload) }),
  getScenarios: () => request<SavedScenario[]>('/what-if/scenarios'),
  saveScenario: (payload: {
    name: string;
    scenario_type: string;
    inputs: any;
    assumptions: string[];
    baseline_snapshot: any;
    result: any;
  }) => request<SavedScenario>('/what-if/scenarios', { method: 'POST', body: JSON.stringify(payload) }),
  getScenario: (id: string) => request<SavedScenario>(`/what-if/scenarios/${id}`),
  deleteScenario: (id: string) => request<{ status: string; id: string }>(`/what-if/scenarios/${id}`, { method: 'DELETE' }),
  compareScenarios: (payload: { scenario_ids?: string[]; inline_scenarios?: any[] }) =>
    request<ScenarioCompareResponse>('/what-if/scenarios/compare', { method: 'POST', body: JSON.stringify(payload) }),
  getStressModeState: () => request<MarketStressStateResponse>('/what-if/stress-mode'),
  toggleStressMode: (payload: { enabled: boolean; level?: string }) =>
    request<MarketStressStateResponse>('/what-if/stress-mode', { method: 'POST', body: JSON.stringify(payload) }),
};



export type SentimentLabel = 'positive' | 'negative' | 'neutral';
export type NewsEntity = {
  symbol: string | null; name: string | null; exchange: string | null; country: string | null;
  type: string | null; industry: string | null; match_score: number | null;
  sentiment_score: number | null; sentiment_label: SentimentLabel | null;
};
export type NewsArticle = {
  id: string; title: string; description: string | null; snippet: string | null; source: string | null;
  url: string; image_url: string | null; published_at: string | null; language: string | null;
  entities: NewsEntity[]; sentiment_score: number | null; sentiment_label: SentimentLabel | null;
};
export type NewsResponse = {
  items: NewsArticle[]; page: number; limit: number; returned: number; found: number | null;
  has_more: boolean; fetched_at: string; cached: boolean; stale: boolean; notice: string | null; symbol?: string;
};
export type NewsParams = { symbols?: string; q?: string; sentiment?: SentimentLabel; page?: number; exchange?: string };

function newsQuery(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : '';
  
}

export const newsApi = {
  list: (params: NewsParams = {}) => request<NewsResponse>(`/news${newsQuery({ ...params })}`),
  company: (symbol: string, params: { exchange?: string; sentiment?: SentimentLabel; page?: number } = {}) =>
    request<NewsResponse>(`/news/company/${encodeURIComponent(symbol)}${newsQuery({ ...params })}`),
};

// -- Market reference data (IndianAPI, proxied and cached by the backend) ----------------------
export type HistoryPeriod = '1m' | '6m' | '1yr' | '3yr' | '5yr' | '10yr' | 'max';
export type ReferenceMeta = { fetched_at: string; cached: boolean; stale: boolean; notice: string | null };
export type HistoryPoint = {
  date: string; close: number; volume: number | null; delivery_percent: number | null; dma50: number | null; dma200: number | null;
};
export type PriceHistory = ReferenceMeta & {
  symbol: string; period: HistoryPeriod; interval: '1D' | '1W'; points: HistoryPoint[]; count: number;
  first_date: string | null; last_date: string | null; source: 'indianapi';
};
export type MarketMover = {
  symbol: string | null; name: string | null; exchange: string | null; price: number; change: number | null;
  percent_change: number | null; open: number | null; high: number | null; low: number | null; previous_close: number | null;
  volume: number | null; year_high: number | null; year_low: number | null; rating: string | null;
  short_term_trend: string | null; long_term_trend: string | null;
};
export type TrendingResponse = ReferenceMeta & { gainers: MarketMover[]; losers: MarketMover[] };
export type MostActiveResponse = ReferenceMeta & { exchange: 'NSE' | 'BSE'; items: MarketMover[] };
export type ExtremeItem = { symbol: string; name: string | null; price: number; value: number | null };
export type Week52Response = ReferenceMeta & { nse: { highs: ExtremeItem[]; lows: ExtremeItem[] }; bse: { highs: ExtremeItem[]; lows: ExtremeItem[] } };
export type StockProfile = ReferenceMeta & {
  symbol: string; name: string | null; industry: string | null; description: string | null; isin: string | null;
  nse_code: string | null; bse_code: string | null; price: { nse: number | null; bse: number | null };
  percent_change: number | null; year_high: number | null; year_low: number | null;
  moving_averages: { days: number; nse: number | null; bse: number | null }[];
  stats: {
    market_cap_cr: number | null; pe_ttm: number | null; pb: number | null; dividend_yield: number | null; eps_ttm: number | null;
    book_value_per_share: number | null; beta: number | null; roe_ttm: number | null; net_margin_ttm: number | null; change_52w_percent: number | null;
  };
  risk: { category: string | null; std_dev: number | null } | null;
  analyst_ratings: { rating: string; rank: number | null; count: number }[];
  peers: { name: string; price: number | null; percent_change: number | null; pe: number | null; pb: number | null; market_cap_cr: number | null; rating: string | null }[];
  shareholding: { category: string | null; percentage: number | null; as_of: string | null }[];
};

export const insightsApi = {
  history: (symbol: string, period: HistoryPeriod = '1yr') =>
    request<PriceHistory>(`/market/history/${encodeURIComponent(symbol)}?period=${period}`),
  profile: (symbol: string) => request<StockProfile>(`/market/profile/${encodeURIComponent(symbol)}`),
  trending: () => request<TrendingResponse>('/market/trending'),
  mostActive: (exchange: 'NSE' | 'BSE' = 'NSE') => request<MostActiveResponse>(`/market/most-active?exchange=${exchange}`),
  week52: () => request<Week52Response>('/market/52-week'),
};
export interface SafePoint {
  id: string;
  account_id: string;
  name: string;
  trigger_type: string;
  cash_balance: number | string;
  reserved_cash: number | string;
  total_portfolio_value: number | string;
  positions_snapshot: Array<{
    instrument_id: string;
    symbol: string;
    name: string;
    product: string;
    quantity: number;
    average_price: number | string;
    snapshot_price?: number | string;
    snapshot_market_value?: number | string;
  }>;
  open_orders_snapshot: Array<{
    id: string;
    symbol: string;
    side: string;
    quantity: number;
    status: string;
  }>;
  note?: string | null;
  is_restored: boolean;
  restored_at?: string | null;
  created_at: string;
}

export interface SafePointPreview {
  safepoint_id: string;
  safepoint_name: string;
  created_at: string;
  current_cash: number | string;
  target_cash: number | string;
  cash_delta: number | string;
  orders_to_cancel_count: number;
  orders_to_cancel: Array<{
    id: string;
    symbol: string;
    side: string;
    quantity: number;
    status: string;
  }>;
  positions_diff: Array<{
    symbol: string;
    product: string;
    current_quantity: number;
    restored_quantity: number;
    delta_quantity: number;
    action: string;
  }>;
}

export interface SafePointRollbackResult {
  success: boolean;
  message: string;
  safepoint_id: string;
  safepoint_name: string;
  restored_at: string;
  cash_restored: number | string;
  new_cash_balance: number | string;
  orders_cancelled_count: number;
  positions_reverted_count: number;
}

export const recoveryApi = {
  listSafePoints: (limit = 30) => request<SafePoint[]>(`/recovery/safepoints?limit=${limit}`),
  createSafePoint: (name: string, note?: string) =>
    request<SafePoint>('/recovery/safepoints', { method: 'POST', body: JSON.stringify({ name, note }) }),
  previewRollback: (safepointId: string) =>
    request<SafePointPreview>(`/recovery/safepoints/${safepointId}/preview`),
  executeRollback: (safepointId: string) =>
    request<SafePointRollbackResult>(`/recovery/safepoints/${safepointId}/rollback`, { method: 'POST' }),
  simulateDisruption: (symbol = 'TCS', quantity = 50, price = 1200) =>
    request<any>('/recovery/simulate-disruption', { method: 'POST', body: JSON.stringify({ symbol, quantity, price }) }),
};

