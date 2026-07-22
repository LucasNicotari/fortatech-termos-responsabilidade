import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, ExternalLink, FilePlus2, FileText, Package, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { BitrixEmployee, SendRequest, Signature } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { UserAvatar } from '../components/UserAvatar';
import { formatDate } from '../utils/format';

type TermFilter = 'ALL' | 'DRAFT' | 'WAITING' | 'COMPLETED' | 'ATTENTION';

const filters: Array<{ id: TermFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'DRAFT', label: 'Rascunhos' },
  { id: 'WAITING', label: 'Aguardando assinatura' },
  { id: 'COMPLETED', label: 'Concluídos' },
  { id: 'ATTENTION', label: 'Atenção' }
];

export function Signatures() {
  const queryClient = useQueryClient();
  const localMode = import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true';
  const [filter, setFilter] = useState<TermFilter>('ALL');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const requestsQuery = useQuery({
    queryKey: ['send-requests'],
    queryFn: async () => (await api.get<SendRequest[]>('/send-requests')).data
  });
  const { data: bitrixEmployees = [] } = useQuery({
    queryKey: ['bitrix-term-employees'],
    queryFn: async () => (await api.get<BitrixEmployee[]>('/bitrix/term-employees')).data,
    retry: false
  });
  const photosById = useMemo(() => new Map(bitrixEmployees.map((employee) => [String(employee.ID), employee.PERSONAL_PHOTO])), [bitrixEmployees]);
  const requests = requestsQuery.data || [];
  const visible = useMemo(() => {
    const normalizedSearch = normalize(search);
    return requests.filter((request) => {
      if (!matchesFilter(request, filter)) return false;
      if (!normalizedSearch) return true;
      return normalize(`${request.employee?.nome} ${request.employee?.email} ${request.employee?.bitrixId} ${request.documentFileName}`).includes(normalizedSearch);
    });
  }, [requests, filter, search]);

  const refresh = useMutation({
    mutationFn: (signatureId?: string) => api.post('/signatures/sync', signatureId ? { signatureId } : {}),
    onSuccess: invalidateTerms
  });
  const retry = useMutation({
    mutationFn: (signatureId: string) => api.post(`/signatures/${signatureId}/retry`),
    onSuccess: invalidateTerms
  });
  const retryArchive = useMutation({
    mutationFn: (signatureId: string) => api.post(`/signatures/${signatureId}/archive/retry`),
    onSuccess: invalidateTerms
  });

  function invalidateTerms() {
    queryClient.invalidateQueries({ queryKey: ['send-requests'] });
    queryClient.invalidateQueries({ queryKey: ['signatures'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  async function download(signatureId: string) {
    const { data: file } = await api.get<{ url: string }>(`/signatures/${signatureId}/file`);
    window.open(file.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-115px)] max-w-[1600px] flex-col">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Termos</h1>
          <p className="mt-1 text-sm text-steel">Acompanhe cada documento, do rascunho à assinatura concluída.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refresh.mutate(undefined)} disabled={refresh.isPending} className="focus-ring inline-flex h-9 items-center gap-2 rounded border border-b24-border bg-white px-3 text-sm font-medium text-steel hover:bg-sky-50 hover:text-b24-blue-dark disabled:opacity-60">
            <RefreshCw size={16} className={refresh.isPending ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Sincronizar</span>
          </button>
          <Link to="/send-requests" className="focus-ring inline-flex h-9 items-center gap-2 rounded bg-b24-blue px-3.5 text-sm font-semibold text-white hover:bg-b24-blue-dark"><FilePlus2 size={17} /> Novo termo</Link>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-b24-border bg-white px-3 py-2 sm:max-w-sm">
          <Search size={16} className="shrink-0 text-steel" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar colaborador, e-mail ou ID" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
        </label>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded border border-b24-border bg-white p-1" aria-label="Filtrar termos">
          {filters.map((item) => (
            <button key={item.id} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={`focus-ring shrink-0 rounded px-2.5 py-1.5 text-xs font-medium transition ${filter === item.id ? 'bg-sky-50 text-b24-blue-dark' : 'text-steel hover:bg-b24-bg hover:text-ink'}`}>{item.label}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded border border-b24-border bg-white">
        <div className="hidden grid-cols-[minmax(240px,1.4fr)_minmax(180px,1fr)_150px_130px_32px] gap-4 border-b border-b24-border bg-b24-bg/60 px-5 py-2.5 text-xs font-semibold text-steel lg:grid">
          <span>Colaborador</span><span>Documento</span><span>Status</span><span>Atualização</span><span />
        </div>
        {requestsQuery.isLoading ? <TermSkeleton /> : visible.length ? (
          <div className="divide-y divide-b24-border/80">
            {visible.map((request) => {
              const signature = request.signatures?.[0];
              const status = signature?.status || request.status;
              const expanded = expandedId === request.id;
              const employeeName = request.employee?.nome || 'Colaborador não identificado';
              return (
                <article key={request.id} className="transition hover:bg-sky-50/30">
                  <button onClick={() => setExpandedId(expanded ? null : request.id)} aria-expanded={expanded} className="focus-ring grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left lg:grid-cols-[minmax(240px,1.4fr)_minmax(180px,1fr)_150px_130px_32px] lg:gap-4 lg:px-5">
                    <span className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
                      <UserAvatar name={employeeName} photoUrl={photosById.get(String(request.employee?.bitrixId))} />
                      <span className="min-w-0"><strong className="block truncate text-sm text-ink">{employeeName}</strong><span className="block truncate text-xs text-steel">{request.employee?.email || 'Sem e-mail'}{request.employee?.bitrixId ? ` · ID ${request.employee.bitrixId}` : ''}</span></span>
                    </span>
                    <span className="min-w-0"><span className="block truncate text-sm text-ink">{request.documentFileName || 'Documento em preparação'}</span><span className="mt-0.5 flex items-center gap-1 text-xs text-steel"><Package size={13} /> {request.equipment?.length || 0} {(request.equipment?.length || 0) === 1 ? 'item' : 'itens'}</span></span>
                    <span><StatusBadge status={status} /></span>
                    <span className="text-xs text-steel">{formatDate(signature?.updatedAt || request.updatedAt)}</span>
                    <ChevronDown size={17} className={`text-steel transition ${expanded ? 'rotate-180' : ''}`} />
                  </button>

                  {expanded && (
                    <div className="border-t border-b24-border/70 bg-b24-bg/45 px-4 py-4 lg:px-5">
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                        <div className="grid gap-3 text-xs text-steel sm:grid-cols-3">
                          <Detail label="Criado" value={formatDate(request.createdAt)} />
                          <Detail label="Enviado" value={formatDate(signature?.sentAt || request.sentAt)} />
                          <Detail label="Assinado" value={formatDate(signature?.signedAt)} />
                          <Detail label="Template" value={request.templateVersion ? `${request.templateVersion.template.nome} · v${request.templateVersion.versao}` : '-'} />
                          <Detail label="Provedor" value={signature ? (localMode ? 'Simulação local' : signature.provider === 'ZAPSIGN' ? 'ZapSign' : 'Bitrix24') : 'Ainda não enviado'} />
                          <Detail label="Backup" value={archiveLabel(signature)} error={signature?.archiveStatus === 'FAILED'} />
                        </div>
                        {signature && <SignatureActions signature={signature} localMode={localMode} onSync={() => refresh.mutate(signature.id)} onRetry={() => retry.mutate(signature.id)} onRetryArchive={() => retryArchive.mutate(signature.id)} onDownload={() => download(signature.id)} />}
                      </div>
                      {!!request.equipment?.length && <div className="mt-4 flex flex-wrap gap-2">{request.equipment.map((item, index) => <span key={item.id || index} className="rounded-full border border-b24-border bg-white px-2.5 py-1 text-xs text-steel">{item.quantity}× {item.description}{item.assetTag ? ` · Patrimônio ${item.assetTag}` : ''}</span>)}</div>}
                      {(request.failureReason || signature?.archiveError) && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-coral">{request.failureReason || signature?.archiveError}</p>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-64 flex-1 place-items-center px-5 py-10 text-center"><div><FileText className="mx-auto text-zinc-300" size={32} /><p className="mt-3 font-medium text-ink">Nenhum termo encontrado</p><p className="mt-1 text-xs text-steel">{requests.length ? 'Altere a busca ou os filtros selecionados.' : 'Crie o primeiro termo para iniciar o acompanhamento.'}</p>{!requests.length && <Link to="/send-requests" className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg bg-b24-blue px-3.5 py-2 text-xs font-semibold text-white hover:bg-b24-blue-dark"><FilePlus2 size={15} /> Criar primeiro termo</Link>}</div></div>
        )}
      </div>
    </section>
  );
}

function SignatureActions({ signature, localMode, onSync, onRetry, onRetryArchive, onDownload }: {
  signature: Signature;
  localMode: boolean;
  onSync: () => void;
  onRetry: () => void;
  onRetryArchive: () => void;
  onDownload: () => void;
}) {
  const finished = ['SIGNED', 'FINISHED'].includes(signature.status);
  const retryable = ['ERROR', 'DECLINED', 'CANCELED'].includes(signature.status);
  return (
    <div className="flex flex-wrap gap-2 md:justify-end">
      {localMode && signature.providerDocumentId && !finished && <a href={`/assinar/${encodeURIComponent(signature.providerDocumentId)}`} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1.5 rounded border border-b24-blue/40 bg-white px-2.5 py-2 text-xs font-medium text-b24-blue-dark hover:bg-sky-50"><ExternalLink size={14} /> Abrir assinatura</a>}
      {!finished && <button onClick={onSync} className="focus-ring inline-flex items-center gap-1.5 rounded border border-b24-border bg-white px-2.5 py-2 text-xs font-medium text-steel hover:bg-zinc-50"><RefreshCw size={14} /> Atualizar</button>}
      {retryable && <button onClick={onRetry} className="focus-ring inline-flex items-center gap-1.5 rounded border border-b24-border bg-white px-2.5 py-2 text-xs font-medium text-steel hover:bg-zinc-50"><RotateCcw size={14} /> Tentar novamente</button>}
      {signature.archiveStatus === 'FAILED' && <button onClick={onRetryArchive} className="focus-ring inline-flex items-center gap-1.5 rounded border border-red-200 bg-white px-2.5 py-2 text-xs font-medium text-coral hover:bg-red-50"><RotateCcw size={14} /> Refazer backup</button>}
      {signature.archiveStatus === 'ARCHIVED' && <button onClick={onDownload} className="focus-ring inline-flex items-center gap-1.5 rounded bg-b24-blue px-2.5 py-2 text-xs font-semibold text-white hover:bg-b24-blue-dark"><Download size={14} /> Baixar PDF</button>}
    </div>
  );
}

function Detail({ label, value, error = false }: { label: string; value: string; error?: boolean }) {
  return <div><span className="block font-medium uppercase tracking-wide text-zinc-400">{label}</span><span className={`mt-1 block truncate ${error ? 'text-coral' : 'text-ink'}`} title={value}>{value}</span></div>;
}

function archiveLabel(signature?: Signature) {
  if (!signature) return '-';
  const labels: Record<string, string> = { NOT_REQUIRED: 'Aguardando conclusão', PENDING: 'Arquivando', ARCHIVED: 'PDF arquivado', FAILED: 'Falha no backup' };
  return labels[signature.archiveStatus || 'NOT_REQUIRED'] || signature.archiveStatus || '-';
}

function matchesFilter(request: SendRequest, filter: TermFilter) {
  const signatureStatus = request.signatures?.[0]?.status;
  if (filter === 'DRAFT') return ['DRAFT', 'READY'].includes(request.status);
  if (filter === 'WAITING') return Boolean(signatureStatus && ['PENDING', 'SENT', 'VIEWED', 'IN_PROGRESS'].includes(signatureStatus)) || ['PENDING', 'SENDING', 'SENT', 'IN_PROGRESS'].includes(request.status);
  if (filter === 'COMPLETED') return Boolean(signatureStatus && ['SIGNED', 'FINISHED'].includes(signatureStatus));
  if (filter === 'ATTENTION') return ['FAILED', 'CANCELED'].includes(request.status) || Boolean(signatureStatus && ['DECLINED', 'ERROR', 'CANCELED'].includes(signatureStatus));
  return true;
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function TermSkeleton() {
  return <div className="divide-y divide-b24-border/70">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="flex h-[72px] animate-pulse items-center gap-3 px-5"><span className="h-10 w-10 rounded-full bg-zinc-200" /><span className="h-4 w-1/4 rounded bg-zinc-200" /><span className="ml-auto h-6 w-24 rounded bg-zinc-100" /></div>)}</div>;
}
