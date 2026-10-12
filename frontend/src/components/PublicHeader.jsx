import { Link } from 'react-router-dom';
import { HOME, useAuth } from '../auth/AuthContext';
import { LangSwitch, useLang } from '../i18n';

/* Shared header for the public pages (Landing, How It Works).
   Auth-aware: a signed-in user sees "Open app" — never a "Sign in"
   button that makes it look like they were logged out. */
export default function PublicHeader() {
  const { user } = useAuth();
  const { t } = useLang();
  return (
    <header className="topbar">
      <Link to="/" className="brand" style={{ color: 'var(--ink)', padding: 0, textDecoration: 'none' }}>
        <span className="mark">R</span>RAGnosis
      </Link>
      <div className="row">
        <LangSwitch />
        <Link className="btn ghost small" to="/how-it-works">{t('pub.how')}</Link>
        {user
          ? <Link className="btn small" to={HOME[user.role] || '/'}>{t('pub.openapp')}</Link>
          : <Link className="btn small" to="/login">{t('pub.signin')}</Link>}
      </div>
    </header>
  );
}
