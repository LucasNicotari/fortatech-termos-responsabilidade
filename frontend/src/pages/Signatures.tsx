import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Download, ExternalLink, FilePlus2, FileText, Package, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { SendRequest, Signature } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../utils/format';
import { useAuth } from '../contexts/AuthContext';

type TermFilter = 'ALL' | 'DRAFT' | 'WAITING' | 'COMPLETED' | 'ATTENTION';
type SendRequestPage = { items: SendRequest[]; nextCursor: string | null };

const pageSize = 30;
const maxBulkSelection = 100;

const filters: Array<{ id: TermFilter; label: string }> = [
  { id: 'ALL', label: 'Todos' },
  { id: 'DRAFT', label: 'Rascunhos' },
  { id: 'WAITING', label: 'Aguardando assinatura' },
  { id: 'COMPLETED', label: 'Concluídos' },
  { id: 'ATTENTION', label: 'Atenção' }
];

export function Signatures() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canOperate = Boolean(user?.canOperate);
  const localMode = import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true';
  const [filter, setFilter] = useState<TermFilter>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const mobileSelectAllRef = useRef<HTMLInputElement>(null);
  const confirmRemoveRef = useRef<HTMLButtonElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const requestsQuery = useInfiniteQuery({
    queryKey: ['send-requests', 'page', filter, debouncedSearch],
    queryFn: async ({ pageParam }) => (await api.get<SendRequestPage>('/send-requests/page', {
      params: {
        limit: pageSize,
        filter,
        search: debouncedSearch || undefined,
        cursor: pageParam || undefined
      }
    })).data,
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined
  });
  const requests = useMemo(
    () => requestsQuery.data?.pages.flatMap((page) => page.items) || [],
    [requestsQuery.data]
  );
  const visible = requests;
  const selectableVisible = useMemo(
    () => visible.filter(canRemoveFromHistory),
    [visible]
  );
  const allVisibleSelected = selectableVisible.length > 0
    && selectableVisible.slice(0, maxBulkSelection).every((request) => selectedIds.has(request.id));
  const someVisibleSelected = selectableVisible.some((request) => selectedIds.has(request.id));

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !requestsQuery.hasNextPage || requestsQuery.isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) requestsQuery.fetchNextPage();
      },
      { rootMargin: '240px 0px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [requestsQuery.fetchNextPage, requestsQuery.hasNextPage, requestsQuery.isFetchingNextPage]);

  useEffect(() => {
    [selectAllRef.current, mobileSelectAllRef.current].forEach((checkbox) => {
      if (checkbox) checkbox.indeterminate = someVisibleSelected && !allVisibleSelected;
    });
  }, [allVisibleSelected, someVisibleSelected]);

  useEffect(() => {
    const selectableIds = new Set(selectableVisible.map((request) => request.id));
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => selectableIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [selectableVisible]);

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
  const removeHistory = useMutation({
    mutationFn: (ids: string[]) => api.post('/send-requests/bulk-remove', { ids }),
    onSuccess: () => {
      setSelectedIds(new Set());
      setRemoveDialogOpen(false);
      invalidateTerms();
    }
  });

  useEffect(() => {
    if (!removeDialogOpen) return;
    confirmRemoveRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !removeHistory.isPending) closeRemoveDialog();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [removeDialogOpen, removeHistory.isPending]);

  function invalidateTerms() {
    queryClient.invalidateQueries({ queryKey: ['send-requests'] });
    queryClient.invalidateQueries({ queryKey: ['signatures'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  async function download(signatureId: string) {
    const { data: file } = await api.get<{ url: string }>(`/signatures/${signatureId}/file`);
    window.open(file.url, '_blank', 'noopener,noreferrer');
  }

  function changeSearch(value: string) {
    setSearch(value);
    setSelectedIds(new Set());
    setRemoveDialogOpen(false);
  }

  function openRemoveDialog() {
    removeHistory.reset();
    setRemoveDialogOpen(true);
  }

  function closeRemoveDialog() {
    if (removeHistory.isPending) return;
    removeHistory.reset();
    setRemoveDialogOpen(false);
  }

  function changeFilter(value: TermFilter) {
    setFilter(value);
    setSelectedIds(new Set());
    setRemoveDialogOpen(false);
  }

  function toggleRequest(requestId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(requestId)) next.delete(requestId);
      else if (next.size < maxBulkSelection) next.add(requestId);
      return next;
    });
  }

  function toggleAllVisible() {
    if (allVisibleSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(selectableVisible.slice(0, maxBulkSelection).map((request) => request.id)));
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-115px)] max-w-[1600px] flex-col">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Termos</h1>
          <p className="mt-1 text-sm text-steel">Acompanhe cada documento, do rascunho à assinatura concluída.</p>
        </div>
        {canOperate && (
          <div className="flex items-center gap-2">
            <button onClick={() => refresh.mutate(undefined)} disabled={refresh.isPending} className="focus-ring inline-flex h-9 items-center gap-2 rounded border border-b24-border bg-surface px-3 text-sm font-medium text-steel hover:bg-sky-50 hover:text-b24-blue-dark disabled:opacity-60">
              <RefreshCw size={16} className={refresh.isPending ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Sincronizar</span>
            </button>
            <Link to="/send-requests" className="focus-ring inline-flex h-9 items-center gap-2 rounded bg-b24-blue px-3.5 text-sm font-semibold text-white hover:bg-b24-blue-dark"><FilePlus2 size={17} /> Novo termo</Link>
          </div>
        )}
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-b24-border bg-surface px-3 py-2 sm:max-w-sm">
          <Search size={16} className="shrink-0 text-steel" />
          <input value={search} maxLength={120} onChange={(event) => changeSearch(event.target.value)} placeholder="Buscar colaborador, e-mail ou ID" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none" />
        </label>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded border border-b24-border bg-surface p-1" aria-label="Filtrar termos">
          {filters.map((item) => (
            <button key={item.id} onClick={() => changeFilter(item.id)} aria-pressed={filter === item.id} className={`focus-ring shrink-0 rounded px-2.5 py-1.5 text-xs font-medium transition ${filter === item.id ? 'bg-sky-50 text-b24-blue-dark' : 'text-steel hover:bg-b24-bg hover:text-ink'}`}>{item.label}</button>
          ))}
        </div>
      </div>

      {canOperate && selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2" role="status" aria-live="polite">
          <span className="text-sm font-semibold text-b24-blue-dark">
            {selectedIds.size} {selectedIds.size === 1 ? 'termo selecionado' : 'termos selecionados'}
            {selectedIds.size === maxBulkSelection && <span className="ml-2 font-normal text-steel">Limite de {maxBulkSelection} por operação.</span>}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedIds(new Set())} className="focus-ring rounded px-2.5 py-1.5 text-xs font-medium text-steel hover:bg-surface hover:text-ink">
              Limpar seleção
            </button>
            <button type="button" onClick={openRemoveDialog} className="focus-ring inline-flex items-center gap-1.5 rounded bg-coral px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-600">
              <Trash2 size={14} /> Remover
            </button>
          </div>
        </div>
      )}

      {canOperate && visible.length > 0 && (
        <label className="mb-2 flex items-center gap-2 rounded border border-b24-border bg-surface px-3 py-2 text-xs font-medium text-steel lg:hidden">
          <input
            ref={mobileSelectAllRef}
            type="checkbox"
            checked={allVisibleSelected}
            disabled={!selectableVisible.length}
            onChange={toggleAllVisible}
            className="focus-ring h-4 w-4 rounded border-b24-border accent-b24-blue disabled:cursor-not-allowed disabled:opacity-40"
          />
          {selectableVisible.length > maxBulkSelection
            ? `Selecionar os primeiros ${maxBulkSelection} termos carregados`
            : 'Selecionar todos os termos carregados nesta lista'}
        </label>
      )}

      <div className="flex flex-1 flex-col overflow-hidden rounded border border-b24-border bg-surface">
        <div className="hidden items-center border-b border-b24-border bg-b24-bg/60 px-5 py-2.5 text-xs font-semibold text-steel lg:flex">
          {canOperate && (
            <span className="flex w-10 shrink-0 items-center">
              <input
                ref={selectAllRef}
                type="checkbox"
                checked={allVisibleSelected}
                disabled={!selectableVisible.length}
                onChange={toggleAllVisible}
                aria-label={selectableVisible.length > maxBulkSelection
                  ? `Selecionar os primeiros ${maxBulkSelection} termos carregados`
                  : 'Selecionar todos os termos carregados nesta lista'}
                className="focus-ring h-4 w-4 rounded border-b24-border accent-b24-blue disabled:cursor-not-allowed disabled:opacity-40"
              />
            </span>
          )}
          <span className="grid min-w-0 flex-1 grid-cols-[minmax(240px,1.4fr)_minmax(180px,1fr)_150px_130px_32px] gap-4">
            <span>Colaborador</span><span>Documento</span><span>Status</span><span>Atualização</span><span />
          </span>
        </div>
        {requestsQuery.isLoading ? <TermSkeleton /> : requestsQuery.isError && !visible.length ? (
          <div className="grid min-h-64 flex-1 place-items-center px-5 py-10 text-center">
            <div>
              <FileText className="mx-auto text-coral" size={32} />
              <p className="mt-3 font-medium text-ink">Não foi possível carregar os termos</p>
              <p className="mt-1 text-xs text-steel">Verifique a conexão e tente novamente.</p>
              <button type="button" onClick={() => requestsQuery.refetch()} className="focus-ring mt-4 inline-flex items-center gap-2 rounded border border-b24-border bg-surface px-3.5 py-2 text-xs font-semibold text-b24-blue-dark hover:bg-sky-50">
                <RefreshCw size={14} /> Tentar novamente
              </button>
            </div>
          </div>
        ) : visible.length ? (
          <div className="divide-y divide-b24-border/80">
            {visible.map((request) => {
              const signature = request.signatures?.[0];
              const status = signature?.status || request.status;
              const expanded = expandedId === request.id;
              const employeeName = request.employee?.nome || 'Colaborador não identificado';
              const removable = canRemoveFromHistory(request);
              const selected = selectedIds.has(request.id);
              return (
                <article key={request.id} className={`transition hover:bg-sky-50/30 ${selected ? 'bg-sky-50/60' : ''}`}>
                  <div className="flex items-stretch">
                    {canOperate && (
                      <span className="flex w-10 shrink-0 items-center justify-center pl-1 lg:w-[60px] lg:justify-start lg:pl-5">
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={!removable || removeHistory.isPending || (!selected && selectedIds.size >= maxBulkSelection)}
                          onChange={() => toggleRequest(request.id)}
                          title={!removable
                            ? 'O termo assinado só pode ser removido depois de ser salvo no Drive.'
                            : !selected && selectedIds.size >= maxBulkSelection
                              ? `O limite de ${maxBulkSelection} termos por operação foi atingido.`
                              : 'Selecionar termo'}
                          aria-label={!removable
                            ? `O termo de ${employeeName} ainda precisa ser salvo no Drive antes da remoção`
                            : !selected && selectedIds.size >= maxBulkSelection
                              ? `Limite de ${maxBulkSelection} termos selecionados atingido`
                              : `Selecionar o termo de ${employeeName}`}
                          className="focus-ring h-4 w-4 rounded border-b24-border accent-b24-blue disabled:cursor-not-allowed disabled:opacity-40"
                        />
                      </span>
                    )}
                    <button onClick={() => setExpandedId(expanded ? null : request.id)} aria-expanded={expanded} className="focus-ring grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left lg:grid-cols-[minmax(240px,1.4fr)_minmax(180px,1fr)_150px_130px_32px] lg:gap-4 lg:px-5">
                      <span className="col-span-2 min-w-0 lg:col-span-1">
                        <strong className="block truncate text-sm text-ink">{employeeName}</strong>
                      </span>
                      <span className="min-w-0"><span className="block truncate text-sm text-ink">{request.documentFileName || 'Documento em preparação'}</span><span className="mt-0.5 flex items-center gap-1 text-xs text-steel"><Package size={13} /> {request.equipment?.length || 0} {(request.equipment?.length || 0) === 1 ? 'item' : 'itens'}</span></span>
                      <span><StatusBadge status={status} /></span>
                      <span className="text-xs text-steel">{formatDate(signature?.updatedAt || request.updatedAt)}</span>
                      <ChevronDown size={17} className={`text-steel transition ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {expanded && (
                    <div className="border-t border-b24-border/70 bg-b24-bg/45 px-4 py-4 lg:px-5">
                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                        <div className="grid gap-3 text-xs text-steel sm:grid-cols-3">
                          <Detail label="Criado" value={formatDate(request.createdAt)} />
                          <Detail label="Enviado" value={formatDate(signature?.sentAt || request.sentAt)} />
                          <Detail label="Visualizado" value={formatDate(signature?.viewedAt)} />
                          <Detail label="Assinado" value={formatDate(signature?.signedAt)} />
                          <Detail label="Template" value={request.templateVersion ? `${request.templateVersion.template.nome} · v${request.templateVersion.versao}` : '-'} />
                          <Detail label="Provedor" value={signature ? (localMode ? 'Simulação local' : signature.provider === 'ZAPSIGN' ? 'ZapSign' : 'Bitrix24') : 'Ainda não enviado'} />
                          <Detail label="Arquivamento" value={archiveLabel(signature)} error={signature?.archiveStatus === 'FAILED'} />
                        </div>
                        {signature && <SignatureActions signature={signature} localMode={localMode} canOperate={canOperate} onSync={() => refresh.mutate(signature.id)} onRetry={() => retry.mutate(signature.id)} onRetryArchive={() => retryArchive.mutate(signature.id)} onDownload={() => download(signature.id)} />}
                      </div>
                      {!!request.equipment?.length && <div className="mt-4 flex flex-wrap gap-2">{request.equipment.map((item, index) => <span key={item.id || index} className="rounded-full border border-b24-border bg-surface px-2.5 py-1 text-xs text-steel">{item.quantity}× {item.description}{item.assetTag ? ` · Patrimônio ${item.assetTag}` : ''}</span>)}</div>}
                      {(request.failureReason || signature?.archiveError) && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-coral">{request.failureReason || signature?.archiveError}</p>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="grid min-h-64 flex-1 place-items-center px-5 py-10 text-center"><div><FileText className="mx-auto text-zinc-300" size={32} /><p className="mt-3 font-medium text-ink">Nenhum termo encontrado</p><p className="mt-1 text-xs text-steel">{requests.length ? 'Altere a busca ou os filtros selecionados.' : canOperate ? 'Crie o primeiro termo para iniciar o acompanhamento.' : 'Os termos disponíveis aparecerão aqui.'}</p>{canOperate && !requests.length && <Link to="/send-requests" className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg bg-b24-blue px-3.5 py-2 text-xs font-semibold text-white hover:bg-b24-blue-dark"><FilePlus2 size={15} /> Criar primeiro termo</Link>}</div></div>
        )}
        {visible.length > 0 && (
          <div ref={loadMoreRef} className="border-t border-b24-border bg-b24-bg/35 px-4 py-3 text-center">
            {requestsQuery.hasNextPage ? (
              <button
                type="button"
                disabled={requestsQuery.isFetchingNextPage}
                onClick={() => requestsQuery.fetchNextPage()}
                className="focus-ring inline-flex items-center gap-2 rounded border border-b24-border bg-surface px-3.5 py-2 text-xs font-semibold text-b24-blue-dark hover:bg-sky-50 disabled:opacity-60"
              >
                <RefreshCw size={14} className={requestsQuery.isFetchingNextPage ? 'animate-spin' : ''} />
                {requestsQuery.isFetchingNextPage
                  ? 'Carregando mais termos...'
                  : requestsQuery.isFetchNextPageError
                    ? 'Tentar carregar novamente'
                    : `Carregar mais ${pageSize}`}
              </button>
            ) : (
              <span className="text-xs text-steel">Todos os {visible.length} termos desta busca foram carregados.</span>
            )}
          </div>
        )}
      </div>

      {removeDialogOpen && (
        <RemoveHistoryDialog
          count={selectedIds.size}
          pending={removeHistory.isPending}
          error={removeHistory.error}
          confirmRef={confirmRemoveRef}
          onCancel={closeRemoveDialog}
          onConfirm={() => removeHistory.mutate(Array.from(selectedIds))}
        />
      )}
    </section>
  );
}

function SignatureActions({ signature, localMode, canOperate, onSync, onRetry, onRetryArchive, onDownload }: {
  signature: Signature;
  localMode: boolean;
  canOperate: boolean;
  onSync: () => void;
  onRetry: () => void;
  onRetryArchive: () => void;
  onDownload: () => void;
}) {
  const finished = ['SIGNED', 'FINISHED'].includes(signature.status);
  const retryable = ['ERROR', 'DECLINED', 'CANCELED'].includes(signature.status);
  return (
    <div className="flex flex-wrap gap-2 md:justify-end">
      {canOperate && localMode && signature.providerDocumentId && !finished && <a href={`/assinar/${encodeURIComponent(signature.providerDocumentId)}`} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1.5 rounded border border-b24-blue/40 bg-surface px-2.5 py-2 text-xs font-medium text-b24-blue-dark hover:bg-sky-50"><ExternalLink size={14} /> Abrir assinatura</a>}
      {canOperate && !finished && <button onClick={onSync} className="focus-ring inline-flex items-center gap-1.5 rounded border border-b24-border bg-surface px-2.5 py-2 text-xs font-medium text-steel hover:bg-zinc-50"><RefreshCw size={14} /> Atualizar</button>}
      {canOperate && retryable && <button onClick={onRetry} className="focus-ring inline-flex items-center gap-1.5 rounded border border-b24-border bg-surface px-2.5 py-2 text-xs font-medium text-steel hover:bg-zinc-50"><RotateCcw size={14} /> Tentar novamente</button>}
      {canOperate && signature.status === 'SIGNED' && ['PENDING', 'FAILED'].includes(signature.archiveStatus || '') && <button onClick={onRetryArchive} className="focus-ring inline-flex items-center gap-1.5 rounded border border-red-200 bg-surface px-2.5 py-2 text-xs font-medium text-coral hover:bg-red-50"><RotateCcw size={14} /> Salvar no Drive</button>}
      {signature.archiveStatus === 'ARCHIVED' && signature.bitrixDriveDetailUrl && <a href={signature.bitrixDriveDetailUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1.5 rounded border border-b24-blue/40 bg-surface px-2.5 py-2 text-xs font-medium text-b24-blue-dark hover:bg-sky-50"><ExternalLink size={14} /> Abrir no Drive</a>}
      {signature.archiveStatus === 'ARCHIVED' && <button onClick={onDownload} className="focus-ring inline-flex items-center gap-1.5 rounded bg-b24-blue px-2.5 py-2 text-xs font-semibold text-white hover:bg-b24-blue-dark"><Download size={14} /> Baixar PDF</button>}
    </div>
  );
}

function RemoveHistoryDialog({ count, pending, error, confirmRef, onCancel, onConfirm }: {
  count: number;
  pending: boolean;
  error: Error | null;
  confirmRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="remove-history-title" aria-describedby="remove-history-description" className="w-full max-w-md rounded-xl border border-b24-border bg-surface p-5 shadow-2xl">
        <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-red-50 text-coral"><Trash2 size={19} /></span>
        <h2 id="remove-history-title" className="text-lg font-semibold text-ink">Remover do histórico?</h2>
        <p id="remove-history-description" className="mt-2 text-sm leading-6 text-steel">
          {count === 1 ? 'O termo selecionado deixará' : `Os ${count} termos selecionados deixarão`} de aparecer nesta lista. PDFs já assinados e registros de auditoria continuarão preservados; convites pendentes serão cancelados.
        </p>
        {error && <p role="alert" className="mt-3 rounded bg-red-50 px-3 py-2 text-xs text-coral">{removeErrorMessage(error)}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" disabled={pending} onClick={onCancel} className="focus-ring rounded border border-b24-border bg-surface px-3.5 py-2 text-sm font-medium text-steel hover:bg-zinc-50 disabled:opacity-50">
            Cancelar
          </button>
          <button ref={confirmRef} type="button" disabled={pending} onClick={onConfirm} className="focus-ring inline-flex items-center gap-2 rounded bg-coral px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50">
            <Trash2 size={15} /> {pending ? 'Removendo...' : 'Confirmar remoção'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value, error = false }: { label: string; value: string; error?: boolean }) {
  return <div><span className="block font-medium uppercase tracking-wide text-zinc-400">{label}</span><span className={`mt-1 block truncate ${error ? 'text-coral' : 'text-ink'}`} title={value}>{value}</span></div>;
}

function archiveLabel(signature?: Signature) {
  if (!signature) return '-';
  const labels: Record<string, string> = {
    NOT_REQUIRED: 'Aguardando assinatura',
    PENDING: 'Salvando no Drive',
    ARCHIVED: signature.provider === 'FORTADOCS' ? 'Drive do Bitrix24' : 'PDF arquivado',
    FAILED: signature.provider === 'FORTADOCS' ? 'Falha no Drive' : 'Falha no backup'
  };
  return labels[signature.archiveStatus || 'NOT_REQUIRED'] || signature.archiveStatus || '-';
}

function canRemoveFromHistory(request: SendRequest) {
  const signature = request.signatures?.[0];
  return !(signature?.status === 'SIGNED' && signature.archiveStatus !== 'ARCHIVED');
}

function removeErrorMessage(error: Error) {
  const responseError = error as Error & {
    response?: {
      data?: {
        message?: string | string[] | { message?: string };
      };
    };
  };
  const message = responseError.response?.data?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join(' ');
  if (message?.message) return message.message;
  return 'Não foi possível remover os termos. Atualize a lista e tente novamente.';
}

function TermSkeleton() {
  return <div className="divide-y divide-b24-border/70">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="flex h-[72px] animate-pulse items-center gap-3 px-5"><span className="h-10 w-10 rounded-full bg-zinc-200" /><span className="h-4 w-1/4 rounded bg-zinc-200" /><span className="ml-auto h-6 w-24 rounded bg-zinc-100" /></div>)}</div>;
}
