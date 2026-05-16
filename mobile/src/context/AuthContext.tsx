import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as api from '../api/client';
import type { User } from '../api/types';

type SignUpPayload = {
  username: string;
  email: string;
  password: string;
  full_name?: string | null;
};

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Avoid hanging forever on unreachable API (wrong host/port, captive Wi‑Fi, etc.). */
const AUTH_BOOTSTRAP_MS = 12_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tid = setTimeout(
      () => reject(new Error('auth-bootstrap-timeout')),
      ms
    );
    promise
      .then((v) => {
        clearTimeout(tid);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(tid);
        reject(e);
      });
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = await api.getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    const me = await withTimeout(api.fetchMe(token), AUTH_BOOTSTRAP_MS);
    setUser(me);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshUser();
      } catch {
        await api.setStoredToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshUser]);

  const signIn = useCallback(async (username: string, password: string) => {
    const data = await api.login(username, password);
    await api.setStoredToken(data.access_token);
    setUser(data.user);
  }, []);

  const signUp = useCallback(async (payload: SignUpPayload) => {
    const data = await api.register(payload);
    await api.setStoredToken(data.access_token);
    setUser(data.user);
  }, []);

  const signOut = useCallback(async () => {
    await api.setStoredToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      signIn,
      signUp,
      signOut,
      refreshUser,
    }),
    [user, loading, signIn, signUp, signOut, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
