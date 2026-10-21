import { useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Check,
  KeyRound,
  LogOut,
  Mail,
  Sliders,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '../api';
import { authApi } from '../api';
import { PageHeader } from '../components/common/PageHeader';
import { TabNavigation } from '../components/common/TabNavigation';
import '../components/AccountPages.css';

export function ProfileSettingsPage({ user, onAuth }: { user: User; onAuth: (user: User | null) => void }) {
  const [name, setName] = useState(user.name);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const navigate = useNavigate();

  // Settings preferences state
  const [defaultProduct, setDefaultProduct] = useState<'MIS' | 'CNC'>(
    (localStorage.getItem('quantx_default_product') as 'MIS' | 'CNC') || 'MIS'
  );
  const [confirmOrders, setConfirmOrders] = useState(
    localStorage.getItem('quantx_confirm_orders') !== 'false'
  );

  const joined = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(user.created_at));
  const updated = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(user.updated_at));

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');
    setBusy(true);
    try {
      const result = await authApi.updateProfile(name.trim());
      onAuth(result.user);
      setName(result.user.name);
      setMessage('Your profile has been updated.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save profile. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      /* Return to public overview */
    }
    onAuth(null);
    navigate('/');
  }

  const tabs = [
    { id: 'personal', label: 'Personal Information' },
    { id: 'trading', label: 'Trading Preferences' },
    { id: 'security', label: 'Security & Access' },
  ];

  return (
    <>
      <PageHeader
        title="Profile"
        eyebrow="YOUR ACCOUNT"
        description="Manage your display name, account preferences, and sign-in security."
        breadcrumbs={[{ label: 'Profile' }]}
      />

      <TabNavigation tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="account-page pt-0">
        <div className="account-content max-w-4xl">
          {/* User Summary Banner */}
          <section className="profile-summary">
            <div className="profile-large-avatar">{user.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <h2>{user.name}</h2>
              <p>{user.email}</p>
            </div>
            <span className="profile-active"><i /> Account active</span>
          </section>

          {activeTab === 'personal' && (
            <section className="account-card">
              <div className="account-card-heading">
                <span className="account-card-icon"><UserRound size={19} /></span>
                <div>
                  <h2>Personal Information</h2>
                  <p>Update your public display name saved to your account.</p>
                </div>
              </div>
              <form className="account-form" onSubmit={saveProfile}>
                <label>
                  Full name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </label>
                <label>
                  Email address
                  <span className="account-readonly">
                    <Mail size={16} />
                    <input type="email" value={user.email} readOnly />
                  </span>
                  <small>Your email is used to sign in and receive account recovery links.</small>
                </label>
                <div className="account-form-bottom">
                  {message && <span className="account-success" role="status"><Check size={16} /> {message}</span>}
                  {error && <span className="account-error" role="alert">{error}</span>}
                  <button className="account-save" type="submit" disabled={busy || name.trim() === user.name}>
                    {busy ? 'Saving…' : 'Save changes'} <ArrowUpRight size={17} />
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeTab === 'trading' && (
            <section className="account-card">
              <div className="account-card-heading">
                <span className="account-card-icon"><Sliders size={19} /></span>
                <div>
                  <h2>Trading Preferences</h2>
                  <p>Configure default product types and order execution confirmation dialogs. Preferences save automatically.</p>
                </div>
              </div>

              <div className="p-4 space-y-4 text-xs">
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div>
                    <strong className="block text-slate-800">Default Product Type</strong>
                    <span className="text-slate-500">Pre-select product choice on order tickets</span>
                  </div>
                  <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                    <button
                      onClick={() => { setDefaultProduct('MIS'); localStorage.setItem('quantx_default_product', 'MIS'); }}
                      className={`px-3 py-1 rounded font-semibold transition-colors ${defaultProduct === 'MIS' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      MIS Intraday
                    </button>
                    <button
                      onClick={() => { setDefaultProduct('CNC'); localStorage.setItem('quantx_default_product', 'CNC'); }}
                      className={`px-3 py-1 rounded font-semibold transition-colors ${defaultProduct === 'CNC' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      CNC Delivery
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div>
                    <strong className="block text-slate-800">Order Confirmation Dialog</strong>
                    <span className="text-slate-500">Ask for confirmation before submitting practice orders</span>
                  </div>
                  <button
                    onClick={() => { setConfirmOrders(!confirmOrders); localStorage.setItem('quantx_confirm_orders', (!confirmOrders).toString()); }}
                    className={`px-3 py-1 rounded font-semibold transition-colors ${confirmOrders ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-800'}`}
                  >
                    {confirmOrders ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeTab === 'security' && (
            <section className="account-card account-security">
              <div className="account-card-heading">
                <span className="account-card-icon"><ShieldCheck size={19} /></span>
                <div>
                  <h2>Sign-in and Security</h2>
                  <p>Manage access and password recovery for your account.</p>
                </div>
              </div>
              <div className="security-row">
                <span className="security-row-icon"><KeyRound size={18} /></span>
                <span>
                  <strong>Password Reset</strong>
                  <small>Reset your password using a one-time link delivered by email.</small>
                </span>
                <Link to="/forgot-password" state={{ email: user.email }} className="security-link">
                  Reset password <ArrowUpRight size={16} />
                </Link>
              </div>
            </section>
          )}

          <section className="account-meta">
            <div><span>ACCOUNT CREATED</span><strong>{joined}</strong></div>
            <div><span>PROFILE LAST UPDATED</span><strong>{updated}</strong></div>
            <div><span>ACCOUNT ID</span><strong className="account-id">{user.id}</strong></div>
            <button onClick={logout}><LogOut size={16} /> Sign out</button>
          </section>
        </div>
      </main>
    </>
  );
}
