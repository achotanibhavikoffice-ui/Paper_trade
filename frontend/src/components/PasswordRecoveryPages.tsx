import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { authApi } from '../api';
import { Brand } from './Brand';
import './AccountPages.css';

function RecoveryLayout({ children }: { children: ReactNode }) {
  return <main className="recovery-page"><header className="account-nav"><Brand /><Link to="/login" className="account-back"><ArrowLeft size={17} /> Back to sign in</Link></header><section className="recovery-card">{children}<p className="recovery-security"><ShieldCheck size={16} /> Reset links are private, single-use, and expire after 30 minutes.</p></section><footer className="recovery-footer">© 2026 Tradeo <span>·</span> Paper trading only</footer></main>;
}

export function ForgotPasswordPage() {
  const location = useLocation();
  const presetEmail = (location.state as { email?: string } | null)?.email ?? '';
  const [email, setEmail] = useState(presetEmail);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await authApi.requestPasswordReset(email.trim());
      setMessage(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to request a reset link. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return <RecoveryLayout><span className="account-eyebrow"><Mail size={16} /> ACCOUNT RECOVERY</span><h1>Forgot your password?</h1><p className="recovery-description">Enter the email address for your Tradeo account. If it matches an account, we’ll send a one-time password reset link.</p><form className="recovery-form" onSubmit={submit}><label>Email address<input type="email" autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required maxLength={254} /></label>{message && <div className="recovery-success" role="status"><Check size={18} /><span>{message}{import.meta.env.DEV && <small>For local development, check the backend terminal for the reset link.</small>}</span></div>}{error && <p className="account-error" role="alert">{error}</p>}<button className="account-save recovery-submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'} <ArrowRight size={17} /></button></form><p className="recovery-switch">Remember your password? <Link to="/login">Sign in</Link></p></RecoveryLayout>;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!token) {
      setError('This reset link is missing its token. Request a new link.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await authApi.resetPassword(token, password);
      setMessage(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reset your password. Request a new link.');
    } finally {
      setBusy(false);
    }
  }

  return <RecoveryLayout><span className="account-eyebrow"><KeyRound size={16} /> CHOOSE A NEW PASSWORD</span><h1>Reset your password</h1><p className="recovery-description">Choose a new password with at least 8 characters. Your old password will stop working after the reset.</p>{message ? <div className="recovery-success recovery-reset-success" role="status"><Check size={18} /><span>{message}<Link to="/login">Continue to sign in <ArrowRight size={15} /></Link></span></div> : <form className="recovery-form" onSubmit={submit}><label>New password<span className="recovery-password"><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required minLength={8} maxLength={72} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter the new password again" required minLength={8} maxLength={72} /></label>{error && <p className="account-error" role="alert">{error}</p>}<button className="account-save recovery-submit" disabled={busy || !token}>{busy ? 'Updating…' : 'Update password'} <ArrowRight size={17} /></button></form>}<p className="recovery-switch">Link expired or not working? <Link to="/forgot-password">Request a new one</Link></p></RecoveryLayout>;
}
