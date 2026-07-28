import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronDown, History, RefreshCw } from 'lucide-react';
import { api } from '../services/api';
import { ActivityLog } from '../types';

export function Logs({ embedded = false }: { embedded?: boolean }) {
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const { data = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['activity-logs'],
    queryFn: async () => (await api.get<ActivityLog[]>('/logs/activity')).data
  });
  const filtered = useMemo(() => onlyErrors ? data.filter((item) => item.status === 'ERROR') : data, [data, onlyErrors]);
  const visible = filtered.slice(0, visibleCount);

  return (
    <section>
      {!embedded && <div className="mb-5"><h1 className="text-2xl font-bold text-ink">Atividades</h1><p className="mt-1 text-sm text-steel">Histórico simples das ações realizadas no aplicativo.</p></div>}

      <div className="overflow-hidden rounded border border-b24-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-b24-border px-4 py-3.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-50 text-b24-blue-dark"><History size={17} /></span>
            <div className="min-w-0">
              <h2 className="font-semibold text-ink">Histórico de atividades</h2>
              <p className="truncate text-xs text-steel">Quem realizou a ação, o que fez e quando.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded bg-b24-bg px-2.5 py-1.5 text-xs font-medium text-steel">
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(event) => { setOnlyErrors(event.target.checked); setVisibleCount(10); }}
                className="h-3.5 w-3.5 accent-red-500"
              />
              Somente falhas
            </label>
            <button onClick={() => refetch()} disabled={isFetching} title="Atualizar atividades" aria-label="Atualizar atividades" className="focus-ring grid h-8 w-8 place-items-center rounded border border-b24-border text-steel hover:bg-sky-50 hover:text-b24-blue-dark disabled:opacity-60">
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-b24-border/70">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-[66px] animate-pulse bg-surface px-5 py-3"><div className="ml-11 h-4 w-1/3 rounded bg-zinc-200" /><div className="ml-11 mt-2 h-3 w-1/2 rounded bg-zinc-100" /></div>)}</div>
        ) : isError ? (
          <div className="px-5 py-10 text-center"><AlertCircle className="mx-auto text-coral" size={24} /><p className="mt-2 text-sm text-ink">Não foi possível carregar as atividades.</p><button onClick={() => refetch()} className="mt-3 text-xs font-semibold text-b24-blue-dark hover:underline">Tentar novamente</button></div>
        ) : visible.length ? (
          <div className="divide-y divide-b24-border/70">
            {visible.map((item) => (
              <div key={item.id} className="flex gap-3 px-4 py-3 transition hover:bg-sky-50/40 sm:items-center sm:px-5">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${item.status === 'ERROR' ? 'bg-red-50 text-coral' : 'bg-emerald-50 text-emerald-600'}`}>
                  {item.status === 'ERROR' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink"><strong>{item.actor}</strong> <span className="text-steel">{item.action}</span></p>
                  {item.context && <p className={`mt-0.5 truncate text-xs ${item.status === 'ERROR' ? 'text-coral' : 'text-steel'}`} title={item.context}>{item.context}</p>}
                </div>
                <time dateTime={item.createdAt} className="shrink-0 whitespace-pre-line text-right text-[11px] leading-4 text-steel">{activityTime(item.createdAt)}</time>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-10 text-center"><CheckCircle2 className="mx-auto text-b24-green" size={25} /><p className="mt-2 text-sm font-medium text-ink">{onlyErrors ? 'Nenhuma falha registrada' : 'Nenhuma atividade registrada'}</p></div>
        )}

        {visibleCount < filtered.length && (
          <button onClick={() => setVisibleCount((count) => count + 10)} className="focus-ring flex w-full items-center justify-center gap-1.5 border-t border-b24-border bg-b24-bg/40 px-4 py-2.5 text-xs font-semibold text-b24-blue-dark hover:bg-sky-50">
            Mostrar mais <ChevronDown size={14} />
          </button>
        )}
      </div>
    </section>
  );
}

function activityTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const prefix = sameDay
    ? 'Hoje'
    : date.toDateString() === yesterday.toDateString()
      ? 'Ontem'
      : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
  const hour = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  return `${prefix}\n${hour}`;
}
