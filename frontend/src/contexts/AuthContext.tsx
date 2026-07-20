import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';

interface AuthContextValue {
  token: string | null;
  user: { name: string; email: string; role: string } | null;
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
    if (!launchCode) {
      setLoading(false);
      return;
    }
    window.history.replaceState({}, '', window.location.pathname);
    api.post('/auth/bitrix/exchange', { code: launchCode })
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
  }

  const value = useMemo(() => ({ token, user, loading, error, logout }), [token, user, loading, error]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
