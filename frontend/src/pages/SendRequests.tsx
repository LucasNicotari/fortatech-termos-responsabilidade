import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronLeft, ChevronRight, ExternalLink, Eye, Pencil, Plus, Send, Trash2, UserRound, Package } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { BitrixEmployee, Equipment, SendRequest } from '../types';

interface ProviderStatus {
  provider: 'zapsign';
  environment: 'sandbox' | 'production';
  configured: boolean;
  webhookConfigured: boolean;
  emailDelivery: boolean;
  signerCount: number;
  local?: boolean;
}

type Step = 1 | 2 | 3;

const emptyEquipment = (): Equipment => ({ quantity: 1, description: '', serialNumber: '', assetTag: '', accessories: '' });

export function SendRequests() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([emptyEquipment()]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState('');
  const [localSigningUrl, setLocalSigningUrl] = useState('');

  const { data: employees = [] } = useQuery({
    queryKey: ['bitrix-term-employees'],
    queryFn: async () => (await api.get<BitrixEmployee[]>('/bitrix/term-employees')).data
  });
  const providerQuery = useQuery({
    queryKey: ['signature-provider-status'],
    queryFn: async () => (await api.get<ProviderStatus>('/signature-provider/status')).data,
    retry: false
  });

  const prepare = useMutation({
    mutationFn: async () => {
      let requestId = draftId;
      if (!requestId) {
        const { data: request } = await api.post<SendRequest>('/send-requests', {
          employeeBitrixUserId: Number(employeeId), employeeName: name, employeeEmail: email,
          cpf, cargo: jobTitle, departamento: department, equipment
        });
        requestId = request.id;
      }
      const { data: preview } = await api.post<{ previewUrl: string }>(`/send-requests/${requestId}/preview`);
      return { requestId, previewUrl: preview.previewUrl };
    },
    onSuccess: ({ requestId, previewUrl: url }) => {
      setDraftId(requestId);
      setPreviewUrl(url);
      setSentMessage('');
      queryClient.invalidateQueries({ queryKey: ['send-requests'] });
    }
  });
  const send = useMutation({
    mutationFn: (id: string) => api.post<SendRequest>(`/send-requests/${id}/send`),
    onSuccess: ({ data }) => {
      const localToken = data.signatures?.[0]?.providerDocumentId;
      setDraftId(null);
      setPreviewUrl(null);
      setEmployeeId('');
      setName('');
      setEmail('');
      setJobTitle('');
      setDepartment('');
      setEditingName(false);
      setEditingEmail(false);
      setCpf('');
      setEquipment([emptyEquipment()]);
      setStep(1);
      setSentMessage(providerQuery.data?.local
        ? 'Envio local simulado. Nenhum e-mail foi enviado; abra a experiência do colaborador abaixo.'
        : 'Termo enviado. O colaborador receberá o link de assinatura por e-mail.');
      setLocalSigningUrl(providerQuery.data?.local && localToken ? `/assinar/${encodeURIComponent(localToken)}` : '');
      queryClient.invalidateQueries({ queryKey: ['send-requests'] });
      queryClient.invalidateQueries({ queryKey: ['signatures'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  });

  function selectEmployee(id: string) {
    setEmployeeId(id);
    const employee = employees.find((item) => item.ID === id);
    setName([employee?.NAME, employee?.LAST_NAME].filter(Boolean).join(' '));
    setEmail(employee?.EMAIL || '');
    setJobTitle(employee?.WORK_POSITION || '');
    setDepartment(employee?.DEPARTMENT_NAME || '');
    setEditingName(false);
    setEditingEmail(false);
    resetDocumentState();
  }

  function resetDocumentState() {
    setDraftId(null);
    setPreviewUrl(null);
    setSentMessage('');
    setLocalSigningUrl('');
  }

  function updateEquipment(index: number, field: keyof Equipment, value: string | number) {
    setEquipment((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
    resetDocumentState();
  }

  const providerReady = providerQuery.data?.configured && providerQuery.data?.webhookConfigured;
  const error = prepare.error || send.error;
  const cpfComplete = cpf.replace(/\D/g, '').length === 11;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const employeeComplete = Boolean(employeeId && name.trim() && emailValid && cpfComplete && department.trim());
  const equipmentComplete = equipment.every((item) => item.quantity >= 1 && item.description.trim());
  const selectedEmployee = employees.find((employee) => employee.ID === employeeId);
  const departmentHint = !employeeId || department
    ? undefined
    : selectedEmployee?.DEPARTMENT_LOOKUP_ERROR === 'MISSING_SCOPE'
      ? 'Adicione a permissão Estrutura da empresa (department) ao aplicativo Bitrix24 e reinstale-o.'
      : selectedEmployee?.DEPARTMENT_LOOKUP_ERROR === 'LOOKUP_FAILED'
        ? 'Não foi possível consultar a estrutura da empresa no Bitrix24.'
        : 'Departamento não localizado no perfil.';

  return (
    <section className="mx-auto max-w-[1280px]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Novo termo</h1><p className="mt-0.5 text-sm text-steel">Preencha em três etapas rápidas.</p></div>
        <Link to="/terms" className="focus-ring text-sm font-semibold text-b24-blue-dark hover:underline">Ver todos os termos</Link>
      </header>

      <ProviderNotice provider={providerQuery.data} ready={Boolean(providerReady)} />
      {sentMessage && <SuccessMessage message={sentMessage} localSigningUrl={localSigningUrl} />}

      <div className="overflow-hidden rounded-xl border border-b24-border bg-white shadow-sm">
        <div className="grid grid-cols-3 border-b border-b24-border bg-b24-bg/45">
          <StepButton number={1} label="Colaborador" current={step} available onClick={() => setStep(1)} />
          <StepButton number={2} label="Equipamentos" current={step} available={employeeComplete} onClick={() => setStep(2)} />
          <StepButton number={3} label="Revisar e enviar" current={step} available={employeeComplete && equipmentComplete} onClick={() => setStep(3)} />
        </div>

        <div className="p-4 sm:p-5">
          {step === 1 && (
            <div>
              <SectionTitle icon={UserRound} title="Dados do colaborador" description="Nome, e-mail e departamento vêm do perfil do Bitrix24." />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm text-steel">
                  <span>Colaborador <strong className="text-coral">*</strong></span>
                  <span className="flex min-w-0 gap-2">
                    {editingName ? (
                      <input autoFocus className="focus-ring min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-ink" value={name} onChange={(event) => { setName(event.target.value); resetDocumentState(); }} />
                    ) : (
                      <select className="focus-ring min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-ink" value={employeeId} onChange={(event) => selectEmployee(event.target.value)}>
                        <option value="">Selecione</option>
                        {employees.map((employee) => <option key={employee.ID} value={employee.ID}>{[employee.NAME, employee.LAST_NAME].filter(Boolean).join(' ')}</option>)}
                      </select>
                    )}
                    <EditButton editing={editingName} disabled={!employeeId} label="nome" onClick={() => setEditingName((value) => !value)} />
                  </span>
                </label>
                <Field label="CPF" required value={cpf} onChange={(value) => { setCpf(formatCpf(value)); resetDocumentState(); }} inputMode="numeric" placeholder="000.000.000-00" maxLength={14} />
                <label className="grid gap-1 text-sm text-steel">
                  <span>E-mail <strong className="text-coral">*</strong></span>
                  <span className="flex min-w-0 gap-2">
                    <input type="email" readOnly={!editingEmail} className="focus-ring min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-ink read-only:bg-zinc-100" value={email} onChange={(event) => { setEmail(event.target.value); resetDocumentState(); }} />
                    <EditButton editing={editingEmail} disabled={!employeeId} label="e-mail" onClick={() => setEditingEmail((value) => !value)} />
                  </span>
                </label>
                <Field label="Departamento" required value={department} readOnly hint={departmentHint} />
              </div>
              <StepFooter><span /><NextButton disabled={!employeeComplete} onClick={() => setStep(2)}>Continuar</NextButton></StepFooter>
            </div>
          )}

          {step === 2 && (
            <div>
              <SectionTitle icon={Package} title="Equipamentos" description="Informe ao menos a quantidade e a descrição de cada item." />
              <div className="grid gap-2.5">
                {equipment.map((item, index) => (
                  <div key={index} className="grid gap-2 rounded-lg border border-b24-border bg-b24-bg/35 p-3 sm:grid-cols-2 xl:grid-cols-[70px_1.5fr_1fr_1fr_1fr_38px]">
                    <input required aria-label="Quantidade obrigatória" title="Quantidade" type="number" min={1} className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.quantity} onChange={(event) => updateEquipment(index, 'quantity', Number(event.target.value))} />
                    <input required aria-label="Descrição obrigatória" placeholder="Modelo ou descrição *" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.description} onChange={(event) => updateEquipment(index, 'description', event.target.value)} />
                    <input aria-label="Número de série" placeholder="Número de série" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.serialNumber} onChange={(event) => updateEquipment(index, 'serialNumber', event.target.value)} />
                    <input aria-label="Patrimônio" placeholder="Patrimônio" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.assetTag} onChange={(event) => updateEquipment(index, 'assetTag', event.target.value)} />
                    <input aria-label="Acessórios" placeholder="Acessórios" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.accessories} onChange={(event) => updateEquipment(index, 'accessories', event.target.value)} />
                    <button type="button" disabled={equipment.length === 1} onClick={() => { setEquipment((items) => items.filter((_, itemIndex) => itemIndex !== index)); resetDocumentState(); }} className="focus-ring grid min-h-9 place-items-center rounded text-coral hover:bg-red-50 disabled:opacity-30" title="Remover"><Trash2 size={17} /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => { setEquipment((items) => [...items, emptyEquipment()]); resetDocumentState(); }} className="focus-ring mt-3 inline-flex items-center gap-2 rounded-lg border border-b24-border px-3 py-2 text-sm font-medium text-steel hover:bg-sky-50 hover:text-b24-blue-dark"><Plus size={16} /> Adicionar equipamento</button>
              <StepFooter><BackButton onClick={() => setStep(1)} /><NextButton disabled={!equipmentComplete} onClick={() => setStep(3)}>Revisar</NextButton></StepFooter>
            </div>
          )}

          {step === 3 && (
            <div>
              <SectionTitle icon={Eye} title="Revisão e envio" description="Confira o resumo, gere a prévia e envie ao colaborador." />
              <div className="grid gap-3 md:grid-cols-2">
                <SummaryCard title="Colaborador" lines={[name, cpf, email, department]} onEdit={() => setStep(1)} />
                <SummaryCard title={`Equipamentos (${equipment.length})`} lines={equipment.map((item) => `${item.quantity}× ${item.description}${item.assetTag ? ` · Patrimônio ${item.assetTag}` : ''}`)} onEdit={() => setStep(2)} />
              </div>

              {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-coral">{apiError(error)}</p>}
              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-b24-border pt-4">
                <BackButton onClick={() => setStep(2)} />
                <button disabled={prepare.isPending} onClick={() => prepare.mutate()} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-b24-blue px-4 py-2 text-sm font-semibold text-b24-blue-dark hover:bg-sky-50 disabled:opacity-50"><Eye size={16} /> {prepare.isPending ? 'Preparando...' : previewUrl ? 'Atualizar prévia' : 'Gerar prévia'}</button>
                {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-2 rounded-lg border border-mint px-4 py-2 text-sm font-semibold text-mint hover:bg-emerald-50"><ExternalLink size={15} /> Visualizar PDF</a>}
                <button disabled={!draftId || !previewUrl || !providerReady || send.isPending} onClick={() => draftId && send.mutate(draftId)} className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-b24-blue px-4 py-2 text-sm font-semibold text-white hover:bg-b24-blue-dark disabled:opacity-50" title={!providerReady ? providerSetupMessage(providerQuery.data) : undefined}><Send size={16} /> {send.isPending ? 'Enviando...' : providerQuery.data?.local ? 'Simular envio' : 'Enviar ao colaborador'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ProviderNotice({ provider, ready }: { provider?: ProviderStatus; ready: boolean }) {
  if (provider?.local) return <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Modo local: envio e assinatura simulados; nenhum e-mail real será enviado.</div>;
  if (provider?.environment === 'sandbox' && ready) return <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">Homologação ativa: documentos de teste sem validade jurídica.</div>;
  if (!ready) return <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><strong>Envio indisponível.</strong> {providerSetupMessage(provider)} A prévia do PDF continua disponível.</div>;
  return null;
}

function providerSetupMessage(provider?: ProviderStatus) {
  const missing = [
    !provider?.configured && 'ZAPSIGN_API_TOKEN',
    !provider?.webhookConfigured && 'ZAPSIGN_WEBHOOK_SECRET'
  ].filter(Boolean);
  return missing.length
    ? `Configure ${missing.join(' e ')} nos segredos do backend no Render.`
    : 'Conclua a configuração da ZapSign Sandbox no Render.';
}

function StepButton({ number, label, current, available, onClick }: { number: Step; label: string; current: Step; available: boolean; onClick: () => void }) {
  const active = number === current;
  const complete = number < current;
  return <button type="button" disabled={!available} onClick={onClick} aria-current={active ? 'step' : undefined} className={`focus-ring flex min-w-0 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-semibold transition sm:text-sm ${active ? 'border-b24-blue bg-white text-b24-blue-dark' : 'border-transparent text-steel hover:bg-white/70'} disabled:cursor-not-allowed disabled:opacity-45`}><span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${active || complete ? 'bg-b24-blue text-white' : 'bg-zinc-200 text-steel'}`}>{complete ? <Check size={12} /> : number}</span><span className="truncate">{label}</span></button>;
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof UserRound; title: string; description: string }) {
  return <div className="mb-4 flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sky-50 text-b24-blue-dark"><Icon size={17} /></span><div><h2 className="font-semibold text-ink">{title}</h2><p className="mt-0.5 text-xs text-steel">{description}</p></div></div>;
}

function StepFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex items-center justify-between border-t border-b24-border pt-4">{children}</div>;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="focus-ring inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-steel hover:bg-b24-bg"><ChevronLeft size={16} /> Voltar</button>;
}

function NextButton({ children, disabled, onClick }: { children: React.ReactNode; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="focus-ring inline-flex items-center gap-1 rounded-lg bg-b24-blue px-4 py-2 text-sm font-semibold text-white hover:bg-b24-blue-dark disabled:opacity-45">{children} <ChevronRight size={16} /></button>;
}

function SummaryCard({ title, lines, onEdit }: { title: string; lines: string[]; onEdit: () => void }) {
  return <article className="rounded-lg border border-b24-border bg-b24-bg/35 p-3.5"><div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-ink">{title}</h3><button type="button" onClick={onEdit} className="focus-ring rounded p-1 text-b24-blue-dark hover:bg-sky-100" title="Editar"><Pencil size={15} /></button></div><div className="space-y-1">{lines.map((line, index) => <p key={`${line}-${index}`} className="truncate text-xs text-steel" title={line}>{line || '-'}</p>)}</div></article>;
}

function SuccessMessage({ message, localSigningUrl }: { message: string; localSigningUrl: string }) {
  return <div role="status" className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><span className="flex-1">{message}</span>{localSigningUrl && <a href={localSigningUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-2 rounded bg-b24-blue px-3 py-2 font-semibold text-white"><ExternalLink size={16} /> Abrir como colaborador</a>}</div>;
}

function Field({ label, value, onChange, type = 'text', readOnly = false, required = false, hint, inputMode, placeholder, maxLength }: { label: string; value: string; onChange?: (value: string) => void; type?: string; readOnly?: boolean; required?: boolean; hint?: string; inputMode?: 'numeric'; placeholder?: string; maxLength?: number }) {
  return <label className="grid gap-1 text-sm text-steel"><span>{label} {required && <strong className="text-coral">*</strong>}</span><input required={required} type={type} inputMode={inputMode} placeholder={placeholder} readOnly={readOnly} maxLength={maxLength} className="focus-ring min-w-0 rounded border border-zinc-300 px-3 py-2 text-ink read-only:bg-zinc-100" value={value} onChange={(event) => onChange?.(event.target.value)} />{hint && <span className="text-xs text-coral">{hint}</span>}</label>;
}

function EditButton({ editing, disabled, label, onClick }: { editing: boolean; disabled: boolean; label: string; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-label={editing ? `Concluir edição de ${label}` : `Editar ${label}`} title={editing ? 'Concluir edição' : `Editar ${label}`} className="focus-ring shrink-0 rounded border border-zinc-300 px-3 text-steel hover:bg-zinc-100 disabled:opacity-40">{editing ? <Check size={18} /> : <Pencil size={18} />}</button>;
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function apiError(error: unknown) {
  const responseMessage = (error as { response?: { data?: { message?: string | { message?: string } } } })?.response?.data?.message;
  if (typeof responseMessage === 'string') return responseMessage;
  if (responseMessage && typeof responseMessage === 'object' && responseMessage.message) return responseMessage.message;
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
}
