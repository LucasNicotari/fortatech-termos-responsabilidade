import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Eye,
  LoaderCircle,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Send,
  Trash2,
  UserRound,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../services/api';
import { openBitrixConversation } from '../services/bitrix-messenger';
import { BitrixEmployee, Equipment, SendRequest } from '../types';

interface ProviderStatus {
  provider: 'bitrix';
  environment: 'local' | 'production';
  configured: boolean;
  reason?: string;
  providerName?: string;
  portalUrl?: string;
  local?: boolean;
}

interface WorkflowNotificationDefaults {
  bitrixUserIds: number[];
}

type Step = 1 | 2 | 3;
type OperationStatus = 'idle' | 'pending' | 'success' | 'error';

interface TermFormState {
  id: string;
  step: Step;
  employeeId: string;
  name: string;
  email: string;
  cpf: string;
  jobTitle: string;
  department: string;
  equipment: Equipment[];
  notificationIds: string[];
  defaultsApplied: boolean;
  draftId: string | null;
  previewUrl: string | null;
  prepareStatus: OperationStatus;
  prepareError: string;
  sendStatus: OperationStatus;
  sendError: string;
  localSigningUrl: string;
  chatMessageId: string;
  chatRecipientBitrixUserId: string;
}

const MAX_TERMS = 5;
const emptyEquipment = (): Equipment => ({
  quantity: 1,
  description: '',
  serialNumber: '',
  assetTag: '',
  accessories: ''
});

function newTerm(notificationIds: string[] = []): TermFormState {
  return {
    id: globalThis.crypto?.randomUUID?.() || `term-${Date.now()}-${Math.random()}`,
    step: 1,
    employeeId: '',
    name: '',
    email: '',
    cpf: '',
    jobTitle: '',
    department: '',
    equipment: [emptyEquipment()],
    notificationIds,
    defaultsApplied: notificationIds.length > 0,
    draftId: null,
    previewUrl: null,
    prepareStatus: 'idle',
    prepareError: '',
    sendStatus: 'idle',
    sendError: '',
    localSigningUrl: '',
    chatMessageId: '',
    chatRecipientBitrixUserId: ''
  };
}

export function SendRequests() {
  const queryClient = useQueryClient();
  const [terms, setTerms] = useState<TermFormState[]>(() => [newTerm()]);
  const termsRef = useRef(terms);
  const [activeTermId, setActiveTermId] = useState(terms[0].id);
  const [reviewAll, setReviewAll] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationSearch, setNotificationSearch] = useState('');
  const helpRef = useRef<HTMLDivElement>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ['bitrix-employees'],
    queryFn: async () => (await api.get<BitrixEmployee[]>('/bitrix/employees')).data
  });
  const providerQuery = useQuery({
    queryKey: ['signature-provider-status'],
    queryFn: async () => (await api.get<ProviderStatus>('/signature-provider/status')).data,
    retry: false
  });
  const workflowQuery = useQuery({
    queryKey: ['term-workflow-notification-defaults'],
    queryFn: async () => (await api.get<WorkflowNotificationDefaults>('/term-workflow/notification-defaults')).data,
    retry: false
  });

  useEffect(() => {
    if (!workflowQuery.data) return;
    const defaults = workflowQuery.data.bitrixUserIds.map(String);
    setTerms((items) => items.map((term) => term.defaultsApplied
      ? term
      : { ...term, notificationIds: defaults, defaultsApplied: true }));
  }, [workflowQuery.data]);
  useEffect(() => {
    termsRef.current = terms;
  }, [terms]);
  useEffect(() => {
    if (!helpOpen) return;
    const close = (event: MouseEvent) => {
      if (!helpRef.current?.contains(event.target as Node)) setHelpOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelpOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [helpOpen]);

  const activeTerm = terms.find((term) => term.id === activeTermId) || terms[0];
  const providerReady = Boolean(providerQuery.data?.configured);
  const flowLocked = terms.some((term) => term.sendStatus === 'pending' || term.sendStatus === 'success');
  const allComplete = terms.every(termComplete);
  const allPrepared = terms.every((term) => Boolean(term.draftId && term.previewUrl));
  const sentCount = terms.filter((term) => term.sendStatus === 'success').length;
  const failedCount = terms.filter((term) => term.sendStatus === 'error').length;
  const operationPending = terms.some((term) =>
    term.prepareStatus === 'pending' || term.sendStatus === 'pending'
  );

  function updateTerm(
    id: string,
    update: Partial<TermFormState> | ((term: TermFormState) => Partial<TermFormState>)
  ) {
    setTerms((items) => items.map((term) => term.id === id
      ? { ...term, ...(typeof update === 'function' ? update(term) : update) }
      : term));
  }

  function invalidateDocument(id: string, update: Partial<TermFormState> = {}) {
    updateTerm(id, {
      ...update,
      draftId: null,
      previewUrl: null,
      prepareStatus: 'idle',
      prepareError: '',
      sendStatus: 'idle',
      sendError: '',
      localSigningUrl: '',
      chatMessageId: '',
      chatRecipientBitrixUserId: ''
    });
  }

  function selectEmployee(id: string) {
    const employee = employees.find((item) => item.ID === id);
    invalidateDocument(activeTerm.id, {
      employeeId: id,
      name: [employee?.NAME, employee?.LAST_NAME].filter(Boolean).join(' '),
      email: employee?.EMAIL || '',
      jobTitle: employee?.WORK_POSITION || '',
      department: employee?.DEPARTMENT_NAME || ''
    });
  }

  function updateEquipment(index: number, field: keyof Equipment, value: string | number) {
    invalidateDocument(activeTerm.id, {
      equipment: activeTerm.equipment.map((item, itemIndex) => itemIndex === index
        ? { ...item, [field]: value }
        : item)
    });
  }

  function addTerm() {
    if (terms.length >= MAX_TERMS || flowLocked) return;
    const defaults = (workflowQuery.data?.bitrixUserIds || []).map(String);
    const term = newTerm(defaults);
    setTerms((items) => [...items, term]);
    setActiveTermId(term.id);
    setReviewAll(false);
    setNotificationSearch('');
  }

  async function removeTerm(term: TermFormState) {
    if (terms.length === 1 || flowLocked) return;
    const hasData = Boolean(
      term.employeeId || term.cpf || term.equipment.some((item) => item.description)
    );
    if (hasData && !window.confirm('Remover este termo do envio?')) return;
    try {
      if (term.draftId) await api.delete(`/send-requests/${term.draftId}`);
      const remaining = termsRef.current.filter((item) => item.id !== term.id);
      setTerms(remaining);
      if (activeTermId === term.id) setActiveTermId(remaining[0].id);
    } catch (error) {
      updateTerm(term.id, {
        prepareStatus: 'error',
        prepareError: apiErrorMessage(error, 'Não foi possível remover este termo.')
      });
    }
  }

  async function prepareTerm(termId: string) {
    const term = termsRef.current.find((item) => item.id === termId);
    if (!term || !termComplete(term)) return { ok: false, requestId: term?.draftId || null };
    if (term.draftId && term.previewUrl) return { ok: true, requestId: term.draftId };

    updateTerm(termId, { prepareStatus: 'pending', prepareError: '' });
    let requestId = term.draftId;
    try {
      if (!requestId) {
        const { data: request } = await api.post<SendRequest>('/send-requests', {
          employeeBitrixUserId: Number(term.employeeId),
          employeeName: term.name,
          employeeEmail: term.email || undefined,
          cpf: term.cpf,
          cargo: term.jobTitle,
          departamento: term.department || undefined,
          equipment: term.equipment,
          notificationRecipientBitrixUserIds: term.notificationIds.map(Number)
        });
        requestId = request.id;
        updateTerm(termId, { draftId: requestId });
      }
      const { data: preview } = await api.post<{ previewUrl: string }>(
        `/send-requests/${requestId}/preview`
      );
      updateTerm(termId, {
        draftId: requestId,
        previewUrl: preview.previewUrl,
        prepareStatus: 'success',
        prepareError: ''
      });
      queryClient.invalidateQueries({ queryKey: ['send-requests'] });
      return { ok: true, requestId };
    } catch (error) {
      updateTerm(termId, {
        draftId: requestId,
        prepareStatus: 'error',
        prepareError: apiErrorMessage(error, 'Não foi possível gerar a prévia deste termo.')
      });
      return { ok: false, requestId };
    }
  }

  async function prepareAll() {
    for (const term of termsRef.current) await prepareTerm(term.id);
  }

  async function sendTerm(termId: string, preparedRequestId?: string | null) {
    const term = termsRef.current.find((item) => item.id === termId);
    const requestId = preparedRequestId || term?.draftId;
    if (!term || !requestId) return false;
    if (term.sendStatus === 'success') return true;

    updateTerm(termId, { sendStatus: 'pending', sendError: '' });
    try {
      const { data } = await api.post<SendRequest>(`/send-requests/${requestId}/send`);
      markTermSent(termId, data);
      return true;
    } catch (error) {
      // Se a resposta da API se perdeu depois do envio, o estado persistido é a
      // fonte da verdade. Isso evita apresentar falha e reenviar o convite.
      try {
        const { data } = await api.get<SendRequest>(`/send-requests/${requestId}`);
        if (['SENT', 'VIEWED', 'IN_PROGRESS', 'SIGNED', 'COMPLETED'].includes(data.status)) {
          markTermSent(termId, data);
          return true;
        }
      } catch {
        // Mantém abaixo a mensagem original do envio.
      }
      updateTerm(termId, {
        sendStatus: 'error',
        sendError: apiErrorMessage(error, 'Não foi possível enviar este termo.')
      });
      return false;
    }
  }

  function markTermSent(termId: string, request: SendRequest) {
    const localToken = request.signatures?.[0]?.providerDocumentId;
    updateTerm(termId, {
      sendStatus: 'success',
      sendError: '',
      chatMessageId: request.chatMessageId || '',
      chatRecipientBitrixUserId: request.chatRecipientBitrixUserId || '',
      localSigningUrl: providerQuery.data?.local && localToken
        ? `/assinar/${encodeURIComponent(localToken)}`
        : request.selfSigningUrl || ''
    });
  }

  async function openPreview(term: TermFormState) {
    if (!term.draftId) return;
    const previewWindow = window.open('', '_blank');
    if (previewWindow) previewWindow.opener = null;
    updateTerm(term.id, { prepareStatus: 'pending', prepareError: '' });
    try {
      const { data } = await api.post<{ previewUrl: string }>(
        `/send-requests/${term.draftId}/preview-url`
      );
      updateTerm(term.id, {
        previewUrl: data.previewUrl,
        prepareStatus: 'success',
        prepareError: ''
      });
      if (previewWindow) {
        previewWindow.location.replace(data.previewUrl);
      } else {
        window.open(data.previewUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      previewWindow?.close();
      updateTerm(term.id, {
        prepareStatus: 'error',
        prepareError: apiErrorMessage(error, 'Não foi possível abrir a prévia deste termo.')
      });
    }
  }

  function openConversation(term: TermFormState) {
    openBitrixConversation(
      term.chatRecipientBitrixUserId || term.employeeId,
      term.chatMessageId || undefined,
      providerQuery.data?.portalUrl
    );
  }

  async function sendTerms(targets = termsRef.current) {
    if (!providerReady) return;
    const prepared = new Map<string, string>();
    for (const term of targets) {
      const result = await prepareTerm(term.id);
      if (result.ok && result.requestId) prepared.set(term.id, result.requestId);
    }
    for (const term of targets) {
      const requestId = prepared.get(term.id);
      if (requestId) await sendTerm(term.id, requestId);
    }
    setReviewAll(true);
    invalidateHistory();
  }

  async function retryFailedTerms() {
    const failed = termsRef.current.filter((term) => term.sendStatus === 'error');
    for (const term of failed) {
      if (!term.draftId) continue;
      updateTerm(term.id, { prepareStatus: 'pending', prepareError: '', sendError: '' });
      try {
        const { data: current } = await api.get<SendRequest>(`/send-requests/${term.draftId}`);
        if (['SENT', 'VIEWED', 'IN_PROGRESS', 'SIGNED', 'COMPLETED'].includes(current.status)) {
          markTermSent(term.id, current);
          continue;
        }
        await api.post(`/send-requests/${term.draftId}/retry`);
        const { data: preview } = await api.post<{ previewUrl: string }>(
          `/send-requests/${term.draftId}/preview`
        );
        updateTerm(term.id, {
          previewUrl: preview.previewUrl,
          prepareStatus: 'success',
          sendStatus: 'idle'
        });
        await sendTerm(term.id, term.draftId);
      } catch (error) {
        updateTerm(term.id, {
          prepareStatus: 'error',
          sendStatus: 'error',
          sendError: apiErrorMessage(error, 'Não foi possível tentar este termo novamente.')
        });
      }
    }
    invalidateHistory();
  }

  function invalidateHistory() {
    queryClient.invalidateQueries({ queryKey: ['send-requests'] });
    queryClient.invalidateQueries({ queryKey: ['signatures'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  function startNewSend() {
    const defaults = (workflowQuery.data?.bitrixUserIds || []).map(String);
    const term = newTerm(defaults);
    setTerms([term]);
    setActiveTermId(term.id);
    setReviewAll(false);
    setNotificationSearch('');
  }

  const employeeComplete = termEmployeeComplete(activeTerm);
  const equipmentComplete = termEquipmentComplete(activeTerm);
  const selectedEmployee = employees.find((employee) => employee.ID === activeTerm.employeeId);
  const departmentHint = !activeTerm.employeeId || activeTerm.department
    ? undefined
    : selectedEmployee?.DEPARTMENT_LOOKUP_ERROR === 'MISSING_SCOPE'
      ? 'Adicione a permissão Estrutura da empresa (department) ao aplicativo Bitrix24 e reinstale-o.'
      : selectedEmployee?.DEPARTMENT_LOOKUP_ERROR === 'LOOKUP_FAILED'
        ? 'Não foi possível consultar a estrutura da empresa no Bitrix24.'
        : undefined;

  return (
    <section className="mx-auto max-w-[1280px]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Envio de termo</h1>
          <p className="mt-0.5 text-sm text-steel">Preencha em três etapas rápidas.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/terms" className="focus-ring mr-1 text-sm font-semibold text-b24-blue-dark hover:underline">
            Ver todos os termos
          </Link>
          <div ref={helpRef} className="relative">
            <button
              type="button"
              aria-label="Como adicionar termos"
              aria-expanded={helpOpen}
              onClick={() => setHelpOpen((open) => !open)}
              className="focus-ring grid h-9 w-9 place-items-center rounded-lg border border-b24-border bg-surface text-steel hover:bg-sky-50 hover:text-b24-blue-dark"
            >
              <CircleHelp size={17} />
            </button>
            {helpOpen && (
              <div role="tooltip" className="absolute right-0 top-11 z-40 w-64 rounded-lg border border-b24-border bg-surface p-3 text-xs leading-relaxed text-steel shadow-lg">
                <strong className="block text-ink">Até 5 termos por envio</strong>
                <span className="mt-1 block">Adicione mais quatro colaboradores. Cada pessoa receberá um documento individual para revisar e assinar.</span>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={terms.length >= MAX_TERMS || flowLocked}
            onClick={addTerm}
            title={terms.length >= MAX_TERMS ? 'Limite de 5 termos atingido' : 'Adicionar outro termo'}
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-b24-blue px-3 text-sm font-semibold text-b24-blue-dark hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus size={16} /> Termo
          </button>
        </div>
      </header>

      <ProviderNotice provider={providerQuery.data} ready={providerReady} />

      {terms.length > 1 && (
        <TermTabs
          terms={terms}
          activeId={activeTerm.id}
          disabled={operationPending}
          onSelect={(id) => {
            setActiveTermId(id);
            setReviewAll(false);
            setNotificationSearch('');
          }}
          onRemove={removeTerm}
        />
      )}

      {(sentCount > 0 || failedCount > 0) && (
        <SendResultBanner
          sent={sentCount}
          failed={failedCount}
          total={terms.length}
          onNew={startNewSend}
        />
      )}

      <div className="overflow-hidden rounded-xl border border-b24-border bg-surface shadow-sm">
        {!reviewAll && (
          <div className="grid grid-cols-3 border-b border-b24-border bg-b24-bg/45">
            <StepButton number={1} label="Colaborador" current={activeTerm.step} available onClick={() => updateTerm(activeTerm.id, { step: 1 })} />
            <StepButton number={2} label="Equipamentos" current={activeTerm.step} available={employeeComplete} onClick={() => updateTerm(activeTerm.id, { step: 2 })} />
            <StepButton number={3} label="Revisar e enviar" current={activeTerm.step} available={employeeComplete && equipmentComplete} onClick={() => updateTerm(activeTerm.id, { step: 3 })} />
          </div>
        )}

        <div className="p-4 sm:p-5">
          {reviewAll ? (
            <TermsReview
              terms={terms}
              providerReady={providerReady}
              providerLocal={Boolean(providerQuery.data?.local)}
              pending={operationPending}
              allPrepared={allPrepared}
              onBack={() => setReviewAll(false)}
              onEdit={(term) => {
                setActiveTermId(term.id);
                setReviewAll(false);
                updateTerm(term.id, { step: termEmployeeComplete(term) ? 3 : 1 });
              }}
              onPrepare={prepareAll}
              onSend={() => sendTerms()}
              onRetry={retryFailedTerms}
              onOpenPreview={openPreview}
              onOpenConversation={openConversation}
            />
          ) : activeTerm.step === 1 ? (
            <div>
              <SectionTitle icon={UserRound} title="Dados do colaborador" description="Selecione o colaborador; e-mail e departamento vêm automaticamente do Bitrix24." />
              <div className="grid gap-4 md:grid-cols-2">
                <EmployeePicker employees={employees} value={activeTerm.employeeId} onSelect={selectEmployee} />
                <Field label="CPF" required value={activeTerm.cpf} onChange={(value) => invalidateDocument(activeTerm.id, { cpf: formatCpf(value) })} inputMode="numeric" placeholder="000.000.000-00" maxLength={14} />
                <Field label="E-mail" value={activeTerm.email} readOnly placeholder="Preenchido pelo Bitrix24" />
                <Field label="Departamento" value={activeTerm.department} readOnly hint={departmentHint} placeholder="Não informado no Bitrix24" />
              </div>
              <StepFooter>
                <span />
                <NextButton disabled={!employeeComplete} onClick={() => updateTerm(activeTerm.id, { step: 2 })}>Continuar</NextButton>
              </StepFooter>
            </div>
          ) : activeTerm.step === 2 ? (
            <div>
              <SectionTitle icon={Package} title="Equipamentos" description="Informe ao menos a quantidade e a descrição de cada item." />
              <div className="grid gap-2.5">
                {activeTerm.equipment.map((item, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-b24-border bg-b24-bg/35 p-3 sm:grid-cols-2 xl:grid-cols-[70px_1.5fr_1fr_1fr_1fr_38px]">
                    <input required aria-label="Quantidade obrigatória" title="Quantidade" type="number" min={1} className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.quantity} onChange={(event) => updateEquipment(index, 'quantity', Number(event.target.value))} />
                    <input required aria-label="Descrição obrigatória" placeholder="Modelo ou descrição *" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.description} onChange={(event) => updateEquipment(index, 'description', event.target.value)} />
                    <input aria-label="Número de série" placeholder="Número de série" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.serialNumber} onChange={(event) => updateEquipment(index, 'serialNumber', event.target.value)} />
                    <input aria-label="Patrimônio" placeholder="Patrimônio" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.assetTag} onChange={(event) => updateEquipment(index, 'assetTag', event.target.value)} />
                    <input aria-label="Acessórios" placeholder="Acessórios" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.accessories} onChange={(event) => updateEquipment(index, 'accessories', event.target.value)} />
                    <button type="button" disabled={activeTerm.equipment.length === 1} onClick={() => invalidateDocument(activeTerm.id, { equipment: activeTerm.equipment.filter((_, itemIndex) => itemIndex !== index) })} className="focus-ring grid min-h-9 place-items-center rounded text-coral hover:bg-red-50 disabled:opacity-30" title="Remover"><Trash2 size={17} /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => invalidateDocument(activeTerm.id, { equipment: [...activeTerm.equipment, emptyEquipment()] })} className="focus-ring mt-3 inline-flex items-center gap-2 rounded-lg border border-b24-border px-3 py-2 text-sm font-medium text-steel hover:bg-sky-50 hover:text-b24-blue-dark"><Plus size={16} /> Adicionar equipamento</button>
              <StepFooter>
                <BackButton onClick={() => updateTerm(activeTerm.id, { step: 1 })} />
                <NextButton disabled={!equipmentComplete} onClick={() => updateTerm(activeTerm.id, { step: 3 })}>Revisar</NextButton>
              </StepFooter>
            </div>
          ) : (
            <div>
              <SectionTitle icon={Eye} title="Revisão e envio" description="Confira o resumo, gere a prévia e envie ao colaborador." />
              <div className="grid gap-3 md:grid-cols-2">
                <SummaryCard title="Colaborador" lines={[activeTerm.name, activeTerm.cpf, activeTerm.email, activeTerm.department]} onEdit={() => updateTerm(activeTerm.id, { step: 1 })} />
                <SummaryCard title={`Equipamentos (${activeTerm.equipment.length})`} lines={activeTerm.equipment.map((item) => `${item.quantity}× ${item.description}${item.assetTag ? ` · Patrimônio ${item.assetTag}` : ''}`)} onEdit={() => updateTerm(activeTerm.id, { step: 2 })} />
              </div>

              <NotificationPicker
                employees={employees}
                selectedIds={activeTerm.notificationIds}
                search={notificationSearch}
                onSearch={setNotificationSearch}
                onToggle={(id) => invalidateDocument(activeTerm.id, {
                  notificationIds: activeTerm.notificationIds.includes(id)
                    ? activeTerm.notificationIds.filter((item) => item !== id)
                    : [...activeTerm.notificationIds, id]
                })}
                onRemove={(id) => invalidateDocument(activeTerm.id, {
                  notificationIds: activeTerm.notificationIds.filter((item) => item !== id)
                })}
              />

              {(activeTerm.prepareError || activeTerm.sendError) && (
                <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-coral">
                  {activeTerm.prepareError || activeTerm.sendError}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-b24-border pt-4">
                <BackButton onClick={() => updateTerm(activeTerm.id, { step: 2 })} />
                <button disabled={activeTerm.prepareStatus === 'pending' || flowLocked} onClick={() => prepareTerm(activeTerm.id)} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-b24-blue px-4 py-2 text-sm font-semibold text-b24-blue-dark hover:bg-sky-50 disabled:opacity-50"><Eye size={16} /> {activeTerm.prepareStatus === 'pending' ? 'Preparando...' : activeTerm.previewUrl ? 'Atualizar prévia' : 'Gerar prévia'}</button>
                {activeTerm.previewUrl && <button type="button" disabled={activeTerm.prepareStatus === 'pending'} onClick={() => openPreview(activeTerm)} className="focus-ring inline-flex items-center gap-2 rounded-lg border border-mint px-4 py-2 text-sm font-semibold text-mint hover:bg-emerald-50 disabled:opacity-50"><ExternalLink size={15} /> Visualizar PDF</button>}
                {terms.length === 1 ? (
                  <button disabled={!activeTerm.draftId || !activeTerm.previewUrl || !providerReady || operationPending || activeTerm.sendStatus === 'success'} onClick={() => sendTerms([activeTerm])} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-b24-blue px-4 py-2 text-sm font-semibold text-white hover:bg-b24-blue-dark disabled:opacity-50" title={!providerReady ? providerSetupMessage(providerQuery.data) : undefined}><Send size={16} /> {activeTerm.sendStatus === 'pending' ? 'Enviando...' : 'Enviar termo'}</button>
                ) : (
                  <button disabled={!allComplete || operationPending} onClick={() => setReviewAll(true)} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-b24-blue px-4 py-2 text-sm font-semibold text-white hover:bg-b24-blue-dark disabled:opacity-50" title={!allComplete ? 'Complete os termos sinalizados acima' : undefined}><ChevronRight size={16} /> Revisar {terms.length} termos</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function termEmployeeComplete(term: TermFormState) {
  return Boolean(term.employeeId && term.name.trim() && term.cpf.replace(/\D/g, '').length === 11);
}

function termEquipmentComplete(term: TermFormState) {
  return term.equipment.every((item) => item.quantity >= 1 && item.description.trim());
}

function termComplete(term: TermFormState) {
  return termEmployeeComplete(term) && termEquipmentComplete(term);
}

function TermTabs({ terms, activeId, disabled, onSelect, onRemove }: {
  terms: TermFormState[];
  activeId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onRemove: (term: TermFormState) => void;
}) {
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Termos deste envio">
      {terms.map((term, index) => {
        const active = term.id === activeId;
        const label = term.name ? term.name.split(/\s+/)[0] : `Termo ${index + 1}`;
        return (
          <div key={term.id} className={`flex shrink-0 items-center rounded-full border ${active ? 'border-b24-blue bg-sky-50 text-b24-blue-dark' : 'border-b24-border bg-surface text-steel'}`}>
            <button type="button" disabled={disabled} onClick={() => onSelect(term.id)} className="focus-ring inline-flex items-center gap-1.5 rounded-l-full py-1.5 pl-3 pr-2 text-xs font-semibold disabled:opacity-60">
              <TermStatusIcon term={term} />
              <span className="max-w-28 truncate">{label}</span>
            </button>
            <button type="button" disabled={disabled || term.sendStatus === 'success'} onClick={() => onRemove(term)} aria-label={`Remover ${label}`} className="focus-ring mr-1 grid h-6 w-6 place-items-center rounded-full hover:bg-red-50 hover:text-coral disabled:opacity-35"><X size={12} /></button>
          </div>
        );
      })}
    </div>
  );
}

function TermStatusIcon({ term }: { term: TermFormState }) {
  if (term.sendStatus === 'pending' || term.prepareStatus === 'pending') return <LoaderCircle size={13} className="animate-spin" />;
  if (term.sendStatus === 'success') return <Check size={13} className="text-mint" />;
  if (term.sendStatus === 'error' || term.prepareStatus === 'error') return <AlertCircle size={13} className="text-coral" />;
  if (term.previewUrl) return <Check size={13} />;
  return <span className={`h-1.5 w-1.5 rounded-full ${termComplete(term) ? 'bg-b24-blue' : 'bg-zinc-300'}`} />;
}

function TermsReview({ terms, providerReady, providerLocal, pending, allPrepared, onBack, onEdit, onPrepare, onSend, onRetry, onOpenPreview, onOpenConversation }: {
  terms: TermFormState[];
  providerReady: boolean;
  providerLocal: boolean;
  pending: boolean;
  allPrepared: boolean;
  onBack: () => void;
  onEdit: (term: TermFormState) => void;
  onPrepare: () => void;
  onSend: () => void;
  onRetry: () => void;
  onOpenPreview: (term: TermFormState) => void;
  onOpenConversation: (term: TermFormState) => void;
}) {
  const failed = terms.filter((term) => term.sendStatus === 'error').length;
  const sent = terms.filter((term) => term.sendStatus === 'success').length;
  return (
    <div>
      <SectionTitle icon={Eye} title="Revisão do envio" description="Cada colaborador receberá seu próprio documento e terá acompanhamento individual." />
      <div className="divide-y divide-b24-border overflow-hidden rounded-lg border border-b24-border">
        {terms.map((term, index) => (
          <div key={term.id} className="grid gap-2 bg-surface px-3 py-3 sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-b24-bg text-xs font-semibold text-steel">{index + 1}</span>
            <div className="min-w-0">
              <strong className="block truncate text-sm text-ink">{term.name || 'Colaborador não informado'}</strong>
              <span className="block truncate text-xs text-steel">{term.equipment.length} {term.equipment.length === 1 ? 'equipamento' : 'equipamentos'} · {termStatusLabel(term)}</span>
              {(term.prepareError || term.sendError) && <span className="mt-1 block text-xs text-coral">{term.sendError || term.prepareError}</span>}
            </div>
            <div className="flex items-center gap-1.5 sm:justify-end">
              {term.sendStatus !== 'success' && term.previewUrl && <button type="button" disabled={pending} onClick={() => onOpenPreview(term)} aria-label={`Visualizar PDF de ${term.name}`} className="focus-ring rounded p-2 text-b24-blue-dark hover:bg-sky-50 disabled:opacity-50" title="Visualizar PDF"><Eye size={15} /></button>}
              {!providerLocal && term.sendStatus === 'success' && <button type="button" onClick={() => onOpenConversation(term)} aria-label={`Abrir conversa de ${term.name} no Bitrix24`} className="focus-ring rounded p-2 text-b24-blue-dark hover:bg-sky-50" title="Abrir conversa no Bitrix24"><ExternalLink size={15} /></button>}
              {providerLocal && term.localSigningUrl && <a href={term.localSigningUrl} target="_blank" rel="noreferrer" className="focus-ring rounded p-2 text-b24-blue-dark hover:bg-sky-50" title="Abrir assinatura"><Eye size={15} /></a>}
              {term.sendStatus !== 'success' && <button type="button" disabled={pending} onClick={() => onEdit(term)} className="focus-ring rounded p-2 text-steel hover:bg-b24-bg" title="Editar termo"><Pencil size={15} /></button>}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-b24-border pt-4">
        {!sent && <BackButton onClick={onBack} />}
        {!allPrepared && !sent && <button type="button" disabled={pending} onClick={onPrepare} className="focus-ring inline-flex items-center gap-2 rounded-lg border border-b24-blue px-4 py-2 text-sm font-semibold text-b24-blue-dark hover:bg-sky-50 disabled:opacity-50"><Eye size={16} /> {pending ? 'Preparando...' : `Preparar ${terms.length} termos`}</button>}
        {failed > 0 && <button type="button" disabled={pending} onClick={onRetry} className="focus-ring inline-flex items-center gap-2 rounded-lg border border-coral px-4 py-2 text-sm font-semibold text-coral hover:bg-red-50 disabled:opacity-50"><RotateCcw size={16} /> {pending ? 'Tentando novamente...' : `Tentar novamente (${failed})`}</button>}
        {allPrepared && sent < terms.length && failed === 0 && <button type="button" disabled={!providerReady || pending} onClick={onSend} className="focus-ring inline-flex items-center gap-2 rounded-lg bg-b24-blue px-4 py-2 text-sm font-semibold text-white hover:bg-b24-blue-dark disabled:opacity-50"><Send size={16} /> {pending ? 'Enviando...' : `Enviar ${terms.length} termos`}</button>}
      </div>
    </div>
  );
}

function termStatusLabel(term: TermFormState) {
  if (term.sendStatus === 'success') return 'Enviado';
  if (term.sendStatus === 'error') return 'Falha no envio';
  if (term.sendStatus === 'pending') return 'Enviando';
  if (term.prepareStatus === 'pending') return 'Preparando PDF';
  if (term.prepareStatus === 'error') return 'Falha na preparação';
  if (term.previewUrl) return 'Pronto para enviar';
  return termComplete(term) ? 'Pronto para preparar' : 'Preenchimento pendente';
}

function SendResultBanner({ sent, failed, total, onNew }: {
  sent: number;
  failed: number;
  total: number;
  onNew: () => void;
}) {
  const complete = sent === total;
  return (
    <div role="status" className={`mb-3 flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm ${complete ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <span className="flex-1">
        <strong>{complete ? 'Envio concluído.' : 'Envio concluído parcialmente.'}</strong>{' '}
        {sent} de {total} {total === 1 ? 'termo foi enviado' : 'termos foram enviados'}{failed ? `; ${failed} precisa${failed === 1 ? '' : 'm'} de nova tentativa.` : '.'}
      </span>
      {complete && <button type="button" onClick={onNew} className="focus-ring rounded-lg border border-emerald-300 bg-surface px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">Novo envio</button>}
    </div>
  );
}

function ProviderNotice({ provider, ready }: { provider?: ProviderStatus; ready: boolean }) {
  if (!provider?.local && ready) return <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900"><strong>Assinatura no FortaDocs.</strong> O colaborador recebe no chat um link pessoal que abre a assinatura dentro do Bitrix24.</div>;
  if (provider?.local) return <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Modo local: envio e assinatura simulados; nenhuma mensagem real será enviada.</div>;
  if (!ready) return <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><strong>Envio indisponível.</strong> {providerSetupMessage(provider)} A prévia do PDF continua disponível.</div>;
  return null;
}

function providerSetupMessage(provider?: ProviderStatus) {
  if (!provider?.reason) return 'Confirme os escopos im e placement do aplicativo Bitrix24.';
  return provider.reason;
}

function StepButton({ number, label, current, available, onClick }: {
  number: Step;
  label: string;
  current: Step;
  available: boolean;
  onClick: () => void;
}) {
  const active = number === current;
  const complete = number < current;
  return <button type="button" disabled={!available} onClick={onClick} aria-current={active ? 'step' : undefined} className={`focus-ring flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-semibold transition sm:text-sm ${active ? 'border-b24-blue bg-surface text-b24-blue-dark' : 'border-transparent text-steel hover:bg-surface/70'} disabled:cursor-not-allowed disabled:opacity-60`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${active || complete ? 'bg-b24-blue text-white' : 'bg-zinc-200 text-steel'}`}>{complete ? <Check size={12} /> : number}</span><span className="truncate">{label}</span></button>;
}

function SectionTitle({ icon: Icon, title, description }: {
  icon: typeof UserRound;
  title: string;
  description: string;
}) {
  return <div className="mb-4 flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-50 text-b24-blue-dark"><Icon size={17} /></span><div><h2 className="font-semibold text-ink">{title}</h2><p className="mt-0.5 text-xs text-steel">{description}</p></div></div>;
}

function StepFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex items-center justify-between border-t border-b24-border pt-4">{children}</div>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="focus-ring inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-steel hover:bg-b24-bg"><ChevronLeft size={16} /> Voltar</button>;
}

function NextButton({ children, disabled, onClick }: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return <button type="button" disabled={disabled} onClick={onClick} className="focus-ring inline-flex items-center gap-1 rounded-lg bg-b24-blue px-4 py-2 text-sm font-semibold text-white hover:bg-b24-blue-dark disabled:cursor-not-allowed disabled:opacity-60">{children} <ChevronRight size={16} /></button>;
}

function SummaryCard({ title, lines, onEdit }: {
  title: string;
  lines: string[];
  onEdit: () => void;
}) {
  return <article className="rounded-lg border border-b24-border bg-b24-bg/35 p-3.5"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-ink">{title}</h3><button type="button" onClick={onEdit} className="focus-ring rounded p-1 text-b24-blue-dark hover:bg-sky-100" title="Editar"><Pencil size={15} /></button></div><div className="space-y-1">{lines.map((line, index) => <p key={`${line}-${index}`} className="truncate text-xs text-steel" title={line}>{line || '-'}</p>)}</div></article>;
}

function EmployeePicker({ employees, value, onSelect }: {
  employees: BitrixEmployee[];
  value: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const container = useRef<HTMLDivElement>(null);
  const selected = employees.find((employee) => employee.ID === value);
  const selectedName = selected
    ? [selected.NAME, selected.LAST_NAME].filter(Boolean).join(' ') || `Usuário ${selected.ID}`
    : '';
  const normalized = normalizeText(search);
  const visible = employees.filter((employee) =>
    !normalized || normalizeText(
      `${employee.NAME || ''} ${employee.LAST_NAME || ''} ${employee.EMAIL || ''} ${employee.ID}`
    ).includes(normalized)
  ).slice(0, 10);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={container} className="relative grid gap-1 text-sm text-steel">
      <span>Colaborador</span>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => { if (!open) setSearch(''); setOpen((current) => !current); }} className="focus-ring flex min-w-0 items-center justify-between gap-2 rounded border border-zinc-300 bg-surface px-3 py-2 text-left text-ink">
        <span className={`truncate ${selectedName ? '' : 'text-zinc-400'}`}>{selectedName || 'Selecione um colaborador'}</span>
        <ChevronDown size={16} className={`shrink-0 text-steel transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-b24-border bg-surface p-2 shadow-lg">
          <label className="flex h-8 items-center gap-2 rounded border border-zinc-300 px-2">
            <Search size={14} className="shrink-0 text-steel" />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }} placeholder="Pesquisar nome, e-mail ou ID" className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none" />
          </label>
          <div role="listbox" className="mt-1 max-h-52 overflow-y-auto">
            {visible.map((employee) => {
              const employeeName = [employee.NAME, employee.LAST_NAME].filter(Boolean).join(' ') || `Usuário ${employee.ID}`;
              return <button type="button" role="option" aria-selected={employee.ID === value} key={employee.ID} onClick={() => { onSelect(employee.ID); setSearch(''); setOpen(false); }} className="focus-ring flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-sky-50"><span className="min-w-0 flex-1"><strong className="block truncate text-xs font-medium text-ink">{employeeName}</strong><span className="block truncate text-[11px] text-zinc-400">{employee.EMAIL || `ID ${employee.ID}`}</span></span>{employee.ID === value && <Check size={14} className="shrink-0 text-b24-blue-dark" />}</button>;
            })}
            {!visible.length && <p className="px-2 py-4 text-center text-xs text-steel">Nenhum colaborador encontrado.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationPicker({ employees, selectedIds, search, onSearch, onToggle, onRemove }: {
  employees: BitrixEmployee[];
  selectedIds: string[];
  search: string;
  onSearch: (value: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const normalized = normalizeText(search);
  const visible = employees.filter((employee) =>
    !normalized || normalizeText(
      `${employee.NAME || ''} ${employee.LAST_NAME || ''} ${employee.EMAIL || ''} ${employee.ID}`
    ).includes(normalized)
  ).slice(0, 20);
  const selected = selectedIds
    .map((id) => employees.find((employee) => employee.ID === id))
    .filter((employee): employee is BitrixEmployee => Boolean(employee));
  return (
    <section className="mt-3 rounded-lg border border-b24-border bg-b24-bg/30 p-3">
      <div className="flex items-start gap-2">
        <Bell size={17} className="mt-0.5 shrink-0 text-b24-blue-dark" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">Notificar sobre este termo</h3>
          <p className="text-xs text-steel">Opcional. Os selecionados serão avisados no envio e na conclusão.</p>
        </div>
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-b24-blue-dark">{selectedIds.length}</span>
      </div>
      {!!selected.length && <div className="mt-3 flex flex-wrap gap-1.5">{selected.map((employee) => {
        const name = [employee.NAME, employee.LAST_NAME].filter(Boolean).join(' ');
        return <span key={employee.ID} className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-surface py-1 pl-2.5 pr-1.5 text-xs text-ink">{name}<button type="button" onClick={() => onRemove(employee.ID)} aria-label={`Remover ${name}`} className="rounded-full p-0.5 text-steel hover:bg-red-50 hover:text-coral"><X size={12} /></button></span>;
      })}</div>}
      <label className="mt-3 flex items-center gap-2 rounded border border-b24-border bg-surface px-3 py-2">
        <Search size={15} className="text-steel" />
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Pesquisar usuário ativo do Bitrix24" className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none" />
      </label>
      <div className="mt-2 max-h-36 overflow-y-auto rounded border border-b24-border bg-surface">
        {visible.map((employee) => {
          const name = [employee.NAME, employee.LAST_NAME].filter(Boolean).join(' ') || `Usuário ${employee.ID}`;
          return <label key={employee.ID} className="flex cursor-pointer items-center gap-2 border-b border-b24-border/70 px-3 py-2 text-xs last:border-0 hover:bg-sky-50"><input type="checkbox" checked={selectedIds.includes(employee.ID)} onChange={() => onToggle(employee.ID)} className="h-4 w-4 accent-b24-blue" /><span className="min-w-0 flex-1"><strong className="block truncate font-medium text-ink">{name}</strong><span className="block truncate text-zinc-400">{employee.EMAIL || `ID ${employee.ID}`}</span></span></label>;
        })}
        {!visible.length && <p className="px-3 py-4 text-center text-xs text-steel">Nenhum usuário encontrado.</p>}
      </div>
    </section>
  );
}

function Field({ label, value, onChange, type = 'text', readOnly = false, required = false, hint, inputMode, placeholder, maxLength }: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  readOnly?: boolean;
  required?: boolean;
  hint?: string;
  inputMode?: 'numeric';
  placeholder?: string;
  maxLength?: number;
}) {
  return <label className="grid gap-1 text-sm text-steel"><span>{label} {required && <strong className="text-coral">*</strong>}</span><input required={required} type={type} inputMode={inputMode} placeholder={placeholder} readOnly={readOnly} maxLength={maxLength} className="focus-ring min-w-0 rounded border border-zinc-300 px-3 py-2 text-ink read-only:bg-zinc-100" value={value} onChange={(event) => onChange?.(event.target.value)} />{hint && <span className="text-xs text-coral">{hint}</span>}</label>;
}

function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}
