import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';

// Email OTP (6-digit code), not a magic link: a link would open in Safari
// rather than the installed home-screen app, so the session would land in
// the wrong place. The pending email is remembered so the code step survives
// iOS closing the app while she checks her inbox.
const PENDING_KEY = 'job-tracker-pending-email';

export function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem(PENDING_KEY) ?? '');
  const [step, setStep] = useState<'email' | 'code'>(() => (localStorage.getItem(PENDING_KEY) ? 'code' : 'email'));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    localStorage.setItem(PENDING_KEY, addr);
    setEmail(addr);
    setCode('');
    setStep('code');
    setInfo(`We've emailed a 6-digit code to ${addr}.`);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, '');
    if (token.length < 6) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (error) {
      setError(error.message.includes('expired') ? 'That code has expired or is wrong. Send a new one.' : error.message);
      return;
    }
    localStorage.removeItem(PENDING_KEY);
    // onAuthStateChange in App takes it from here.
  }

  function changeEmail() {
    localStorage.removeItem(PENDING_KEY);
    setStep('email');
    setCode('');
    setError(null);
    setInfo(null);
  }

  return (
    <div className="login">
      <div className="login-card card">
        <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="login-logo" />
        <div>
          <h1>Job Tracker</h1>
          <p className="muted">Your applications, follow-ups and interviews in one place.</p>
        </div>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="stack">
            <p className="muted">Sign in with your email. We'll send you a 6-digit code.</p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn primary block" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="stack">
            <p className="muted">{info ?? `Enter the 6-digit code we emailed to ${email}.`}</p>
            <label className="field">
              <span>Code</span>
              <input
                className="code-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={10}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn primary block" disabled={busy}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <div className="row-between">
              <button type="button" className="btn link" onClick={() => void sendCode()} disabled={busy}>
                Send a new code
              </button>
              <button type="button" className="btn link" onClick={changeEmail} disabled={busy}>
                Use a different email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
