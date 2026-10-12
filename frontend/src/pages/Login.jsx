import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { HOME, useAuth } from '../auth/AuthContext';
import { Field, Icon } from '../components/ui';
import { LangSwitch, useLang } from '../i18n';

const TICKS = [
  'Plain-language explanations of every lab value',
  'Grounded answers from a curated medical knowledge base',
  'Appointments, prescriptions and reminders in one place',
];

export default function Login() {
  const { login, register, user, ready } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const from = useLocation().state?.from;
  const [mode, setMode] = useState('login'); // login | register | forgot
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(null); // forgot-password result
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ identifier: '', password: '', name: '', email: '', mobile: '', role: 'patient', specialization: '', hospital: '', doctor_id_public: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const go = (user) => nav(from || HOME[user.role] || '/', { replace: true });

  // Already signed in (e.g. arrived via the landing page): go straight to
  // the app instead of showing a sign-in form that looks like a logout.
  if (ready && user) return <Navigate to={from || HOME[user.role] || '/'} replace />;

  const submitForgot = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const d = await api('/auth/forgot-password', { method: 'POST', body: { email: f.email.trim().toLowerCase() } });
      setSent(d);
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') {
        go(await login(f.identifier.trim(), f.password));
      } else {
        const payload = {
          name: f.name.trim(), email: f.email.trim().toLowerCase(),
          mobile: f.mobile.trim() || undefined, password: f.password, role: f.role,
        };
        if (f.role === 'doctor') { payload.specialization = f.specialization.trim(); payload.hospital = f.hospital.trim() || undefined; }
        if (f.role === 'receptionist') payload.doctor_id_public = f.doctor_id_public.trim();
        go(await register(payload));
      }
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div className="authwrap">
      <div className="card authcard">
        <div className="authside">
          <Link to="/" className="brand" style={{ color: '#fff', paddingBottom: 8 }}>
            <span className="mark">R</span>RAGnosis
          </Link>
          <h2>Understand your health reports, finally.</h2>
          <p>Upload a lab report and get every value explained in plain language — with appointments and reminders built in.</p>
          <div className="ticks">
            {TICKS.map((t) => <span key={t}><Icon name="check" size={17} />{t}</span>)}
          </div>
        </div>
        <div className="authform">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}><LangSwitch /></div>
          {mode === 'forgot' ? (
            <>
              <h2 style={{ fontSize: 22, marginBottom: 6 }}>{t('auth.forgotTitle')}</h2>
              <p className="sub" style={{ marginBottom: 18 }}>Enter the email you registered with and we'll send you a reset link.</p>
              {err && <div className="form-err" role="alert">{err}</div>}
              {sent ? (
                <>
                  <div className="form-ok" role="status">{sent.message}</div>
                  {sent.reset_url && (
                    <p className="small" style={{ marginTop: 12 }}>
                      Development build — no mail server is wired up yet, so here is your link directly:{' '}
                      <a href={sent.reset_url}>Reset password</a>
                    </p>
                  )}
                  <button className="btn ghost" style={{ width: '100%', marginTop: 16 }} onClick={() => { setMode('login'); setSent(null); }}>
                    {t('auth.back')}
                  </button>
                </>
              ) : (
                <form onSubmit={submitForgot}>
                  <Field label="Email">
                    <input className="input" type="email" value={f.email} onChange={set('email')} required autoComplete="email" placeholder="you@example.com" />
                  </Field>
                  <button className="btn" style={{ width: '100%' }} disabled={busy}>
                    {busy ? '…' : t('auth.sendLink')}
                  </button>
                  <button type="button" className="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => setMode('login')}>
                    {t('auth.back')}
                  </button>
                </form>
              )}
            </>
          ) : (
          <>
          <div className="tabs" role="tablist" aria-label="Sign in or create account">
            <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} role="tab" aria-selected={mode === 'login'}>{t('auth.signinBtn')}</button>
            <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')} role="tab" aria-selected={mode === 'register'}>Create account</button>
          </div>
          {err && <div className="form-err" role="alert">{err}</div>}
          <form onSubmit={submit}>
            {mode === 'login' ? (
              <>
                <Field label={t('auth.identifier')} hint="Patients can sign in with their 10-digit mobile number.">
                  <input className="input" value={f.identifier} onChange={set('identifier')} required autoComplete="username" placeholder="you@example.com or 9876543210" />
                </Field>
                <Field label={t('auth.password')}>
                  <input className="input" type="password" value={f.password} onChange={set('password')} required autoComplete="current-password" />
                </Field>
                <p style={{ textAlign: 'right', margin: '-6px 0 14px' }}>
                  <button type="button" className="linklike" onClick={() => { setMode('forgot'); setErr(''); }}>
                    {t('auth.forgot')}
                  </button>
                </p>
              </>
            ) : (
              <>
                <Field label={t('auth.name')}><input className="input" value={f.name} onChange={set('name')} required autoComplete="name" /></Field>
                <Field label="Email"><input className="input" type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></Field>
                <Field label="Mobile (optional)" hint="10-digit Indian mobile — lets patients sign in without email.">
                  <input className="input" value={f.mobile} onChange={set('mobile')} inputMode="numeric" placeholder="9876543210" />
                </Field>
                <Field label="I am a…">
                  <select className="select" value={f.role} onChange={set('role')}>
                    <option value="patient">Patient</option>
                    <option value="doctor">Doctor</option>
                    <option value="receptionist">Receptionist</option>
                  </select>
                </Field>
                {f.role === 'doctor' && (
                  <>
                    <Field label="Specialization"><input className="input" value={f.specialization} onChange={set('specialization')} required placeholder="e.g. Cardiologist" /></Field>
                    <Field label="Hospital / clinic"><input className="input" value={f.hospital} onChange={set('hospital')} /></Field>
                  </>
                )}
                {f.role === 'receptionist' && (
                  <Field label="Doctor ID (optional)" hint="Your desk's default doctor (e.g. DR-8F3K2A). You can still book with any doctor.">
                    <input className="input" value={f.doctor_id_public} onChange={set('doctor_id_public')} placeholder="DR-XXXXXX" />
                  </Field>
                )}
                <Field label={t('auth.password')} hint="At least 8 characters."><input className="input" type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" /></Field>
              </>
            )}
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          </>
          )}
          <p className="small" style={{ marginTop: 16, textAlign: 'center' }}>
            <Link to="/">← Back to home</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
