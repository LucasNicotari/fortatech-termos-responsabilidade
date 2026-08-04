import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, History, RefreshCw, Settings2 } from 'lucide-react';
import { api } from '../services/api';
import { ActivityLog } from '../types';

type LogFilter = 'ALL' | 'ERROR' | 'CHANGE';
type CompactLog = ActivityLog & { count: number };

const filters: Array<{ id: LogFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'ERROR', label: 'Falhas' },
  { id: 'CHANGE', label: 'Alterações' }
];

export function Logs({ embedded = false }: { embedded?: boolean }) {
  const [filter, setFilter] = useState<LogFilter>('ALL');
  const [visibleCount, setVisibleCount] = useState(15);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data = [], isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['activity-logs'],
    queryFn: async () => (await api.get<ActivityLog[]>('/logs/activity')).data
  });
  const filtered = useMemo(
    () => filter === 'ALL' ? data : data.filter((item) => filter === 'ERROR'
      ? item.status === 'ERROR'
      : item.status === 'SUCCESS'),
    [data, filter]
  );
  const compacted = useMemo(() => compactLogs(filtered), [filtered]);
  const visible = compacted.slice(0, visibleCount);

  return (
    <section>
      {!embedded && <div className="mb-5"><h1 className="text-2xl font-bold text-ink">Logs</h1><p className="mt-1 text-sm text-steel">Alterações administrativas e falhas do aplicativo.</p></div>}

      <div className="overflow-hidden rounded border border-b24-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-b24-border px-4 py-3.5 sm:px-5">
          <div>
            <h2 className="font-semibold text-ink">Registros recentes</h2>
            <p className="mt-0.5 text-xs text-steel">Ações que podem exigir acompanhamento.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded border border-b24-border p-0.5" aria-label="Filtrar logs">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setFilter(item.id); setVisibleCount(15); }}
                  className={`focus-ring rounded px-2.5 py-1.5 text-xs font-medium ${
                    filter === item.id ? 'bg-sky-50 text-b24-blue-dark' : 'text-steel hover:text-ink'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button onClick={() => refetch()} disabled={isFetching} title="Atualizar logs" aria-label="Atualizar logs" className="focus-ring grid h-8 w-8 place-items-center rounded border border-b24-border text-steel hover:bg-sky-50 hover:text-b24-blue-dark disabled:opacity-60">
              <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-b24-border/70">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-[58px] animate-pulse px-5 py-3"><div className="ml-10 h-4 w-2/5 rounded bg-zinc-200" /></div>)}</div>
        ) : isError ? (
          <div className="px-5 py-10 text-center"><AlertCircle className="mx-auto text-coral" size={24} /><p className="mt-2 text-sm text-ink">Não foi possível carregar os logs.</p><button onClick={() => refetch()} className="mt-3 text-xs font-semibold text-b24-blue-dark hover:underline">Tentar novamente</button></div>
        ) : visible.length ? (
          <div className="divide-y divide-b24-border/70">
            {visible.map((item) => {
              const error = item.status === 'ERROR';
              const expanded = expandedId === item.id;
              return (
                <div key={item.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${error ? 'bg-red-50 text-coral' : 'bg-sky-50 text-b24-blue-dark'}`}>
                      {error ? <AlertCircle size={15} /> : <Settings2 size={15} />}
                    </span>
                    <p className="min-w-0 flex-1 text-sm text-ink"><strong>{item.actor}</strong> <span className="text-steel">{item.action}</span></p>
                    {item.count > 1 && <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-steel">{item.count}x</span>}
                    {error && item.context && (
                      <button type="button" onClick={() => setExpandedId(expanded ? null : item.id)} className="focus-ring text-xs font-semibold text-b24-blue-dark hover:underline">
                        {expanded ? 'Ocultar' : 'Detalhes'}
                      </button>
                    )}
                    <time dateTime={item.createdAt} className="shrink-0 text-right text-[11px] text-steel">{shortTime(item.createdAt)}</time>
                  </div>
                  {expanded && item.context && <p className="ml-11 mt-2 rounded bg-red-50 px-3 py-2 text-xs leading-5 text-coral">{item.context}</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-10 text-center"><History className="mx-auto text-zinc-300" size={25} /><p className="mt-2 text-sm font-medium text-ink">Nenhum registro encontrado</p></div>
        )}

        {visibleCount < compacted.length && (
          <button onClick={() => setVisibleCount((count) => count + 15)} className="focus-ring flex w-full items-center justify-center gap-1.5 border-t border-b24-border px-4 py-2.5 text-xs font-semibold text-b24-blue-dark hover:bg-sky-50">
            Mostrar mais <ChevronDown size={14} />
          </button>
        )}
      </div>
    </section>
  );
}

function shortTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date);
}

function compactLogs(items: ActivityLog[]): CompactLog[] {
  const grouped = new Map<string, CompactLog>();
  for (const item of items) {
    const day = new Date(item.createdAt).toDateString();
    const key = [day, item.actor, item.action, item.status, item.status === 'ERROR' ? item.context : ''].join('|');
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      grouped.set(key, { ...item, count: 1 });
    }
  }
  return [...grouped.values()];
}
