import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageShell } from './components/PageShell';
import { useAuth } from './contexts/AuthContext';

const Dashboard = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.Dashboard })));
const Employees = lazy(() => import('./pages/Employees').then((module) => ({ default: module.Employees })));
const Logs = lazy(() => import('./pages/Logs').then((module) => ({ default: module.Logs })));
const Settings = lazy(() => import('./pages/Settings').then((module) => ({ default: module.Settings })));
const SendRequests = lazy(() => import('./pages/SendRequests').then((module) => ({ default: module.SendRequests })));
const Signatures = lazy(() => import('./pages/Signatures').then((module) => ({ default: module.Signatures })));
const Templates = lazy(() => import('./pages/Templates').then((module) => ({ default: module.Templates })));

function Protected() {
  const { token, loading, error } = useAuth();
  if (loading) return <main className="p-8 text-steel">Conectando ao Bitrix24...</main>;
  if (!token) return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-3 text-2xl font-bold text-ink">Abra pelo Bitrix24</h1>
      <p className="text-steel">{error || 'Este aplicativo usa a identidade do Bitrix24 e precisa ser aberto pelo menu do portal.'}</p>
    </main>
  );
  return <PageShell />;
}

export function App() {
  return (
    <Suspense fallback={<main className="p-8 text-steel">Carregando...</main>}>
      <Routes>
        <Route element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/send-requests" element={<SendRequests />} />
          <Route path="/signatures" element={<Signatures />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
