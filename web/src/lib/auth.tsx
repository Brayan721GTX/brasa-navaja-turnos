import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, loadSession, saveSession, subscribeSession, type Session } from './api';
import type { AuthUser } from './types';

interface Ctx {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const qc = useQueryClient();

  useEffect(() => subscribeSession(setSession), []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>('/auth/login', { email, password });
    saveSession({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const s = loadSession();
    saveSession(null);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] === 'admin' });
    if (s) await api.post('/auth/logout', { refreshToken: s.refreshToken }).catch(() => undefined);
  }, [qc]);

  const value = useMemo(() => ({ user: session?.user ?? null, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
};
