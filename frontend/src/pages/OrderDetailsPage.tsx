import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock3, FileText, Pencil, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { tradingApi, type Order, type OrderEvent, type Trade } from '../api';

const inr = (value: number | string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(Number(value) || 0);
const activeStatuses = ['OPEN', 'PENDING', 'PARTIALLY_FILLED'];

export function OrderDetailsPage() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [limit, setLimit] = useState('');
  const [trigger, setTrigger] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [nextOrder, nextEvents, nextTrades] = await Promise.all([tradingApi.order(orderId), tradingApi.orderEvents(orderId), tradingApi.orderTrades(orderId)]);
      setOrder(nextOrder); setEvents(nextEvents); setTrades(nextTrades); setQuantity(String(nextOrder.quantity));
      setLimit(nextOrder.limit_price ?? ''); setTrigger(nextOrder.trigger_price ?? ''); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load this order.'); }
  }, [orderId]);
  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 5000); return () => window.clearInterval(timer); }, [refresh]);

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault(); if (!order) return;
    setBusy(true); setError('');
    try {
      await tradingApi.modifyOrder(order.id, { quantity: Number(quantity), limit_price: ['LIMIT', 'SL'].includes(order.order_type) ? limit : null, trigger_price: ['SL', 'SL-M'].includes(order.order_type) ? trigger : null, validity: order.validity });
      setEditing(false); await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Order could not be modified.'); }
    finally { setBusy(false); }
  }
  async function cancelOrder() {
    if (!order) return; setBusy(true); setError('');
    try { await tradingApi.cancelOrder(order.id); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Order could not be cancelled.'); }
    finally { setBusy(false); }
  }

  if (!order) return <div className="trade-page"><button className="trade-back-button" onClick={() => navigate('/orders')}><ArrowLeft size={16} /> Orders</button>{error && <div className="trade-notice error">{error}</div>}</div>;
  const isActive = activeStatuses.includes(order.status);
  const tradedValue = trades.reduce((sum, trade) => sum + Number(trade.price) * trade.quantity, 0);
  const charges = trades.reduce((sum, trade) => sum + Number(trade.charges?.total ?? 0), 0);

  return <div className="trade-page">
    <button className="trade-back-button" onClick={() => navigate('/orders')}><ArrowLeft size={16} /> Order history</button>
    <header className="trade-page-heading"><div><p className="trade-eyebrow">ORDER AUDIT TRAIL</p><h1>{order.symbol} <span className={`trade-side-chip ${order.side.toLowerCase()}`}>{order.side}</span></h1><p className="trade-subtitle">{order.company_name} · {order.product} · {order.order_type}</p></div><span className={`trade-status-chip large ${order.status.toLowerCase()}`}>{order.status.replace('_', ' ')}</span></header>
    {error && <div className="trade-notice error" role="alert">{error}</div>}
    <div className="trade-detail-grid"><div className="trade-stack">
      <section className="trade-panel"><div className="trade-panel-heading"><div><span className="trade-section-kicker">ORDER TERMS</span><h2>Execution summary</h2></div><code className="trade-order-id">{order.id}</code></div>
        {editing ? <form className="trade-edit-form" onSubmit={saveEdit}><label className="trade-form-label">TOTAL QUANTITY<input type="number" min={order.filled_quantity || 1} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>{['LIMIT', 'SL'].includes(order.order_type) && <label className="trade-form-label">LIMIT PRICE<input type="number" step="0.01" value={limit} onChange={(event) => setLimit(event.target.value)} /></label>}{['SL', 'SL-M'].includes(order.order_type) && <label className="trade-form-label">TRIGGER PRICE<input type="number" step="0.01" value={trigger} onChange={(event) => setTrigger(event.target.value)} /></label>}<div className="trade-row-actions"><button className="trade-primary-button" disabled={busy}><Check size={15} /> Save changes</button><button type="button" className="trade-secondary-button" onClick={() => setEditing(false)}>Discard</button></div></form> : <div className="trade-summary-grid"><div><span>ORDER TYPE</span><strong>{order.order_type}</strong></div><div><span>PRODUCT</span><strong>{order.product}</strong></div><div><span>QUANTITY</span><strong>{order.quantity}</strong></div><div><span>FILLED</span><strong>{order.filled_quantity} / {order.quantity}</strong></div><div><span>AVERAGE FILL</span><strong>{order.average_execution_price ? inr(order.average_execution_price) : '—'}</strong></div><div><span>LIMIT / TRIGGER</span><strong>{order.limit_price ? inr(order.limit_price) : '—'}{order.trigger_price ? ` / ${inr(order.trigger_price)}` : ''}</strong></div><div><span>EXECUTED VALUE</span><strong>{inr(tradedValue)}</strong></div><div><span>CHARGES</span><strong>{inr(charges)}</strong></div><div><span>PLACED</span><strong>{new Date(order.created_at).toLocaleString('en-IN')}</strong></div></div>}
        {isActive && !editing && <div className="trade-detail-actions"><button className="trade-secondary-button" onClick={() => setEditing(true)}><Pencil size={14} /> Modify order</button><button className="trade-cancel-button" disabled={busy} onClick={() => void cancelOrder()}><X size={14} /> Cancel order</button></div>}
      </section>
      <section className="trade-panel"><div className="trade-panel-heading"><div><span className="trade-section-kicker">EXECUTED TRADES</span><h2>Fills <span className="trade-count-chip">{trades.length}</span></h2></div></div>{trades.length ? <div className="trade-table-wrap"><table className="trade-table"><thead><tr><th>TIME</th><th>SEQUENCE</th><th>QUANTITY</th><th>PRICE</th><th>CHARGES</th></tr></thead><tbody>{trades.map((trade) => <tr key={trade.id}><td>{new Date(trade.created_at).toLocaleTimeString('en-IN')}</td><td>#{trade.sequence}</td><td>{trade.quantity}</td><td>{inr(trade.price)}</td><td>{inr(trade.charges?.total ?? 0)}</td></tr>)}</tbody></table></div> : <div className="trade-inline-empty">No fills yet. Open orders are matched when fresh market depth arrives.</div>}</section>
    </div>
    <aside className="trade-panel trade-event-panel"><div className="trade-panel-heading"><div><span className="trade-section-kicker">PERSISTED EVENTS</span><h2><Clock3 size={17} /> Order activity</h2></div></div>{events.length ? <ol className="trade-timeline">{events.map((item) => <li key={item.id}><i /><div><strong>{item.event_type.replace('_', ' ')}</strong><span>{item.status.replace('_', ' ')}</span><small>{new Date(item.created_at).toLocaleString('en-IN')}</small>{Boolean(item.details.quantity) && <small>{String(item.details.quantity)} shares{item.details.price ? ` at ${inr(String(item.details.price))}` : ''}</small>}</div></li>)}</ol> : <div className="trade-inline-empty">Event history will appear here.</div>}<div className="trade-audit-note"><FileText size={15} /><span>Orders, fills, and charges are recorded in your paper account’s PostgreSQL ledger.</span></div></aside></div>
  </div>;
}
