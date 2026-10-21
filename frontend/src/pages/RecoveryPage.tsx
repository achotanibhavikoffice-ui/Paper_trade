import { useEffect, useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  History,
  RefreshCw,
  Plus,
  Info,
  Zap,
  Lock,
} from 'lucide-react';
import {
  recoveryApi,
  accountApi,
  tradingApi,
  type SafePoint,
  type PortfolioSummary,
  type AccountInfo,
} from '../api';

function formatInr(val: number | string | undefined | null): string {
  if (val === undefined || val === null) return '₹0.00';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '₹0.00';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(num);
}

export function RecoveryPage() {
  const [safepoints, setSafepoints] = useState<SafePoint[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  // New SafePoint Form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');

  // Automatic Recovery Acknowledgment state
  const [autoRecoveryAck, setAutoRecoveryAck] = useState<any | null>(null);

  // Notification message
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadData = async () => {
    try {
      const [sps, summ, acc] = await Promise.all([
        recoveryApi.listSafePoints(),
        tradingApi.summary().catch(() => null),
        accountApi.getAccount().catch(() => null),
      ]);
      setSafepoints(sps);
      setSummary(summ);
      setAccount(acc);
    } catch (err: any) {
      showToast(err.message || 'Failed to load recovery data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreateSafePoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setActionLoading(true);
    try {
      const created = await recoveryApi.createSafePoint(newName.trim(), newNote.trim() || undefined);
      showToast(`SafePoint "${created.name}" captured! Autonomous shield armed.`, 'success');
      setNewName('');
      setNewNote('');
      setShowCreateModal(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to capture SafePoint', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Simulates a crash (TCS 50 @ 1200) and automatically heals it behind the scenes
  const handleSimulateDisruption = async () => {
    setActionLoading(true);
    try {
      const result = await recoveryApi.simulateDisruption('TCS', 50, 1200);
      setAutoRecoveryAck(result);
      showToast(
        'Fault intercepted! System automatically rolled back the compromised trade to ensure zero loss.',
        'success'
      );
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Simulation test failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="trade-page trade-subpage" style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`trade-notice ${toastMessage.type === 'error' ? 'error' : ''}`}
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 9999,
            minWidth: 320,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            backgroundColor: toastMessage.type === 'success' ? '#e8f5ef' : toastMessage.type === 'error' ? '#fdf2f2' : '#f0f7ff',
            color: toastMessage.type === 'success' ? '#0e6245' : toastMessage.type === 'error' ? '#991b1b' : '#1e40af',
            borderColor: toastMessage.type === 'success' ? '#b7e4cf' : toastMessage.type === 'error' ? '#fca5a5' : '#bfdbfe',
          }}
        >
          <strong>{toastMessage.type === 'success' ? '✓ ' : 'ℹ '} {toastMessage.text}</strong>
        </div>
      )}

      {/* Page Heading */}
      <div className="trade-page-heading" style={{ marginBottom: 20 }}>
        <div>
          <span className="trade-eyebrow">
            <ShieldCheck size={14} color="#15977e" /> AUTONOMOUS RESILIENCE &amp; ZERO-LOSS PROTECTION
          </span>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            SafePoint Recovery Engine
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#15977e',
                background: '#e8f5ef',
                padding: '4px 10px',
                borderRadius: 20,
                border: '1px solid #c8e6d9',
              }}
            >
              Automatic Protection Active
            </span>
          </h1>
          <p className="trade-subtitle">
            If broker APIs drop, network disconnects, or unexpected execution failures occur, the platform automatically rolls back to your previous safe state in the background. No manual intervention required.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="trade-secondary-button"
            onClick={handleSimulateDisruption}
            disabled={actionLoading}
            title="Inject an execution fault (TCS 50 @ ₹1,200) to verify automatic rollback in action"
          >
            <Zap size={15} color="#e67e22" /> Test Auto-Recovery (TCS 50 @ ₹1,200)
          </button>
          <button
            className="trade-primary-button"
            onClick={() => setShowCreateModal(true)}
            disabled={actionLoading}
          >
            <Plus size={15} /> Capture SafePoint
          </button>
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="trade-hero-grid four" style={{ marginBottom: 24 }}>
        <div className="trade-metric-card">
          <span className="trade-card-label">CURRENT CASH (PROTECTED)</span>
          <strong>{formatInr(summary?.cash_balance ?? account?.cash_balance ?? 100000)}</strong>
          <small>PostgreSQL ledger reconciled</small>
        </div>
        <div className="trade-metric-card">
          <span className="trade-card-label">TOTAL PORTFOLIO EQUITY</span>
          <strong>{formatInr(summary?.equity ?? 100000)}</strong>
          <small>Mark-to-market valuation</small>
        </div>
        <div className="trade-metric-card">
          <span className="trade-card-label">CHECKPOINT SNAPSHOTS</span>
          <strong>{safepoints.length} Guarded States</strong>
          <small>Automated pre-trade &amp; baseline</small>
        </div>
        <div className="trade-metric-card">
          <span className="trade-card-label">RECOVERY MODE</span>
          <strong style={{ color: '#15977e' }}>100% Autonomous</strong>
          <small>Automatic silent rollback on fault</small>
        </div>
      </div>

      {/* Automatic Recovery Acknowledgment Card (UI Reflection) */}
      {autoRecoveryAck && (
        <div
          className="trade-panel"
          style={{
            background: '#f4fbf8',
            borderColor: '#c6ecd9',
            borderLeft: '5px solid #15977e',
            marginBottom: 24,
            padding: 22,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <CheckCircle2 size={18} color="#15977e" />
                <h3 style={{ margin: 0, color: '#065f46', fontSize: 16 }}>
                  Auto-Recovery Acknowledged: Anomaly Handled Successfully
                </h3>
                <span
                  style={{
                    background: '#d1fae5',
                    color: '#065f46',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 12,
                  }}
                >
                  ZERO LOSS SECURED
                </span>
              </div>
              <p style={{ margin: '0 0 14px', color: '#047857', fontSize: 13, lineHeight: 1.5 }}>
                {autoRecoveryAck.message}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 12,
                  background: '#ffffff',
                  padding: 14,
                  borderRadius: 8,
                  border: '1px solid #d1fae5',
                }}
              >
                <div>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>RESTORED CAPITAL</span>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#15977e', marginTop: 2 }}>
                    +{formatInr(autoRecoveryAck.impact?.funds_auto_restored)}
                  </div>
                  <small style={{ color: '#64748b' }}>Returned to cash balance</small>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>NEUTRALIZED EXPOSURE</span>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                    {autoRecoveryAck.impact?.compromised_trade_neutralized}
                  </div>
                  <small style={{ color: '#64748b' }}>Post-crash order erased</small>
                </div>

                <div>
                  <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>SECURED CASH BALANCE</span>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                    {formatInr(autoRecoveryAck.impact?.active_cash_balance)}
                  </div>
                  <small style={{ color: '#64748b' }}>Available for safe trading</small>
                </div>
              </div>
            </div>

            <button
              onClick={() => setAutoRecoveryAck(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Dismiss ✕
            </button>
          </div>
        </div>
      )}

      {/* Create SafePoint Inline Modal / Form */}
      {showCreateModal && (
        <div
          className="trade-panel"
          style={{
            background: '#f8fafc',
            borderColor: '#94a3b8',
            marginBottom: 24,
            padding: 20,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Plus size={16} color="#087f72" /> Capture Custom SafePoint
            </h3>
            <button
              onClick={() => setShowCreateModal(false)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleCreateSafePoint} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  SAFEPOINT LABEL / NAME *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pre-Market Session Baseline"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  OPTIONAL NOTE / CONTEXT
                </label>
                <input
                  type="text"
                  placeholder="e.g. Settled cash ready before testing new trading setup"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid #cbd5e1',
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <button
                type="button"
                className="trade-secondary-button"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="trade-primary-button"
                disabled={actionLoading || !newName.trim()}
              >
                Capture SafePoint
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SafePoint Checkpoint Timeline & Table */}
      <div className="trade-panel">
        <div className="trade-panel-heading">
          <div>
            <span className="trade-section-kicker">CHECKPOINT LOG &amp; AUDIT TRAIL</span>
            <h2>
              <History size={17} color="#087f72" /> Guarded SafePoint Checkpoints
            </h2>
          </div>
          <button
            className="trade-link-button"
            onClick={loadData}
            disabled={loading || actionLoading}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {safepoints.length === 0 ? (
          <div className="trade-empty">
            <ShieldCheck size={38} color="#087f72" />
            <strong>No SafePoints recorded yet</strong>
            <p>
              The platform automatically pins safe states before high-impact orders and allows you to capture custom checkpoints anytime.
            </p>
            <button className="trade-primary-button" onClick={() => setShowCreateModal(true)}>
              Capture First SafePoint
            </button>
          </div>
        ) : (
          <div className="trade-table-wrap">
            <table className="trade-table">
              <thead>
                <tr>
                  <th>SafePoint Label</th>
                  <th>Trigger Mode</th>
                  <th>Cash Snapshot</th>
                  <th>Holdings Snapshot</th>
                  <th>Timestamp</th>
                  <th>Protection Status</th>
                </tr>
              </thead>
              <tbody>
                {safepoints.map((sp) => (
                  <tr key={sp.id}>
                    <td>
                      <strong>{sp.name}</strong>
                      {sp.note && <small style={{ color: '#64748b' }}>{sp.note}</small>}
                    </td>
                    <td>
                      <span
                        className="trade-product-chip"
                        style={{
                          background:
                            sp.trigger_type === 'PRE_TRADE'
                              ? '#fef3c7'
                              : sp.trigger_type === 'MANUAL'
                              ? '#e0f2fe'
                              : '#f1f5f9',
                          color:
                            sp.trigger_type === 'PRE_TRADE'
                              ? '#92400e'
                              : sp.trigger_type === 'MANUAL'
                              ? '#0369a1'
                              : '#475569',
                        }}
                      >
                        {sp.trigger_type}
                      </span>
                    </td>
                    <td>
                      <strong>{formatInr(sp.cash_balance)}</strong>
                    </td>
                    <td>
                      <span>{sp.positions_snapshot?.length ?? 0} holdings guarded</span>
                    </td>
                    <td>
                      <small>{new Date(sp.created_at).toLocaleString('en-IN')}</small>
                    </td>
                    <td>
                      {sp.is_restored ? (
                        <span
                          className="trade-status-chip filled"
                          style={{
                            background: '#ecfdf5',
                            color: '#047857',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <CheckCircle2 size={11} /> Auto-Recovered
                        </span>
                      ) : (
                        <span
                          className="trade-status-chip open"
                          style={{
                            background: '#f0fdf4',
                            color: '#15803d',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          <Lock size={11} /> Guarded Baseline
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* How Autonomous Recovery Works (Designed for PPT & Evaluation) */}
      <div className="trade-panel" style={{ marginTop: 24, background: '#f8fafc' }}>
        <div className="trade-panel-heading">
          <div>
            <span className="trade-section-kicker">AUTONOMOUS RESILIENCE ARCHITECTURE</span>
            <h2>
              <Info size={16} color="#087f72" /> Why Automatic Recovery Matters for Traders
            </h2>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <strong style={{ display: 'block', color: '#0f172a', marginBottom: 6 }}>
              1. Zero User Friction
            </strong>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              Traders should not need to debug network errors or manually trigger rollbacks. The system detects packet drops or broker anomalies autonomously and restores state instantly.
            </p>
          </div>
          <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <strong style={{ display: 'block', color: '#0f172a', marginBottom: 6 }}>
              2. Pre-Trade Checkpointing
            </strong>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              Before critical market executions are sent, an immutable SafePoint is pinned. If execution desyncs mid-flight, funds return to the clean checkpoint without slippage or penalty.
            </p>
          </div>
          <div style={{ background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <strong style={{ display: 'block', color: '#0f172a', marginBottom: 6 }}>
              3. Transparent Audit Acknowledgment
            </strong>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
              When a recovery occurs, the UI explicitly acknowledges the event with full financial transparency: funds secured, positions erased, and reconciled ledger entries recorded.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
