import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { ReactNode, UIEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, FilePenLine, FileText, History, Save, Search, Settings2, ShieldCheck, UserCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { UserAvatar } from '../components/UserAvatar';

type UserRole = 'ADMIN' | 'RH' | 'TI';

interface WorkflowUser {
  bitrixUserId: number;
  name: string;
  email: string;
  workPosition: string;
  departmentName: string;
  photoUrl?: string;
  active: boolean;
  hasAccess: boolean;
  role: UserRole;
  canOperate: boolean;
  receiveNotifications: boolean;
}

const TemplatesTab = lazy(() => import('./Templates').then((module) => ({ default: module.Templates })));
const LogsTab = lazy(() => import('./Logs').then((module) => ({ default: module.Logs })));

const settingsTabs = [
  { id: 'access', label: 'Usuários e acessos', icon: Settings2 },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'activity', label: 'Atividades', icon: History }
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
    <section className="mx-auto max-w-[1600px]">
      <header className="mb-5"><h1 className="text-2xl font-bold tracking-tight text-ink">Configurações</h1><p className="mt-1 text-sm text-steel">Centralize usuários, documentos e auditoria do FortaDocs.</p></header>
      <nav className="mb-5 flex gap-1 overflow-x-auto rounded border border-b24-border bg-white p-1.5" aria-label="Seções das configurações">
        {settingsTabs.map((tab) => (
          <button key={tab.id} onClick={() => setSearchParams(tab.id === 'access' ? {} : { tab: tab.id })} aria-current={activeTab === tab.id ? 'page' : undefined} className={`focus-ring flex shrink-0 items-center gap-2 rounded px-3 py-2 text-sm font-medium transition ${activeTab === tab.id ? 'bg-sky-50 text-b24-blue-dark' : 'text-steel hover:bg-b24-bg hover:text-ink'}`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </nav>
      <Suspense fallback={<div className="h-64 animate-pulse rounded border border-b24-border bg-white" />}>
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
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(10);
  const workflowQuery = useQuery({
    queryKey: ['term-workflow'],
    queryFn: async () => (await api.get<WorkflowUser[]>('/term-workflow')).data
  });

  useEffect(() => { if (workflowQuery.data) setAssignments(workflowQuery.data); }, [workflowQuery.data]);
  const filteredAssignments = useMemo(() => {
    const normalized = normalizeSearch(search);
    const active = assignments.filter((item) => item.active);
    return normalized
      ? active.filter((item) => normalizeSearch(`${item.name} ${item.email} ${item.workPosition} ${item.departmentName} ${item.bitrixUserId}`).includes(normalized))
      : active;
  }, [assignments, search]);
  const visibleAssignments = filteredAssignments.slice(0, visibleCount);
  useEffect(() => { setVisibleCount(10); }, [search, assignments.length]);

  const save = useMutation({
    mutationFn: () => api.put<WorkflowUser[]>('/term-workflow', {
      assignments: assignments.map(({ bitrixUserId, hasAccess, role, canOperate, receiveNotifications }) => ({ bitrixUserId, hasAccess, role, canOperate, receiveNotifications }))
    }),
    onSuccess: ({ data }) => {
      setAssignments(data);
      queryClient.setQueryData(['term-workflow'], data);
    }
  });

  function patchUser(bitrixUserId: number, patch: Partial<WorkflowUser>) {
    setAssignments((items) => items.map((item) => item.bitrixUserId === bitrixUserId ? { ...item, ...patch } : item));
    save.reset();
  }

  function toggleAccess(item: WorkflowUser) {
    const hasAccess = !item.hasAccess;
    patchUser(item.bitrixUserId, { hasAccess, canOperate: hasAccess ? item.canOperate : false });
  }

  function toggleOperate(item: WorkflowUser) {
    const canOperate = !item.canOperate;
    patchUser(item.bitrixUserId, { canOperate, hasAccess: canOperate ? true : item.hasAccess });
  }

  function loadNextPage(event: UIEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 48) {
      setVisibleCount((current) => Math.min(current + 10, filteredAssignments.length));
    }
  }

  return (
    <div className="grid gap-4">
      <section className="flex items-center gap-3 rounded border border-b24-border bg-white px-4 py-3.5 sm:px-5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><ShieldCheck size={17} /></span>
        <div className="min-w-0">
          <h2 className="font-semibold text-ink">Assinatura interna FortaDocs</h2>
          <p className="text-xs text-steel">O colaborador recebe o link pessoal no chat e assina dentro do Bitrix24. Não existe assinatura obrigatória do representante.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded border border-b24-border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-b24-border px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-50 text-b24-blue-dark"><UserCheck size={17} /></span><div className="min-w-0"><h2 className="font-semibold text-ink">Usuários do Bitrix24</h2><p className="truncate text-xs text-steel">Controle acesso, perfil, operação e a seleção inicial de notificações.</p></div></div>
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-b24-border px-3 py-2 sm:max-w-80"><Search size={16} className="shrink-0 text-steel" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, cargo, setor ou ID" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
        </div>

        <div className="hidden grid-cols-[minmax(200px,1fr)_110px_110px_115px_130px] items-stretch gap-2 border-b border-b24-border bg-b24-bg/60 px-5 py-2 text-xs font-semibold text-steel lg:grid">
          <span className="flex min-h-10 items-center">Usuário</span>
          <ColumnTitle>Acessar o FortaDocs</ColumnTitle>
          <ColumnTitle>Perfil e Setor</ColumnTitle>
          <ColumnTitle>Gerenciar Termos</ColumnTitle>
          <ColumnTitle>Notificações padrão</ColumnTitle>
        </div>
        <div onScroll={loadNextPage} className="max-h-[480px] divide-y divide-b24-border/80 overflow-y-auto">
          {workflowQuery.isLoading ? <AccessSkeleton /> : visibleAssignments.map((item) => {
            const isCurrentUser = String(user?.bitrixUserId || '') === String(item.bitrixUserId);
            return (
              <div key={item.bitrixUserId} className="grid gap-3 px-4 py-3 transition hover:bg-sky-50/40 lg:grid-cols-[minmax(200px,1fr)_110px_110px_115px_130px] lg:items-center lg:gap-2 lg:px-5">
                <div className="flex min-w-0 items-center gap-3"><UserAvatar name={item.name} photoUrl={item.photoUrl} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{item.name}</p><p className="truncate text-xs text-steel">{item.workPosition || 'Cargo não informado'}{item.departmentName ? ` · ${item.departmentName}` : ''}</p><p className="truncate text-[11px] text-zinc-400">{item.email || 'Sem e-mail'} · ID {item.bitrixUserId}</p></div></div>
                <CheckField label="Acessar o FortaDocs" checked={item.hasAccess} disabled={isCurrentUser} onChange={() => toggleAccess(item)} />
                <label className="flex items-center justify-between gap-2 text-xs text-steel lg:justify-center"><span className="lg:hidden">Perfil e Setor</span><select value={item.role} disabled={!item.hasAccess || isCurrentUser} onChange={(event) => patchUser(item.bitrixUserId, { role: event.target.value as UserRole })} className="focus-ring w-24 rounded border border-b24-border bg-white px-2 py-1.5 text-xs text-ink disabled:bg-zinc-100 disabled:text-zinc-400"><option value="RH">RH</option><option value="TI">TI</option><option value="ADMIN">Admin</option></select></label>
                <CheckField icon={<FilePenLine size={15} />} label="Gerenciar Termos" checked={item.canOperate} onChange={() => toggleOperate(item)} />
                <CheckField icon={<Bell size={15} />} label="Notificações padrão" checked={item.receiveNotifications} onChange={() => patchUser(item.bitrixUserId, { receiveNotifications: !item.receiveNotifications })} />
              </div>
            );
          })}
          {!workflowQuery.isLoading && visibleAssignments.length === 0 && <p className="px-5 py-10 text-center text-sm text-steel">Nenhum usuário encontrado.</p>}
          {visibleAssignments.length < filteredAssignments.length && <p className="px-3 py-2 text-center text-xs text-zinc-400">Role para carregar mais 10</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-b24-border bg-b24-bg/40 px-4 py-3 sm:px-5">
          <button disabled={save.isPending || !assignments.some((item) => item.canOperate)} onClick={() => save.mutate()} className="focus-ring inline-flex items-center gap-2 rounded bg-b24-blue px-4 py-2 text-sm font-semibold text-white hover:bg-b24-blue-dark disabled:opacity-50"><Save size={16} /> {save.isPending ? 'Salvando...' : 'Salvar alterações'}</button>
          <span className="text-xs text-steel">{filteredAssignments.length} usuários ativos</span>
          {save.isSuccess && <p role="status" className="text-sm font-medium text-emerald-700">Configurações atualizadas.</p>}
          {save.isError && <p role="alert" className="text-sm font-medium text-coral">Não foi possível salvar as configurações.</p>}
        </div>
      </section>
    </div>
  );
}

function ColumnTitle({ children }: { children: ReactNode }) {
  return <span className="flex min-h-10 items-center justify-center px-1 text-center leading-4">{children}</span>;
}

function CheckField({ icon, label, checked, disabled = false, onChange }: { icon?: ReactNode; label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-steel lg:justify-center"><span className="flex items-center gap-1.5 lg:hidden">{icon}{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="h-4 w-4 accent-b24-blue disabled:opacity-50" /></label>;
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function AccessSkeleton() {
  return <>{Array.from({ length: 6 }).map((_, index) => <div key={index} className="flex h-[68px] animate-pulse items-center gap-3 px-5"><span className="h-10 w-10 rounded-full bg-zinc-200" /><span className="h-4 w-1/4 rounded bg-zinc-200" /><span className="ml-auto h-4 w-1/4 rounded bg-zinc-100" /></div>)}</>;
}
