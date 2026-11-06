import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User, Workspace } from '@/shared/types';
import { api } from './api';

type Auth = {
  loading: boolean;
  user: User | null;
  workspaces: Workspace[];
  refresh(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  signup(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** The server said 401 somewhere else (e.g. the office): forget the session locally. */
  expire(): void;
};

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me?.user ?? null);
      setWorkspaces(me?.workspaces ?? []);
    } catch {
      // ponytail: network/5xx on /me reads as signed out; the login page then shows the real error on submit
      setUser(null);
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);
  const expire = useCallback(() => { setUser(null); setWorkspaces([]); }, []);

  const value = useMemo<Auth>(() => ({
    loading, user, workspaces, refresh,
    login: async (email, password) => { await api.login({ email, password }); await refresh(); },
    signup: async (name, email, password) => { await api.signup({ name, email, password }); await refresh(); },
    logout: async () => {
      await api.logout().catch(() => {});
      setUser(null);
      setWorkspaces([]);
    },
    expire,
  }), [loading, user, workspaces, refresh, expire]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth outside <AuthProvider>');
  return a;
}
