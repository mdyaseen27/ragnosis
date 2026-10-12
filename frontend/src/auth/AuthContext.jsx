import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getTokens, setTokens } from '../api/client';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);
export const HOME = { patient: '/app/reports', doctor: '/doctor/today', receptionist: '/desk/book' };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (!getTokens()?.access) { setReady(true); return; }
      try {
        const { user } = await api('/auth/me');
        setUser(user);
      } catch { setTokens(null); }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (identifier, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { identifier, password } });
    setTokens(data.tokens);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api('/auth/register', { method: 'POST', body: payload });
    setTokens(data.tokens);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST', body: {} }); } catch { /* already out */ }
    setTokens(null);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, login, register, logout }}>{children}</Ctx.Provider>;
}
