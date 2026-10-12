import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Icon, ToastHost } from '../../components/ui';
import { LangSwitch, useLang } from '../../i18n';

const LINKS = [
  ['/doctor/today', 'nav.today', 'calendar'],
  ['/doctor/patients', 'nav.patients', 'users'],
];

export default function DoctorLayout() {
  const { user, logout } = useAuth();
  const { t } = useLang();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const out = async () => { await logout(); nav('/login'); };
  return (
    <div className="shell">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Primary">
        <Link to="/doctor/today" className="brand" style={{ color: '#fff' }}>
          <span className="mark">R</span>RAGnosis
        </Link>
        {LINKS.map(([to, labelKey, icon]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`} onClick={() => setOpen(false)}>
            <Icon name={icon} />{t(labelKey)}
          </NavLink>
        ))}
        <div className="who">Dr. {user?.name}<br /><button onClick={out}>{t('nav.signout')}</button>
          <div style={{ marginTop: 8 }}><LangSwitch /></div>
        </div>
      </aside>
      {open && <button className="scrim show" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <div className="main">
        <button className="menubtn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Open menu"><Icon name="menu" size={18} />{t('nav.menu')}</button>
        <Outlet />
      </div>
      <ToastHost />
    </div>
  );
}
