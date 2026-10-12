import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, setTokens, setUnauthorizedHandler } from '../api/client';
import type { Tokens, User } from '../api/client';

interface AuthState {
  user: User | null;
  restoring: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    // A refresh that fails inside the API client ends the session here.
    setUnauthorizedHandler(() => setUser(null));
    (async () => {
      try {
        const d = await api<{ user: User }>('/auth/me');
        setUser(d.user);
      } catch {
        setUser(null);
      } finally {
        setRestoring(false);
      }
    })();
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const d = await api<{ user: User; tokens: Tokens }>('/auth/login', {
      method: 'POST',
      body: { identifier: identifier.trim(), password },
    });
    await setTokens(d.tokens);
    setUser(d.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
    } catch {
      // Local sign-out proceeds regardless of the server call.
    }
    await setTokens(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, restoring, login, logout }),
    [user, restoring, login, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
