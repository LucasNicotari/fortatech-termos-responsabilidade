import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { api, apiErrorMessage } from '../services/api';

interface AuthContextValue {
  token: string | null;
  accessMode: 'ADMIN' | 'SIGNER' | null;
  user: {
    id?: string;
    name: string;
    email: string;
    role: string;
    bitrixUserId?: string;
    canOperate: boolean;
  } | null;
  loading: boolean;
  error: string | null;
  logout: () => void;
  reconnect: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('fortatech.token'));
  const [accessMode, setAccessMode] = useState<AuthContextValue['accessMode']>(
    () => sessionStorage.getItem('fortatech.accessMode') as AuthContextValue['accessMode']
  );
  const [user, setUser] = useState<AuthContextValue['user']>(() => {
    const stored = sessionStorage.getItem('fortatech.user');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      sessionStorage.removeItem('fortatech.user');
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const launchCode = new URLSearchParams(window.location.search).get('launchCode');
    const localMode = import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true';
    const storedToken = sessionStorage.getItem('fortatech.token');
    const storedMode = sessionStorage.getItem('fortatech.accessMode') as AuthContextValue['accessMode'];

    if (!launchCode && !localMode && storedToken && storedMode === 'ADMIN') {
      api.get<AuthContextValue['user']>('/auth/me')
        .then(({ data }) => {
          sessionStorage.setItem('fortatech.user', JSON.stringify(data));
          setUser(data);
          setError(null);
        })
        .catch((requestError) => {
          clearSession();
          setError(apiErrorMessage(requestError, 'Sua sessao expirou. Reconecte pelo Bitrix24.'));
        })
        .finally(() => setLoading(false));
      return;
    }

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
        sessionStorage.setItem('fortatech.accessMode', data.accessMode || 'ADMIN');
        sessionStorage.setItem('fortatech.user', JSON.stringify(data.user));
        setToken(data.accessToken);
        setAccessMode(data.accessMode || 'ADMIN');
        setUser(data.user);
        setError(null);
      })
      .catch((requestError) => {
        clearSession();
        setError(apiErrorMessage(requestError, 'Nao foi possivel iniciar pelo Bitrix24'));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const unauthorized = () => {
      clearSession();
      setError('Sua sessao expirou. Reconecte pelo Bitrix24.');
      setLoading(false);
    };
    window.addEventListener('fortadocs:unauthorized', unauthorized);
    return () => window.removeEventListener('fortadocs:unauthorized', unauthorized);
  }, []);

  function clearSession() {
    sessionStorage.removeItem('fortatech.token');
    sessionStorage.removeItem('fortatech.accessMode');
    sessionStorage.removeItem('fortatech.user');
    setToken(null);
    setAccessMode(null);
    setUser(null);
  }

  function logout() {
    clearSession();
    if (import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true') window.location.reload();
  }

  function reconnect() {
    clearSession();
    const baseUrl = String(api.defaults.baseURL || '').replace(/\/$/, '');
    window.location.assign(`${baseUrl}/integrations/bitrix/launch`);
  }

  const value = useMemo(
    () => ({ token, accessMode, user, loading, error, logout, reconnect }),
    [token, accessMode, user, loading, error]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return context;
}
