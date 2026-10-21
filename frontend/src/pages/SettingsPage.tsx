import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle, Check, ChevronDown, Clock3, Gauge,
  KeyRound, Moon, RotateCcw, Save, Settings2, ShieldCheck, Sun, UserRound, Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { User as QuantxUser } from '../api';
import { accountApi, authApi } from '../api';
import { PageHeader } from '../components/common/PageHeader';
import { applyTheme, getTheme, type Theme } from '../theme';
import '../components/SettingsPage.css';

type OrderType = 'MARKET' | 'LIMIT';
type SettingsValues = {
  accountType: 'CASH' | 'MARGIN'; leverage: number; commission: number; regulatoryFee: number;
  defaultQuantity: number; confirmOrders: boolean; orderType: OrderType;
  autoLiquidation: boolean; liquidationMinutes: number;
};
const storageKey = 'quantx_settings';
const defaults: SettingsValues = {
  accountType: 'CASH', leverage: 1, commission: 20, regulatoryFee: 0,
  defaultQuantity: 1, confirmOrders: true, orderType: 'MARKET',
  autoLiquidation: false, liquidationMinutes: 15,
};

function loadSettings(): SettingsValues {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }; }
  catch { return defaults; }
}
function money(value: number | string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function SettingRow({ title, description, control }: { title: string; description: string; control: ReactNode }) {
  return <div className="settings-row"><div className="settings-row-copy"><strong>{title}</strong><span>{description}</span></div><div className="settings-row-control">{control}</div></div>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`settings-switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><i /></button>;
}

export function SettingsPage({ user, onAuth }: { user: QuantxUser; onAuth: (user: QuantxUser | null) => void }) {
  const [theme, setTheme] = useState<Theme>(getTheme);
  const [values, setValues] = useState<SettingsValues>(loadSettings);
  const [name, setName] = useState(user.name);
  const [email] = useState(user.email);
  const [balance, setBalance] = useState('1000000');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    accountApi.getAccount().then((account) => setBalance(String(Math.round(Number(account.initial_capital))))).catch(() => {});
    accountApi.getFeeSettings().then((fees) => {
      setValues((current) => ({
        ...current,
        commission: fees.commission_per_order == null ? current.commission : Number(fees.commission_per_order),
        regulatoryFee: Number(fees.regulatory_fee_percent) || 0,
      }));
    }).catch(() => {});
  }, []);

  function update<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    // Keep the older order-ticket preferences in sync while those pages migrate.
    localStorage.setItem('quantx_confirm_orders', String(next.confirmOrders));
    localStorage.setItem('quantx_default_order_type', next.orderType);
    localStorage.setItem('quantx_default_order_size', String(next.defaultQuantity));
    window.dispatchEvent(new Event('quantx-settings-changed'));
  }

  function changeTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      const result = await authApi.updateProfile(name.trim());
      onAuth(result.user); setName(result.user.name); setMessage('Profile saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save your profile.'); }
    finally { setBusy(false); }
  }

  async function saveFees() {
    try {
      await accountApi.setFeeSettings(values.commission, values.regulatoryFee);
      setMessage('Custom paper trading fees saved and will apply to new fills.'); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save the fee settings.'); }
  }

  async function resetBalance(clearHistory: boolean) {
    const amount = Number(balance);
    if (!Number.isFinite(amount) || amount < 100000 || amount > 5000000) {
      setError('Enter a reset amount between ₹1,00,000 and ₹50,00,000.'); return;
    }
    const question = clearHistory
      ? `Reset the practice account to ${money(amount)} and permanently remove all mock orders, fills, positions, scenarios, and ledger history?`
      : `Set available virtual cash to ${money(amount)}? Your open orders and trading history will remain.`;
    if (!window.confirm(question)) return;
    setBusy(true); setMessage(''); setError('');
    try {
      if (clearHistory) await accountApi.resetAccount(amount);
      else await accountApi.resetBalance(amount);
      setMessage(clearHistory ? 'Practice account and trading history reset.' : 'Virtual cash balance reset.');
      window.setTimeout(() => window.location.reload(), 900);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not reset the practice account.'); }
    finally { setBusy(false); }
  }

  const effectiveTheme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light')
    : theme === 'dark' ? 'Dark' : 'Light';

  return <div className="settings-page">
    <PageHeader title="Settings" eyebrow="WORKSPACE PREFERENCES" description="Configure your practice account, order behavior, profile, and display." breadcrumbs={[{ label: 'Settings' }]} />

    {(message || error) && <div className={`settings-feedback ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>{error ? <AlertTriangle size={17} /> : <Check size={17} />}{error || message}<button type="button" onClick={() => { setError(''); setMessage(''); }} aria-label="Dismiss">×</button></div>}

    <section className="settings-section" aria-labelledby="simulation-heading">
      <header className="settings-section-heading"><span className="settings-section-icon"><Wallet size={19} /></span><div><span className="settings-eyebrow">PAPER TRADING</span><h2 id="simulation-heading">Simulation &amp; account</h2><p>Reset virtual funds and choose how your practice account behaves.</p></div></header>
      <div className="settings-section-body">
        <div className="settings-reset-card">
          <div className="settings-reset-copy"><strong>Reset virtual balance</strong><span>Choose the amount of virtual cash to restore. This does not remove open positions or trade history.</span></div>
          <label className="settings-input-wrap balance-input"><span>RESET AMOUNT (INR)</span><div><b>₹</b><input type="number" min="100000" max="5000000" step="10000" value={balance} onChange={(event) => setBalance(event.target.value)} /><small>{money(Number(balance) || 0)}</small></div></label>
          <button type="button" className="settings-button secondary" disabled={busy} onClick={() => void resetBalance(false)}><RotateCcw size={15} /> Reset balance</button>
        </div>
        <div className="settings-danger-card">
          <span className="settings-danger-icon"><AlertTriangle size={18} /></span><div className="settings-reset-copy"><strong>Reset trading history</strong><span>Removes mock orders, fills, positions, saved scenarios, checkpoints, and the ledger. Your profile and login remain.</span></div>
          <button type="button" className="settings-button danger" disabled={busy} onClick={() => void resetBalance(true)}>Reset account &amp; history</button>
        </div>
        <SettingRow title="Practice account type" description="Margin mode is a simulator preference; buying power remains limited to virtual cash." control={<div className="settings-segment"><button className={values.accountType === 'CASH' ? 'active' : ''} onClick={() => update('accountType', 'CASH')}>Cash</button><button className={values.accountType === 'MARGIN' ? 'active' : ''} onClick={() => update('accountType', 'MARGIN')}>Margin</button></div>} />
        {values.accountType === 'MARGIN' && <SettingRow title="Planning leverage" description="Used for planning and display only; it does not increase executable buying power." control={<select className="settings-select compact" value={values.leverage} onChange={(event) => update('leverage', Number(event.target.value))}><option value={2}>2×</option><option value={4}>4×</option><option value={5}>5×</option></select>} />}
        <SettingRow title="Flat broker commission" description="Applied once to each filled order. The default exchange schedule is used until you save a custom rate." control={<label className="settings-number"><span>₹</span><input type="number" min="0" max="10000" step="1" value={values.commission} onChange={(event) => update('commission', Math.max(0, Number(event.target.value)))} onBlur={() => void saveFees()} /></label>} />
        <SettingRow title="Additional regulatory fee" description="Optional percentage added to the built-in exchange and regulatory charges on each fill." control={<label className="settings-number"><input type="number" min="0" max="5" step="0.001" value={values.regulatoryFee} onChange={(event) => update('regulatoryFee', Math.max(0, Number(event.target.value)))} onBlur={() => void saveFees()} /><span>%</span></label>} />
      </div>
    </section>

    <section className="settings-section" aria-labelledby="trading-heading">
      <header className="settings-section-heading"><span className="settings-section-icon"><Gauge size={19} /></span><div><span className="settings-eyebrow">ORDER TICKETS</span><h2 id="trading-heading">Trading preferences</h2><p>Set the defaults used when you open a stock order ticket.</p></div></header>
      <div className="settings-section-body">
        <SettingRow title="Default order size" description="Starting quantity for a new order. You can change it on the ticket." control={<label className="settings-number"><input type="number" min="1" max="1000000" step="1" value={values.defaultQuantity} onChange={(event) => update('defaultQuantity', Math.max(1, Number(event.target.value)))} /><span>shares</span></label>} />
        <SettingRow title="Default order type" description="Preselect this order type on stock detail and dashboard tickets." control={<label className="settings-select-wrap"><select className="settings-select" value={values.orderType} onChange={(event) => update('orderType', event.target.value as OrderType)}><option value="MARKET">Market</option><option value="LIMIT">Limit</option></select><ChevronDown size={15} /></label>} />
        <SettingRow title="Order confirmation" description="Turn off to submit practice orders immediately after pressing the trade button." control={<Toggle checked={values.confirmOrders} onChange={(value) => update('confirmOrders', value)} label="Confirm orders before placing" />} />
        <SettingRow title="Position auto-liquidation" description="Save a preferred closeout reminder before the NSE cash-market close (15:30 IST). Orders will not be placed automatically." control={<div className="settings-inline-control"><Toggle checked={values.autoLiquidation} onChange={(value) => update('autoLiquidation', value)} label="Enable position auto-liquidation reminder" />{values.autoLiquidation && <label className="settings-select-wrap"><select className="settings-select compact" value={values.liquidationMinutes} onChange={(event) => update('liquidationMinutes', Number(event.target.value))}><option value={15}>15 min before close</option><option value={30}>30 min before close</option><option value={60}>60 min before close</option></select><ChevronDown size={15} /></label>}</div>} />
      </div>
    </section>

    <section className="settings-section" aria-labelledby="profile-heading">
      <header className="settings-section-heading"><span className="settings-section-icon"><UserRound size={19} /></span><div><span className="settings-eyebrow">YOUR QUANTX ACCOUNT</span><h2 id="profile-heading">Profile &amp; display</h2><p>Update your profile details and choose how the workspace looks.</p></div></header>
      <div className="settings-section-body">
        <form className="settings-profile-form" onSubmit={saveProfile}>
          <label className="settings-input-wrap"><span>FULL NAME</span><input autoComplete="name" minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label className="settings-input-wrap"><span>EMAIL ADDRESS</span><input type="email" value={email} readOnly /><small>Email address is used for sign-in and account recovery.</small></label>
          <button type="submit" className="settings-button primary" disabled={busy || name.trim() === user.name}><Save size={15} /> Save profile</button>
        </form>
        <div className="settings-security-row"><div><strong>Sign-in security</strong><span>Use a one-time email link to update your password.</span></div><Link to="/forgot-password"><KeyRound size={15} /> Reset password</Link></div>
        <div className="settings-divider" />
        <div className="settings-appearance-heading"><div><strong>Theme &amp; appearance</strong><span>Preference is saved on this device. System mode follows your OS appearance.</span></div><span className="settings-current"><i /> {effectiveTheme} appearance</span></div>
        <div className="settings-theme-options settings-theme-options-three" role="group" aria-label="Color theme">
          {([
            { id: 'light' as Theme, title: 'Light', detail: 'Bright workspace', Icon: Sun },
            { id: 'dark' as Theme, title: 'Dark', detail: 'Low-light workspace', Icon: Moon },
            { id: 'system' as Theme, title: 'System', detail: 'Match your device', Icon: Settings2 },
          ]).map(({ id, title, detail, Icon }) => <button key={id} type="button" aria-pressed={theme === id} className={`settings-theme-option ${theme === id ? 'selected' : ''}`} onClick={() => changeTheme(id)}><span className="settings-theme-icon"><Icon size={19} /></span><span className="settings-theme-copy"><strong>{title}</strong><small>{detail}</small></span><span className="settings-theme-check" aria-hidden="true">{theme === id && <Check size={14} />}</span></button>)}
        </div>
      </div>
    </section>

    <footer className="settings-footnote"><ShieldCheck size={16} /><span>Quantx is a paper trading workspace. Account resets and orders affect virtual balances and simulated records only.</span><span className="settings-footnote-time"><Clock3 size={14} /> Settings save automatically</span></footer>
  </div>;
}
