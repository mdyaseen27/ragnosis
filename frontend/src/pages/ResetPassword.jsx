import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Field, Icon } from '../components/ui';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (pw !== pw2) { setErr('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, password: pw } });
      setDone(true);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div className="authwrap">
      <div className="card" style={{ maxWidth: 460, width: '100%', padding: '30px 30px 26px' }}>
        <span className="eyebrow">Account recovery</span>
        <h2 style={{ fontSize: 24, marginBottom: 8 }}>Set a new password</h2>
        {!token ? (
          <>
            <div className="form-err" role="alert">This page needs a reset link. Request one from the sign-in page.</div>
            <p className="small" style={{ marginTop: 14 }}><Link to="/login">← Back to sign in</Link></p>
          </>
        ) : done ? (
          <>
            <div className="form-ok" role="status">
              <Icon name="check" size={16} /> Password updated. Your other sessions were signed out.
            </div>
            <Link className="btn" to="/login" style={{ width: '100%', marginTop: 16 }}>Sign in with your new password</Link>
          </>
        ) : (
          <>
            <p className="sub" style={{ marginBottom: 18 }}>Choose a new password for your account. Reset links expire after 30 minutes and work once.</p>
            {err && <div className="form-err" role="alert">{err}</div>}
            <form onSubmit={submit}>
              <Field label="New password" hint="At least 8 characters.">
                <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} autoComplete="new-password" />
              </Field>
              <Field label="Confirm new password">
                <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" />
              </Field>
              <button className="btn" style={{ width: '100%' }} disabled={busy}>
                {busy ? 'Please wait…' : 'Update password'}
              </button>
            </form>
            <p className="small" style={{ marginTop: 14, textAlign: 'center' }}><Link to="/login">← Back to sign in</Link></p>
          </>
        )}
      </div>
    </div>
  );
}
