import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { PageShell } from './components/PageShell';
import { useAuth } from './contexts/AuthContext';

const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));
const SendRequests = lazy(() => import('./pages/SendRequests').then((module) => ({ default: module.SendRequests })));
const Signatures = lazy(() => import('./pages/Signatures').then((module) => ({ default: module.Signatures })));
const LocalSigning = lazy(() => import('./pages/LocalSigning').then((module) => ({ default: module.LocalSigning })));
const InternalSigning = lazy(() => import('./pages/InternalSigning').then((module) => ({ default: module.InternalSigning })));

function Protected() {
  const { token, accessMode, loading, error } = useAuth();
  const localMode = import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true';
  if (loading) return <main className="p-8 text-steel">{localMode ? 'Iniciando ambiente local...' : 'Conectando ao Bitrix24...'}</main>;
  if (!token || accessMode === 'SIGNER') return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-3 text-2xl font-bold text-ink">{localMode ? 'Ambiente local indisponível' : 'Abra pelo Bitrix24'}</h1>
      <p className="text-steel">{error || (localMode ? 'Não foi possível criar a sessão local.' : 'Este aplicativo usa a identidade do Bitrix24 e precisa ser aberto pelo menu do portal.')}</p>
    </main>
  );
  return <PageShell />;
}

function SignerProtected() {
  const { token, accessMode, loading, error } = useAuth();
  if (loading) return <main className="p-8 text-steel">Abrindo termo para assinatura...</main>;
  if (!token || accessMode !== 'SIGNER') {
    return <main className="grid min-h-screen place-items-center bg-b24-bg p-5"><div className="max-w-md rounded-lg border border-b24-border bg-white p-8 text-center"><h1 className="text-xl font-semibold text-ink">Abra pelo chat do Bitrix24</h1><p className="mt-2 text-sm text-steel">{error || 'Use o link pessoal recebido no chat para acessar este termo.'}</p></div></main>;
  }
  return <InternalSigning />;
}

function OperatorProtected() {
  const { user } = useAuth();
  return user?.canOperate ? <Outlet /> : <Navigate to="/" replace />;
}

export function App() {
  return (
    <Suspense fallback={<main className="p-8 text-steel">Carregando...</main>}>
      <Routes>
        <Route path="/assinar/:token" element={<LocalSigning />} />
        <Route path="/sign" element={<SignerProtected />} />
        <Route element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="/employees" element={<Navigate to="/settings" replace />} />
          <Route element={<OperatorProtected />}>
            <Route path="/send-requests" element={<SendRequests />} />
          </Route>
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
