import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, type User } from '../api';
import { Brand } from './Brand';

export function AuthPage({ mode, onAuth }: { mode: 'login' | 'register'; onAuth: (user: User) => void }) {
  const register = mode === 'register';
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try { const result = register ? await authApi.register(name, email, password) : await authApi.login(email, password); onAuth(result.user); navigate('/dashboard'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell">
    <section className="auth-panel">
      <header className="auth-nav"><Brand /><Link className="quiet-link" to="/"><ArrowLeft size={15} /> Back to overview</Link></header>
      <div className="auth-content">
        <span className="eyebrow"><span className="status-dot" /> YOUR MARKET PRACTICE STARTS HERE</span>
        <h1>{register ? <>Build confidence<br />before the bell.</> : <>Good to see<br />you again.</>}</h1>
        <p className="auth-lede">{register ? 'Create your free workspace and learn how decisions shape a portfolio.' : 'Pick up where you left off. Your paper portfolio is ready.'}</p>
        <form className="auth-form" onSubmit={submit}>
          {register && <label>Full name<input autoComplete="name" placeholder="e.g. Asha Rao" value={name} onChange={e => setName(e.target.value)} required minLength={2} maxLength={80} /></label>}
          <label>Email address<input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required maxLength={254} /></label>
          <label>Password<span className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} placeholder={register ? 'At least 8 characters' : 'Enter your password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={72} /><button type="button" className="eye-button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          {register && <p className="form-note"><Check size={13} /> Use at least 8 characters. Your account is for practice, never real orders.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create your account' : 'Sign in'} <ArrowUpRight size={16} /></button>
        </form>
        {!register && <p className="forgot-link-row"><Link to="/forgot-password">Forgot your password?</Link></p>}
        <p className="auth-switch">{register ? 'Already have an account?' : 'New to Tradeo?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create account'}</Link></p>
        <div className="secure-note"><ShieldCheck size={16} /><span>Secure sign-in · Simulated trading only</span></div>
      </div>
      <footer className="auth-footer"><span>© 2026 Tradeo</span><span>Practice thoughtfully. Trade confidently.</span></footer>
    </section>
    <aside className="auth-aside">
      <div className="aside-orbit orbit-one" /><div className="aside-orbit orbit-two" />
      <div className="aside-caption"><span>THE MARKET, WITHOUT THE STAKES</span><span>01 — 03</span></div>
      <div className="aside-feature"><div className="feature-line" /><p>Learn the rhythm.<br /><em>Own the decision.</em></p><span>Realistic order practice, clear portfolio insights, and a safe space to get better.</span></div>
      <div className="mini-market-card"><span className="mini-label">NIFTY 50 <i>SIMULATED</i></span><strong>24,812.35</strong><span className="positive">↗ 0.84% <small>today</small></span><svg viewBox="0 0 330 84" preserveAspectRatio="none" aria-label="Illustrative upward price line"><path d="M0 67 C20 65 23 42 44 48 S66 67 81 53 S102 59 116 39 S139 51 154 43 S180 50 196 27 S224 39 239 18 S263 35 280 19 S309 26 330 7" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M0 67 C20 65 23 42 44 48 S66 67 81 53 S102 59 116 39 S139 51 154 43 S180 50 196 27 S224 39 239 18 S263 35 280 19 S309 26 330 7 L330 84 L0 84Z" fill="url(#fade)" opacity=".16" /><defs><linearGradient id="fade" x1="0" x2="0" y1="0" y2="1"><stop stopColor="currentColor" /><stop offset="1" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs></svg><div className="mini-foot"><span>MARKET PREVIEW</span><span>ILLUSTRATIVE DATA</span></div></div>
      <div className="aside-bottom"><span>BUILT FOR BETTER DECISIONS</span><div><span /> <span /> <span /></div></div>
    </aside>
  </main>;
}
