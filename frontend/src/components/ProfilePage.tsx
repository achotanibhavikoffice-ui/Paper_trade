import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, Check, CircleUserRound, KeyRound, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '../api';
import { authApi } from '../api';
import { Brand } from './Brand';
import './AccountPages.css';

export function ProfilePage({ user, onAuth }: { user: User; onAuth: (user: User | null) => void }) {
  const [name, setName] = useState(user.name);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
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
      setError(cause instanceof Error ? cause.message : 'Unable to save your profile. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try { await authApi.logout(); } catch { /* Return to the public page even if the API is unavailable. */ }
    onAuth(null);
    navigate('/');
  }

  return <main className="account-page">
    <header className="account-nav"><Brand /><Link to="/dashboard" className="account-back"><ArrowLeft size={17} /> Back to dashboard</Link></header>
    <div className="account-content">
      <div className="account-heading"><span className="account-eyebrow"><CircleUserRound size={16} /> YOUR ACCOUNT</span><h1>Profile and personal details</h1><p>Review the information linked to your Tradeo account and update your display name.</p></div>
      <section className="profile-summary"><div className="profile-large-avatar">{user.name.slice(0, 1).toUpperCase()}</div><div><h2>{user.name}</h2><p>{user.email}</p></div><span className="profile-active"><i /> Account active</span></section>

      <section className="account-card"><div className="account-card-heading"><span className="account-card-icon"><UserRound size={19} /></span><div><h2>Personal information</h2><p>These are the details currently saved to your account.</p></div></div>
        <form className="account-form" onSubmit={saveProfile}>
          <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" minLength={2} maxLength={80} required /></label>
          <label>Email address<span className="account-readonly"><Mail size={16} /><input type="email" value={user.email} readOnly aria-describedby="email-note" /></span><small id="email-note">Your email is used to sign in and receive account recovery links.</small></label>
          <div className="account-form-bottom">{message && <span className="account-success" role="status"><Check size={16} /> {message}</span>}{error && <span className="account-error" role="alert">{error}</span>}<button className="account-save" type="submit" disabled={busy || name.trim() === user.name}>{busy ? 'Saving…' : 'Save changes'} <ArrowUpRight size={17} /></button></div>
        </form>
      </section>

      <section className="account-card account-security"><div className="account-card-heading"><span className="account-card-icon"><ShieldCheck size={19} /></span><div><h2>Sign-in and security</h2><p>Manage access to your Tradeo account.</p></div></div><div className="security-row"><span className="security-row-icon"><KeyRound size={18} /></span><span><strong>Password</strong><small>Reset your password using a one-time link sent to your email.</small></span><Link to="/forgot-password" state={{ email: user.email }} className="security-link">Reset password <ArrowUpRight size={16} /></Link></div><div className="security-row"><span className="security-row-icon"><Mail size={18} /></span><span><strong>Account email</strong><small>{user.email}</small></span><span className="verified-label"><Check size={14} /> Sign-in email</span></div></section>

      <section className="account-meta"><div><span>ACCOUNT CREATED</span><strong>{joined}</strong></div><div><span>PROFILE LAST UPDATED</span><strong>{updated}</strong></div><div><span>ACCOUNT ID</span><strong className="account-id">{user.id}</strong></div><button onClick={logout}><LogOut size={16} /> Sign out</button></section>
      <p className="account-privacy">We only show information currently stored for your account. Email changes are not available until email verification is implemented.</p>
    </div>
  </main>;
}
