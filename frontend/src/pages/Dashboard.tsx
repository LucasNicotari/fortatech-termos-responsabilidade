import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, FilePlus2, RefreshCw, Send, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { DashboardSummary } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../utils/format';

export function Dashboard() {
  const { data, isLoading, isError, isFetching, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard/summary')).data
  });
  const updatedAt = dataUpdatedAt
    ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(dataUpdatedAt)
    : '';

  if (isLoading) return <DashboardSkeleton />;
  if (isError) return <LoadError onRetry={() => refetch()} />;

  const cards = [
    { label: 'Colaboradores', value: data?.totalEmployees || 0, detail: 'com termos', icon: Users, to: '/terms', tone: 'bg-sky-50 text-b24-blue-dark' },
    { label: 'Aguardando', value: data?.pending || 0, detail: 'ações pendentes', icon: Clock3, to: '/terms', tone: 'bg-amber-50 text-amber-600' },
    { label: 'Enviados', value: data?.sent || 0, detail: 'termos enviados', icon: Send, to: '/terms', tone: 'bg-blue-50 text-blue-600' },
    { label: 'Concluídos', value: data?.signed || 0, detail: 'termos assinados', icon: CheckCircle2, to: '/terms', tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Atenção', value: data?.errors || 0, detail: data?.errors === 1 ? 'falha encontrada' : 'falhas encontradas', icon: AlertCircle, to: '/settings?tab=activity', tone: data?.errors ? 'bg-red-50 text-coral' : 'bg-zinc-100 text-steel' }
  ];

  return (
    <section className="mx-auto flex min-h-[calc(100vh-115px)] max-w-[1600px] flex-col">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-xl font-bold tracking-tight text-ink">Visão geral</h1><p className="mt-0.5 text-xs text-steel">Resumo do que exige acompanhamento agora.</p></div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-steel sm:flex"><span className="h-2 w-2 rounded-full bg-b24-green" /> {updatedAt ? `Atualizado às ${updatedAt}` : 'Dados atualizados'}</span>
          <button onClick={() => refetch()} disabled={isFetching} aria-label="Atualizar dashboard" title="Atualizar dashboard" className="focus-ring grid h-9 w-9 place-items-center rounded border border-b24-border bg-white text-steel hover:bg-sky-50 hover:text-b24-blue-dark disabled:opacity-60"><RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} /></button>
          <Link to="/send-requests" className="focus-ring inline-flex h-9 items-center gap-2 rounded bg-b24-blue px-3.5 text-sm font-semibold text-white hover:bg-b24-blue-dark"><FilePlus2 size={17} /> Novo termo</Link>
        </div>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        {cards.map((card) => (
          <Link key={card.label} to={card.to} className="group focus-ring min-w-0 rounded-lg border border-b24-border bg-white p-3 transition last:col-span-2 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-sm md:last:col-span-1">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-[11px] font-semibold uppercase tracking-wide text-steel">{card.label}</p><p className="mt-1.5 text-2xl font-bold leading-none text-ink">{card.value}</p><p className="mt-1.5 truncate text-[11px] text-steel">{card.detail}</p></div><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${card.tone}`}><card.icon size={15} /></span></div>
          </Link>
        ))}
      </div>

      <article className="flex flex-1 flex-col overflow-hidden rounded border border-b24-border bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-b24-border px-4 py-2.5"><div><h2 className="text-sm font-semibold text-ink">Termos recentes</h2><p className="mt-0.5 text-[11px] text-steel">Movimentações que merecem acompanhamento.</p></div><Link to="/terms" className="focus-ring hidden items-center gap-1.5 rounded text-xs font-semibold text-b24-blue-dark hover:underline sm:inline-flex">Abrir Termos <ArrowRight size={14} /></Link></div>
        {data?.latestSignatures.length ? (
          <div className="divide-y divide-b24-border/80">
            {data.latestSignatures.slice(0, 4).map((signature) => (
              <Link key={signature.id} to="/terms" className="group grid gap-2 px-4 py-2.5 transition hover:bg-sky-50/40 sm:grid-cols-[minmax(0,1.4fr)_140px_150px_24px] sm:items-center">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{signature.employee?.nome || 'Colaborador não identificado'}</p><p className="mt-0.5 truncate text-xs text-steel">{signature.sendRequest?.documentFileName || `Termo ${signature.providerDocumentId || signature.id.slice(0, 8)}`}</p></div>
                <div><StatusBadge status={signature.status} /></div><div className="text-xs text-steel sm:text-right">{formatDate(signature.updatedAt)}</div><ArrowRight size={17} className="hidden text-steel transition group-hover:translate-x-0.5 group-hover:text-b24-blue-dark sm:block" />
              </Link>
            ))}
          </div>
        ) : <div className="grid min-h-28 flex-1 place-items-center px-5 py-5 text-center"><div><CheckCircle2 size={24} className="mx-auto mb-2 text-b24-green" /><p className="text-sm font-medium text-ink">Nenhum termo movimentado</p><p className="mt-0.5 text-[11px] text-steel">Os documentos enviados aparecerão aqui.</p><Link to="/send-requests" className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg bg-b24-blue px-3 py-2 text-xs font-semibold text-white hover:bg-b24-blue-dark"><FilePlus2 size={14} /> Criar primeiro termo</Link></div></div>}
        <div className="border-t border-b24-border bg-b24-bg/40 px-4 py-2.5 text-right sm:hidden"><Link to="/terms" className="text-xs font-semibold text-b24-blue-dark">Abrir Termos</Link></div>
      </article>
    </section>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return <section className="grid min-h-[60vh] place-items-center"><div className="max-w-sm text-center"><span className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-full bg-red-50 text-coral"><AlertCircle size={22} /></span><h1 className="text-xl font-semibold text-ink">Não foi possível carregar o dashboard</h1><p className="mt-2 text-sm text-steel">Verifique a conexão com a API e tente novamente.</p><button onClick={onRetry} className="focus-ring mt-5 inline-flex items-center gap-2 rounded bg-b24-blue px-4 py-2 text-sm font-semibold text-white"><RefreshCw size={16} /> Tentar novamente</button></div></section>;
}

function DashboardSkeleton() {
  return <section className="mx-auto max-w-[1600px] animate-pulse" aria-label="Carregando dashboard"><div className="mb-3 h-11 w-64 max-w-full rounded bg-zinc-200" /><div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-24 rounded border border-b24-border bg-white" />)}</div><div className="h-48 rounded border border-b24-border bg-white" /></section>;
}
