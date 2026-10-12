import { useEffect, useState } from 'react';

export const fmtDate = (iso) => iso
  ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';
export const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/* Inline SVG icon set (Lucide-style, stroke). No emoji icons. */
const PATHS = {
  file: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>),
  chat: (<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />),
  pill: (<><path d="M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7z" /><path d="M7 10.5l7 7" /></>),
  bell: (<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  users: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  user: (<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  plus: (<><path d="M12 5v14M5 12h14" /></>),
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></>),
  x: (<path d="M18 6 6 18M6 6l12 12" />),
  menu: (<><path d="M3 6h18M3 12h18M3 18h18" /></>),
  check: (<path d="M20 6 9 17l-5-5" />),
  alert: (<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>),
  info: (<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>),
  arrow: (<><path d="M5 12h14M13 6l6 6-6 6" /></>),
  clock: (<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" /></>),
  heart: (<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z" />),
  spark: (<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1" />),
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>),
  code: (<path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />),
  server: (<><rect x="2" y="3" width="20" height="7" rx="2" /><rect x="2" y="14" width="20" height="7" rx="2" /><path d="M6 6.5h.01M6 17.5h.01" /></>),
  database: (<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></>),
  cpu: (<><rect x="5" y="5" width="14" height="14" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>),
};

export function Icon({ name, size = 20, className = '' }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name] || null}
    </svg>
  );
}

const STATUS_CLASS = { Low: 'low', Normal: 'normal', High: 'high', Unknown: 'unknown' };
export function Pill({ status, critical }) {
  if (critical) return <span className="pill critical"><span className="dot" />Critical</span>;
  return <span className={`pill ${STATUS_CLASS[status] || 'unknown'}`}><span className="dot" />{status || 'Unknown'}</span>;
}

export function BandPill({ band }) {
  const cls = band === 'Excellent' ? 'normal' : band === 'Good' ? 'info' : band === 'Fair' ? 'low' : 'high';
  return <span className={`pill ${cls}`}>{band}</span>;
}

const BAND_COLOR = { Excellent: '#059669', Good: '#0891B2', Fair: '#B45309', 'Needs Improvement': '#C2410C' };
export function ScoreRing({ score, band, size = 120 }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const color = BAND_COLOR[band] || '#059669';
  return (
    <div className="ringwrap">
      <svg className="ring" width={size} height={size} role="img" aria-label={`Health score ${Math.round(score)} of 100, ${band}`}>
        <circle className="bgc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="10" />
        <circle className="fgc" cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth="10"
          strokeDasharray={c} strokeDashoffset={c - (c * Math.max(0, Math.min(100, score)) / 100)} />
      </svg>
      <div>
        <div className="ringval num">{Math.round(score)}<span style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 600 }}>/100</span></div>
        <div className="band" style={{ color }}>{band}</div>
      </div>
    </div>
  );
}

export function Disclaimer({ children }) {
  return (
    <div className="disclaimer" role="note">
      <strong>Educational information only — not a diagnosis.</strong>{' '}
      {children || 'This analysis explains your report in plain language. It cannot diagnose conditions. Always consult a qualified doctor for medical decisions.'}
    </div>
  );
}

export function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Empty({ icon = 'file', title, body, action }) {
  return (
    <div className="card"><div className="empty">
      <Icon name={icon} size={40} />
      <h3>{title}</h3><p>{body}</p>{action}
    </div></div>
  );
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Close dialog"><Icon name="x" size={16} /></button></div>
        {children}
      </div>
    </div>
  );
}

// Minimal toast bus — no dependency.
let push = () => {};
export const toast = (msg, kind = 'info') => push({ msg, kind, id: Math.random().toString(36).slice(2) });
export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    push = (t) => {
      setItems((s) => [...s, t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 3800);
    };
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast ${t.kind === 'err' ? 'err' : ''}`}>{t.msg}</div>)}
    </div>
  );
}
