import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageShell } from './components/PageShell';
import { useAuth } from './contexts/AuthContext';

const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));
const SendRequests = lazy(() => import('./pages/SendRequests').then((module) => ({ default: module.SendRequests })));
const Signatures = lazy(() => import('./pages/Signatures').then((module) => ({ default: module.Signatures })));
const LocalSigning = lazy(() => import('./pages/LocalSigning').then((module) => ({ default: module.LocalSigning })));

function Protected() {
  const { token, loading, error } = useAuth();
  const localMode = import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true';
  if (loading) return <main className="p-8 text-steel">{localMode ? 'Iniciando ambiente local...' : 'Conectando ao Bitrix24...'}</main>;
  if (!token) return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-3 text-2xl font-bold text-ink">{localMode ? 'Ambiente local indisponível' : 'Abra pelo Bitrix24'}</h1>
      <p className="text-steel">{error || (localMode ? 'Não foi possível criar a sessão local.' : 'Este aplicativo usa a identidade do Bitrix24 e precisa ser aberto pelo menu do portal.')}</p>
    </main>
  );
  return <PageShell />;
}

export function App() {
  return (
    <Suspense fallback={<main className="p-8 text-steel">Carregando...</main>}>
      <Routes>
        <Route path="/assinar/:token" element={<LocalSigning />} />
        <Route element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="/employees" element={<Navigate to="/settings" replace />} />
          <Route path="/send-requests" element={<SendRequests />} />
          <Route path="/terms" element={<Signatures />} />
          <Route path="/signatures" element={<Navigate to="/terms" replace />} />
          <Route path="/templates" element={<Navigate to="/settings?tab=templates" replace />} />
          <Route path="/logs" element={<Navigate to="/settings?tab=activity" replace />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
