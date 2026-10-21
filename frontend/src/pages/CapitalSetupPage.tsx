import { useState, type FormEvent } from 'react';
import { ArrowRight, ShieldCheck, Wallet } from 'lucide-react';
import { accountApi } from '../api';
import { Brand } from '../components/Brand';

const MIN_CAPITAL = 100_000;
const MAX_CAPITAL = 5_000_000;
const PRESETS = [100_000, 500_000, 1_000_000, 2_500_000, 5_000_000];
const SMALL_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS_WORDS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const inr = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
}).format(value);

function underThousandWords(value: number): string {
  if (value < 20) return SMALL_WORDS[value];
  if (value < 100) return `${TENS_WORDS[Math.floor(value / 10)]}${value % 10 ? ` ${SMALL_WORDS[value % 10]}` : ''}`;
  return `${SMALL_WORDS[Math.floor(value / 100)]} hundred${value % 100 ? ` ${underThousandWords(value % 100)}` : ''}`;
}

function amountInWords(value: number): string {
  let remaining = Math.floor(value);
  const parts: string[] = [];
  for (const [unit, label] of [[10_000_000, 'crore'], [100_000, 'lakh'], [1_000, 'thousand'], [100, 'hundred']] as const) {
    if (remaining >= unit) {
      const count = Math.floor(remaining / unit);
      parts.push(`${underThousandWords(count)} ${label}`);
      remaining %= unit;
    }
  }
  if (remaining) parts.push(underThousandWords(remaining));
  const words = `${parts.join(' ')} rupees`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function CapitalSetupPage({ onComplete, currentCapital = null }: { onComplete: () => void; currentCapital?: string | null }) {
  const [amount, setAmount] = useState(currentCapital ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const numericAmount = Number(amount);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!Number.isInteger(numericAmount) || numericAmount < MIN_CAPITAL || numericAmount > MAX_CAPITAL) {
      setError('Choose an amount from ₹1,00,000 to ₹50,00,000.');
      return;
    }
    setSaving(true);
    try {
      await accountApi.setInitialCapital(numericAmount);
      onComplete();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your starting capital. Please try again.');
      setSaving(false);
    }
  }

  return (
    <main style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 24, background: 'radial-gradient(ellipse at top, #e7f3ef 0%, #f5f7f5 48%, #eef2f0 100%)' }}>
      <section role="dialog" aria-modal="true" aria-labelledby="capital-setup-title" style={{ width: 'min(100%, 560px)', padding: 'clamp(24px, 6vw, 44px)', background: '#fff', border: '1px solid #e3e8ef', borderRadius: 18, boxShadow: '0 28px 80px #183a2818' }}>
        <Brand />
        <div style={{ width: 48, height: 48, marginTop: 32, display: 'grid', placeItems: 'center', borderRadius: 14, background: '#e7f3ef', color: '#087f72' }}><Wallet size={23} /></div>
        <p style={{ margin: '22px 0 8px', color: '#087f72', fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>SET UP YOUR PRACTICE ACCOUNT</p>
        <h1 id="capital-setup-title" style={{ margin: 0, color: '#142538', fontSize: 'clamp(26px, 5vw, 34px)', lineHeight: 1.18 }}>{currentCapital ? 'Review your virtual capital' : 'How much virtual capital would you like?'}</h1>
        <p style={{ margin: '12px 0 26px', color: '#69798e', lineHeight: 1.6 }}>Choose a balance between ₹1 lakh and ₹50 lakh. Your practice funds are virtual; no real money is involved.</p>

        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="starting-capital" style={{ display: 'block', marginBottom: 8, color: '#526176', fontSize: 12, fontWeight: 800, letterSpacing: .7 }}>STARTING BALANCE (₹1 LAKH–₹50 LAKH)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', border: '1px solid #cfd9e3', borderRadius: 10, background: '#fff' }}>
            <span aria-hidden="true" style={{ color: '#69798e', fontSize: 22 }}>₹</span>
            <input id="starting-capital" type="number" min={MIN_CAPITAL} max={MAX_CAPITAL} step="1000" inputMode="numeric" required value={amount} onChange={(event) => setAmount(event.target.value)} style={{ width: '100%', height: 58, border: 0, outline: 0, color: '#142538', fontSize: 22, fontWeight: 700, background: 'transparent' }} />
          </div>
          <input aria-label="Choose starting balance" type="range" min={MIN_CAPITAL} max={MAX_CAPITAL} step="1000" value={Number.isFinite(numericAmount) ? Math.min(MAX_CAPITAL, Math.max(MIN_CAPITAL, numericAmount)) : MIN_CAPITAL} onChange={(event) => setAmount(event.target.value)} style={{ width: '100%', marginTop: 16, accentColor: '#087f72', cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, color: '#8492a2', fontSize: 12 }}><span>₹1 lakh</span><span>₹50 lakh</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }} aria-label="Suggested starting balances">
            {PRESETS.map((preset) => <button key={preset} type="button" onClick={() => setAmount(String(preset))} style={{ padding: '8px 12px', border: '1px solid #dce8e2', borderRadius: 999, background: Number(amount) === preset ? '#e7f3ef' : '#fff', color: '#356458', fontSize: 13, fontWeight: 700 }}>{inr(preset)}</button>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 20, padding: '14px 16px', borderRadius: 10, background: '#f5f8f6', color: '#69798e', fontSize: 13 }}>
            <span>Your virtual starting balance</span><strong aria-live="polite" style={{ color: '#142538', fontSize: 15, textAlign: 'right' }}>{Number.isInteger(numericAmount) && numericAmount >= MIN_CAPITAL && numericAmount <= MAX_CAPITAL ? <>{inr(numericAmount)}<small style={{ display: 'block', marginTop: 4, color: '#69798e', fontSize: 12, fontWeight: 500 }}>{amountInWords(numericAmount)}</small></> : '—'}</strong>
          </div>
          {error && <p role="alert" style={{ margin: '14px 0 0', color: '#b42318', fontSize: 13 }}>{error}</p>}
          <button type="submit" disabled={saving} style={{ width: '100%', height: 50, marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, border: 0, borderRadius: 9, background: saving ? '#83bcb3' : '#087f72', color: '#fff', fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Setting up account…' : 'Continue to Quantx'} <ArrowRight size={17} />
          </button>
        </form>
        <p style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '18px 0 0', color: '#8492a2', fontSize: 12 }}><ShieldCheck size={15} /> This amount is virtual and only affects your practice account.</p>
      </section>
    </main>
  );
}
