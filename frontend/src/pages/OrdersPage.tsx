import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Clock3, RotateCcw, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tradingApi, type Order, type OrderStatus } from '../api';

const filters = ['ALL', 'OPEN', 'FILLED', 'CANCELLED', 'REJECTED'] as const;
const activeStatuses: OrderStatus[] = ['OPEN', 'PENDING', 'PARTIALLY_FILLED'];

export function OrdersPage() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const refresh = useCallback(async () => {
    try {
      const result = await tradingApi.orders(200);
      setOrders(result.items);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load your orders.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 7000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const visible = useMemo(() => orders.filter((order) => {
    const isActive = activeStatuses.includes(order.status);
    const matchesFilter = filter === 'ALL' || (filter === 'OPEN' ? isActive : order.status === filter);
    const text = `${order.symbol} ${order.company_name} ${order.id}`.toLowerCase();
    return matchesFilter && text.includes(search.toLowerCase());
  }), [orders, filter, search]);

  async function cancel(order: Order) {
    setBusyId(order.id);
    setError('');
    try {
      await tradingApi.cancelOrder(order.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not cancel the order.');
    } finally {
      setBusyId('');
    }
  }

  const counts = {
    ALL: orders.length,
    OPEN: orders.filter((order) => activeStatuses.includes(order.status)).length,
    FILLED: orders.filter((order) => order.status === 'FILLED').length,
    CANCELLED: orders.filter((order) => order.status === 'CANCELLED').length,
    REJECTED: orders.filter((order) => order.status === 'REJECTED').length,
  };

  return (
    <div className="trade-page">
      <header className="trade-page-heading">
        <div>
          <p className="trade-eyebrow">LOCAL PAPER EXECUTION</p>
          <h1>Orders</h1>
          <p className="trade-subtitle">Track fills and manage orders waiting in your simulated book.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="trade-secondary-button" onClick={() => navigate('/recovery')}>
            <RotateCcw size={15} style={{ color: '#15977e' }} /> Recovery Shield
          </button>
          <button className="trade-primary-button" onClick={() => navigate('/explore')}>
            New order <ArrowUpRight size={15} />
          </button>
        </div>
      </header>

      <div className="trade-order-stats">
        {(['ALL', 'OPEN', 'FILLED'] as const).map((key) => (
          <div key={key}>
            <span>{key === 'ALL' ? 'TOTAL ORDERS' : key === 'OPEN' ? 'IN PROGRESS' : 'FILLED'}</span>
            <strong>{counts[key]}</strong>
          </div>
        ))}
      </div>

      <section className="trade-panel trade-orders-panel">
        <div className="trade-orders-toolbar">
          <div className="trade-filter-tabs">
            {filters.map((key) => (
              <button
                key={key}
                className={filter === key ? 'active' : ''}
                onClick={() => setFilter(key)}
              >
                {key === 'OPEN' ? 'In progress' : key[0] + key.slice(1).toLowerCase()}
                <span>{counts[key]}</span>
              </button>
            ))}
          </div>
          <label className="trade-search-box compact">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search order or symbol"
            />
          </label>
        </div>

        {error && <div className="trade-notice error" role="alert">{error}</div>}

        {loading ? (
          <div className="trade-table-loading">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : visible.length === 0 ? (
          <div className="trade-empty">
            <div className="trade-empty-icon"><Clock3 size={20} /></div>
            <strong>{orders.length ? 'No orders match this filter' : 'Your paper order history is empty'}</strong>
            <p>{orders.length ? 'Choose another status or search term.' : 'Submit a practice order to see its live execution lifecycle here.'}</p>
            {!orders.length && <button onClick={() => navigate('/explore')}>Explore instruments</button>}
          </div>
        ) : (
          <div className="trade-table-wrap">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>TIME</th>
                  <th>INSTRUMENT</th>
                  <th>SIDE / PRODUCT</th>
                  <th>TYPE</th>
                  <th>FILLED</th>
                  <th>PRICE</th>
                  <th>STATUS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)}>
                    <td>
                      {new Date(order.created_at).toLocaleString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>
                      <strong>{order.symbol}</strong>
                      <small>{order.company_name}</small>
                    </td>
                    <td>
                      <span className={`trade-side-chip ${order.side.toLowerCase()}`}>{order.side}</span>
                      <small>{order.product}</small>
                    </td>
                    <td>
                      {order.order_type}
                      <small>{order.validity}</small>
                    </td>
                    <td>
                      {order.filled_quantity} / {order.quantity}
                    </td>
                    <td>
                      {order.average_execution_price
                        ? `₹${order.average_execution_price}`
                        : order.limit_price
                        ? `₹${order.limit_price}`
                        : 'Market'}
                    </td>
                    <td>
                      <span className={`trade-status-chip ${order.status.toLowerCase()}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="trade-row-actions">
                        <button
                          className="trade-row-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/orders/${order.id}`);
                          }}
                        >
                          Details <ArrowUpRight size={14} />
                        </button>
                        {activeStatuses.includes(order.status) && (
                          <button
                            className="trade-icon-action danger"
                            title="Cancel order"
                            disabled={busyId === order.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void cancel(order);
                            }}
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="trade-table-footer">
          <span>Order state refreshes automatically.</span>
          <span>Exchange order APIs are not used.</span>
        </footer>
      </section>
    </div>
  );
}
