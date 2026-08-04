import { lazy, Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, History, Plus, Search, ShieldCheck, Trash2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, apiErrorMessage } from '../services/api';

type UserRole = 'ADMIN' | 'RH' | 'TI';
type AccessLevel = 'ADMIN' | 'OPERATOR' | 'VIEWER';
type PickerMode = 'access' | 'notification';

interface WorkflowUser {
  bitrixUserId: number;
  name: string;
  active: boolean;
  hasAccess: boolean;
  role: UserRole;
  canOperate: boolean;
  receiveNotifications: boolean;
}

const TemplatesTab = lazy(() => import('./Templates').then((module) => ({ default: module.Templates })));
const LogsTab = lazy(() => import('./Logs').then((module) => ({ default: module.Logs })));

const settingsTabs = [
  { id: 'access', label: 'Acessos', icon: ShieldCheck },
  { id: 'templates', label: 'Modelo do termo', icon: FileText },
  { id: 'activity', label: 'Logs', icon: History }
];

export function Settings() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || 'access';
  const activeTab = settingsTabs.some((item) => item.id === requestedTab) ? requestedTab : 'access';

  if (user?.role !== 'ADMIN') {
    return <section><h1 className="mb-3 text-2xl font-bold text-ink">Configurações</h1><p className="text-steel">Somente administradores podem alterar estas configurações.</p></section>;
  }

  return (
    <section className="mx-auto w-full min-w-0 max-w-[calc(100vw-24px)] sm:max-w-5xl">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-ink">Configurações</h1>
        <p className="mt-1 text-sm text-steel">Acessos, documento e registros do FortaDocs.</p>
      </header>
      <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-b24-border" aria-label="Seções das configurações">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSearchParams(tab.id === 'access' ? {} : { tab: tab.id })}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`focus-ring flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
              activeTab === tab.id
                ? 'border-b24-blue text-b24-blue-dark'
                : 'border-transparent text-steel hover:text-ink'
            }`}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </nav>
      <Suspense fallback={<div className="h-64 animate-pulse rounded border border-b24-border bg-surface" />}>
        {activeTab === 'access' && <AccessSettings />}
        {activeTab === 'templates' && <TemplatesTab embedded />}
        {activeTab === 'activity' && <LogsTab embedded />}
      </Suspense>
    </section>
  );
}

function AccessSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [assignments, setAssignments] = useState<WorkflowUser[]>([]);
  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [message, setMessage] = useState('');
  const workflowQuery = useQuery({
    queryKey: ['term-workflow'],
    queryFn: async () => (await api.get<WorkflowUser[]>('/term-workflow')).data
  });

  useEffect(() => {
    if (workflowQuery.data) setAssignments(workflowQuery.data);
  }, [workflowQuery.data]);

  const save = useMutation({
    mutationFn: (next: WorkflowUser[]) => api.put<WorkflowUser[]>('/term-workflow', {
      assignments: next.map(({ bitrixUserId, hasAccess, role, canOperate, receiveNotifications }) => ({
        bitrixUserId, hasAccess, role, canOperate, receiveNotifications
      }))
    }),
    onMutate: (next) => {
      const previous = assignments;
      setAssignments(next);
      setMessage('');
      return { previous };
    },
    onSuccess: ({ data }) => {
      setAssignments(data);
      queryClient.setQueryData(['term-workflow'], data);
      setMessage('Alteração salva.');
    },
    onError: (error, _next, context) => {
      if (context?.previous) setAssignments(context.previous);
      setMessage(apiErrorMessage(error, 'Não foi possível salvar a alteração.'));
    }
  });

  const accessMembers = assignments.filter((item) => item.hasAccess);
  const notificationMembers = assignments.filter((item) => item.receiveNotifications);
  const operatorCount = accessMembers.filter((item) => item.canOperate).length;

  function persist(next: WorkflowUser[]) {
    if (!save.isPending) save.mutate(next);
  }

  function updateMember(bitrixUserId: number, patch: Partial<WorkflowUser>) {
    persist(assignments.map((item) => item.bitrixUserId === bitrixUserId ? { ...item, ...patch } : item));
  }

  function changeLevel(item: WorkflowUser, level: AccessLevel) {
    const patch = level === 'ADMIN'
      ? { role: 'ADMIN' as const, hasAccess: true, canOperate: true }
      : level === 'OPERATOR'
        ? { role: 'TI' as const, hasAccess: true, canOperate: true }
        : { role: 'RH' as const, hasAccess: true, canOperate: false };
    updateMember(item.bitrixUserId, patch);
  }

  function removeAccess(item: WorkflowUser) {
    if (item.canOperate && operatorCount <= 1) return;
    const next = item.receiveNotifications
      ? assignments.map((entry) => entry.bitrixUserId === item.bitrixUserId
        ? { ...entry, hasAccess: false, canOperate: false, role: 'RH' as const }
        : entry)
      : assignments.filter((entry) => entry.bitrixUserId !== item.bitrixUserId);
    persist(next);
  }

  function removeNotification(item: WorkflowUser) {
    const next = item.hasAccess
      ? assignments.map((entry) => entry.bitrixUserId === item.bitrixUserId
        ? { ...entry, receiveNotifications: false }
        : entry)
      : assignments.filter((entry) => entry.bitrixUserId !== item.bitrixUserId);
    persist(next);
  }

  function addCandidate(candidate: WorkflowUser) {
    const existing = assignments.find((item) => item.bitrixUserId === candidate.bitrixUserId);
    const next = existing
      ? assignments.map((item) => item.bitrixUserId !== candidate.bitrixUserId
        ? item
        : pickerMode === 'access'
          ? { ...item, hasAccess: true, canOperate: true, role: 'TI' as const }
          : { ...item, receiveNotifications: true })
      : [...assignments, {
          ...candidate,
          hasAccess: pickerMode === 'access',
          canOperate: pickerMode === 'access',
          role: pickerMode === 'access' ? 'TI' as const : 'RH' as const,
          receiveNotifications: pickerMode === 'notification'
        }];
    setPickerMode(null);
    persist(next);
  }

  if (workflowQuery.isLoading) return <AccessSkeleton />;
  if (workflowQuery.isError) {
    return (
      <div className="rounded border border-red-200 bg-red-50 px-4 py-4">
        <p className="text-sm font-medium text-red-800">Não foi possível carregar os acessos.</p>
        <button
          type="button"
          onClick={() => workflowQuery.refetch()}
          className="focus-ring mt-3 rounded bg-white px-3 py-2 text-sm font-semibold text-red-800 shadow-sm hover:bg-red-100"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <SettingsSection
        title="Pessoas com acesso"
        description="Somente estas pessoas podem abrir e administrar o FortaDocs."
        action={<AddButton disabled={save.isPending} onClick={() => setPickerMode('access')}>Adicionar pessoa</AddButton>}
      >
        <div className="divide-y divide-b24-border">
          {accessMembers.map((item) => {
            const current = String(user?.bitrixUserId || '') === String(item.bitrixUserId);
            const level = accessLevel(item);
            const lastOperator = item.canOperate && operatorCount <= 1;
            return (
              <div key={item.bitrixUserId} className="relative w-full min-w-0 px-4 py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_128px_36px] sm:items-center sm:gap-2 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                </div>
                <select
                  aria-label={`Nível de acesso de ${item.name}`}
                  value={level}
                  disabled={save.isPending || current}
                  onChange={(event) => changeLevel(item, event.target.value as AccessLevel)}
                  className="focus-ring ml-11 mt-2 w-[calc(100%-44px)] min-w-0 rounded border border-b24-border bg-surface px-2 py-2 text-sm text-ink disabled:bg-zinc-100 sm:ml-0 sm:mt-0 sm:w-full sm:px-2.5"
                >
                  <option value="ADMIN">Administrador</option>
                  <option value="OPERATOR">Operador</option>
                  <option value="VIEWER" disabled={lastOperator}>Somente consulta</option>
                </select>
                <button
                  type="button"
                  title={current ? 'Seu acesso não pode ser removido' : lastOperator ? 'Mantenha ao menos um operador' : 'Remover acesso'}
                  aria-label={`Remover acesso de ${item.name}`}
                  disabled={save.isPending || current || lastOperator}
                  onClick={() => removeAccess(item)}
                  className="focus-ring absolute bottom-3 left-4 grid h-9 w-9 place-items-center rounded text-steel hover:bg-red-50 hover:text-coral disabled:opacity-30 sm:static"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
          {!accessMembers.length && <EmptyState>Nenhuma pessoa com acesso.</EmptyState>}
        </div>
      </SettingsSection>

      <SettingsSection
        title="Notificações padrão"
        description="Sugestão inicial de pessoas notificadas em cada novo termo."
        action={<AddButton disabled={save.isPending} onClick={() => setPickerMode('notification')}>Adicionar pessoa</AddButton>}
      >
        <div className="divide-y divide-b24-border">
          {notificationMembers.map((item) => (
            <div key={item.bitrixUserId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
              </div>
              <button
                type="button"
                title="Remover das notificações"
                aria-label={`Remover ${item.name} das notificações`}
                disabled={save.isPending}
                onClick={() => removeNotification(item)}
                className="focus-ring grid h-9 w-9 place-items-center rounded text-steel hover:bg-zinc-100 hover:text-ink disabled:opacity-30"
              >
                <X size={16} />
              </button>
            </div>
          ))}
          {!notificationMembers.length && <EmptyState>Nenhuma notificação padrão.</EmptyState>}
        </div>
      </SettingsSection>

      {message && <p role="status" className={`text-sm ${save.isError ? 'text-coral' : 'text-emerald-700'}`}>{message}</p>}
      {pickerMode && (
        <PeoplePicker
          mode={pickerMode}
          assignedIds={new Set(assignments.filter((item) =>
            pickerMode === 'access' ? item.hasAccess : item.receiveNotifications
          ).map((item) => item.bitrixUserId))}
          onSelect={addCandidate}
          onClose={() => setPickerMode(null)}
        />
      )}
    </div>
  );
}

function PeoplePicker({ mode, assignedIds, onSelect, onClose }: {
  mode: PickerMode;
  assignedIds: Set<number>;
  onSelect: (candidate: WorkflowUser) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const candidatesQuery = useQuery({
    queryKey: ['term-workflow-candidates', debouncedSearch],
    queryFn: async () => (await api.get<WorkflowUser[]>('/term-workflow/candidates', {
      params: { search: debouncedSearch || undefined }
    })).data
  });
  const candidates = (candidatesQuery.data || []).filter((item) => !assignedIds.has(item.bitrixUserId));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="Adicionar pessoa">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-b24-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-b24-border px-4 py-3">
          <div>
            <h2 className="font-semibold text-ink">Adicionar pessoa</h2>
            <p className="text-xs text-steel">{mode === 'access' ? 'Conceder acesso ao FortaDocs' : 'Adicionar às notificações padrão'}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="focus-ring grid h-8 w-8 place-items-center rounded text-steel hover:bg-zinc-100"><X size={17} /></button>
        </div>
        <div className="p-4">
          <label className="flex items-center gap-2 rounded border border-b24-border px-3 py-2.5">
            <Search size={17} className="text-steel" />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail ou departamento" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
          </label>
        </div>
        <div className="max-h-80 divide-y divide-b24-border overflow-y-auto border-t border-b24-border">
          {candidatesQuery.isLoading ? <p className="px-4 py-8 text-center text-sm text-steel">Buscando pessoas...</p> : candidates.map((candidate) => (
            <button key={candidate.bitrixUserId} type="button" onClick={() => onSelect(candidate)} className="focus-ring flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sky-50">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{candidate.name}</span>
              </span>
              <Plus size={17} className="text-b24-blue-dark" />
            </button>
          ))}
          {!candidatesQuery.isLoading && !candidates.length && <p className="px-4 py-8 text-center text-sm text-steel">Nenhuma pessoa encontrada.</p>}
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, description, action, children }: {
  title: string;
  description: string;
  action: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="w-full min-w-0 overflow-hidden rounded border border-b24-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-b24-border px-4 py-3.5 sm:px-5">
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-steel">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function AddButton({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="focus-ring inline-flex items-center gap-2 rounded bg-b24-blue px-3 py-2 text-sm font-semibold text-white hover:bg-b24-blue-dark disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} />{children}</button>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-7 text-center text-sm text-steel">{children}</p>;
}

function accessLevel(item: WorkflowUser): AccessLevel {
  if (item.role === 'ADMIN') return 'ADMIN';
  return item.canOperate ? 'OPERATOR' : 'VIEWER';
}

function AccessSkeleton() {
  return <div className="space-y-5">{Array.from({ length: 2 }).map((_, index) => <div key={index} className="h-48 animate-pulse rounded border border-b24-border bg-surface" />)}</div>;
}
