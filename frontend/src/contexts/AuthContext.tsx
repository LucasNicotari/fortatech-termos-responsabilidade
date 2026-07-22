import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

interface AuthContextValue {
  token: string | null;
  user: { id?: string; name: string; email: string; role: string; bitrixUserId?: string } | null;
  loading: boolean;
  error: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('fortatech.token'));
  const [user, setUser] = useState<AuthContextValue['user']>(() => {
    const stored = sessionStorage.getItem('fortatech.user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const launchCode = new URLSearchParams(window.location.search).get('launchCode');
    const localMode = import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true';
    if (!launchCode && !localMode) {
      setLoading(false);
      return;
    }
    if (launchCode) window.history.replaceState({}, '', window.location.pathname);
    const request = launchCode
      ? api.post('/auth/bitrix/exchange', { code: launchCode })
      : api.post('/auth/local');
    request
      .then(({ data }) => {
        sessionStorage.setItem('fortatech.token', data.accessToken);
        sessionStorage.setItem('fortatech.user', JSON.stringify(data.user));
        setToken(data.accessToken);
        setUser(data.user);
      })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Nao foi possivel iniciar pelo Bitrix24'))
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    sessionStorage.removeItem('fortatech.token');
    sessionStorage.removeItem('fortatech.user');
    setToken(null);
    setUser(null);
    if (import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true') window.location.reload();
  }

  const value = useMemo(() => ({ token, user, loading, error, logout }), [token, user, loading, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
