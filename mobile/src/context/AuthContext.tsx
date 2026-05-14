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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = await api.getStoredToken();
    if (!token) {
      setUser(null);
      return;
    }
    const me = await api.fetchMe(token);
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
