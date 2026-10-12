import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { HOME, useAuth } from './AuthContext';

export default function ProtectedRoute({ roles }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="center"><div className="spinner" role="status" aria-label="Loading" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME[user.role] || '/'} replace />;
  return <Outlet />;
}
