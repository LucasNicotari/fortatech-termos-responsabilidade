import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Eye, Pencil, Plus, Send, Trash2 } from 'lucide-react';
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

const emptyEquipment = (): Equipment => ({ quantity: 1, description: '', serialNumber: '', assetTag: '', accessories: '' });

export function SendRequests() {
  const queryClient = useQueryClient();
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

  const create = useMutation({
    mutationFn: () => api.post<SendRequest>('/send-requests', {
      employeeBitrixUserId: Number(employeeId), employeeName: name, employeeEmail: email,
      cpf, cargo: jobTitle, departamento: department, equipment
    }),
    onSuccess: ({ data }) => {
      setDraftId(data.id);
      setPreviewUrl(null);
      setSentMessage('');
      queryClient.invalidateQueries({ queryKey: ['send-requests'] });
    }
  });
  const preview = useMutation({
    mutationFn: (id: string) => api.post<{ previewUrl: string }>(`/send-requests/${id}/preview`),
    onSuccess: ({ data }) => {
      setPreviewUrl(data.previewUrl);
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
      setSentMessage(providerQuery.data?.local
        ? 'Envio local simulado. Nenhum e-mail foi enviado; abra abaixo a tela que o colaborador receberia.'
        : 'Termo enviado. O colaborador receberá o link de assinatura por e-mail.');
      setLocalSigningUrl(providerQuery.data?.local && localToken ? `/assinar/${encodeURIComponent(localToken)}` : '');
      queryClient.invalidateQueries({ queryKey: ['send-requests'] });
      queryClient.invalidateQueries({ queryKey: ['signatures'] });
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
  const error = create.error || preview.error || send.error;
  const cpfComplete = cpf.replace(/\D/g, '').length === 11;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const equipmentComplete = equipment.every((item) => item.quantity >= 1 && item.description.trim());
  const requiredFieldsComplete = Boolean(employeeId && name.trim() && emailValid && cpfComplete && department.trim() && equipmentComplete);

  return (
    <section>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-ink">Novo termo</h1><p className="mt-1 text-sm text-steel">Selecione o colaborador, informe o CPF e os equipamentos, revise o PDF e envie.</p></div>
        <Link to="/terms" className="focus-ring rounded border border-b24-border bg-white px-3 py-2 text-sm font-medium text-steel hover:bg-sky-50 hover:text-b24-blue-dark">Ver todos os termos</Link>
      </header>

      {!providerReady && (
        <div className="mb-5 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Envio em modo de preparação.</strong>{' '}
          Configure o token e o segredo de webhook da ZapSign Sandbox para liberar o botão de envio. A prévia do PDF já pode ser testada normalmente.
        </div>
      )}
      {providerQuery.data?.local && (
        <div className="mb-5 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Modo local: envio e assinatura são simulados; nenhum e-mail real será enviado.
        </div>
      )}
      {providerQuery.data?.environment === 'sandbox' && providerReady && !providerQuery.data.local && (
        <div className="mb-5 rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          Ambiente de homologação ativo: os documentos de teste não possuem validade jurídica.
        </div>
      )}

      <div className="mb-8 rounded border border-zinc-200 bg-white p-4 sm:p-5">
        <p className="mb-4 text-xs text-zinc-500"><span className="font-bold text-coral">*</span> Campos obrigatórios para gerar e enviar o termo.</p>
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
            <span className="text-xs text-zinc-500">Nome completo do perfil Bitrix24; use o lápis somente para corrigir.</span>
          </label>
          <Field label="CPF" required value={cpf} onChange={(value) => { setCpf(formatCpf(value)); resetDocumentState(); }} inputMode="numeric" placeholder="000.000.000-00" maxLength={14} />
          <label className="grid gap-1 text-sm text-steel">
            <span>E-mail <strong className="text-coral">*</strong></span>
            <span className="flex min-w-0 gap-2">
              <input type="email" readOnly={!editingEmail} className="focus-ring min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-ink read-only:bg-zinc-100" value={email} onChange={(event) => { setEmail(event.target.value); resetDocumentState(); }} />
              <EditButton editing={editingEmail} disabled={!employeeId} label="e-mail" onClick={() => setEditingEmail((value) => !value)} />
            </span>
            <span className="text-xs text-zinc-500">O link de assinatura será enviado para este endereço.</span>
          </label>
          <Field label="Departamento" required value={department} readOnly hint={department ? 'Preenchido pelo perfil do Bitrix24' : employeeId ? 'Departamento não localizado no perfil ou sem permissão de leitura.' : 'Preenchido pelo perfil do Bitrix24'} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">Equipamentos e acessórios</h2>
          <button type="button" onClick={() => { setEquipment((items) => [...items, emptyEquipment()]); resetDocumentState(); }} className="focus-ring inline-flex items-center gap-2 rounded border border-zinc-300 px-3 py-2 text-sm text-steel">
            <Plus size={16} /> Adicionar item
          </button>
        </div>
        <div className="mt-3 grid gap-3">
          {equipment.map((item, index) => (
            <div key={index} className="grid gap-2 rounded bg-zinc-50 p-3 sm:grid-cols-2 xl:grid-cols-[80px_1.5fr_1fr_1fr_1fr_auto]">
              <input required aria-label="Quantidade obrigatória" title="Quantidade obrigatória" type="number" min={1} className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.quantity} onChange={(event) => updateEquipment(index, 'quantity', Number(event.target.value))} />
              <input required aria-label="Modelo ou descrição obrigatória" placeholder="Modelo ou descrição *" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.description} onChange={(event) => updateEquipment(index, 'description', event.target.value)} />
              <input aria-label="Número de série" placeholder="Número de série" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.serialNumber} onChange={(event) => updateEquipment(index, 'serialNumber', event.target.value)} />
              <input aria-label="Patrimônio" placeholder="Patrimônio" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.assetTag} onChange={(event) => updateEquipment(index, 'assetTag', event.target.value)} />
              <input aria-label="Acessórios" placeholder="Acessórios" className="min-w-0 rounded border border-zinc-300 px-2 py-2" value={item.accessories} onChange={(event) => updateEquipment(index, 'accessories', event.target.value)} />
              <button disabled={equipment.length === 1} onClick={() => { setEquipment((items) => items.filter((_, itemIndex) => itemIndex !== index)); resetDocumentState(); }} className="rounded p-2 text-coral disabled:opacity-30" title="Remover"><Trash2 size={18} /></button>
            </div>
          ))}
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-coral">{apiError(error)}</p>}
        {sentMessage && (
          <div role="status" className="mt-4 flex flex-wrap items-center gap-3 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            <span className="flex-1">{sentMessage}</span>
            {localSigningUrl && (
              <a href={localSigningUrl} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-2 rounded bg-b24-blue px-3 py-2 font-semibold text-white hover:bg-b24-blue-dark">
                <ExternalLink size={16} /> Abrir como colaborador
              </a>
            )}
          </div>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
          <button disabled={!requiredFieldsComplete || create.isPending} onClick={() => create.mutate()} className="focus-ring rounded bg-mint px-4 py-2 font-semibold text-white disabled:opacity-50">
            {create.isPending ? 'Salvando...' : '1. Salvar rascunho'}
          </button>
          <button disabled={!draftId || preview.isPending} onClick={() => draftId && preview.mutate(draftId)} className="focus-ring inline-flex items-center justify-center gap-2 rounded border border-zinc-300 px-4 py-2 text-steel disabled:opacity-50">
            <Eye size={17} /> {preview.isPending ? 'Gerando...' : '2. Gerar prévia'}
          </button>
          {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="focus-ring rounded border border-mint px-4 py-2 text-center text-mint">3. Abrir e revisar PDF</a>}
          <button disabled={!draftId || !previewUrl || !providerReady || send.isPending} onClick={() => draftId && send.mutate(draftId)} className="focus-ring inline-flex items-center justify-center gap-2 rounded bg-ink px-4 py-2 font-semibold text-white disabled:opacity-50" title={!providerReady ? 'Configure a ZapSign Sandbox para liberar o envio' : undefined}>
            <Send size={17} /> {send.isPending
              ? 'Enviando...'
              : providerQuery.data?.local ? '4. Simular envio' : '4. Enviar ao colaborador'}
          </button>
        </div>
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
  return <label className="grid gap-1 text-sm text-steel"><span>{label} {required && <strong className="text-coral">*</strong>}</span><input required={required} type={type} inputMode={inputMode} placeholder={placeholder} readOnly={readOnly} maxLength={maxLength} className="focus-ring min-w-0 rounded border border-zinc-300 px-3 py-2 text-ink read-only:bg-zinc-100" value={value} onChange={(event) => onChange?.(event.target.value)} />{hint && <span className="text-xs text-zinc-500">{hint}</span>}</label>;
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
