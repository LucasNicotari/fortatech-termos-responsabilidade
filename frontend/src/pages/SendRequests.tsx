import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus, Send, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { BitrixEmployee, Equipment, SendRequest } from '../types';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../utils/format';

const emptyEquipment = (): Equipment => ({ quantity: 1, description: '', serialNumber: '', assetTag: '', accessories: '' });

export function SendRequests() {
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [cargo, setCargo] = useState('');
  const [city, setCity] = useState('São Paulo');
  const [equipment, setEquipment] = useState<Equipment[]>([emptyEquipment()]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: requests = [] } = useQuery({
    queryKey: ['send-requests'],
    queryFn: async () => (await api.get<SendRequest[]>('/send-requests')).data
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['bitrix-employees'],
    queryFn: async () => (await api.get<BitrixEmployee[]>('/bitrix/employees')).data
  });

  const create = useMutation({
    mutationFn: () => api.post<SendRequest>('/send-requests', {
      employeeBitrixUserId: Number(employeeId), employeeName: name, employeeEmail: email,
      cpf, cargo: cargo || undefined, city, equipment
    }),
    onSuccess: ({ data }) => {
      setDraftId(data.id);
      setPreviewUrl(null);
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
    mutationFn: (id: string) => api.post(`/send-requests/${id}/send`),
    onSuccess: () => {
      setDraftId(null);
      setPreviewUrl(null);
      setCpf('');
      setEquipment([emptyEquipment()]);
      queryClient.invalidateQueries({ queryKey: ['send-requests'] });
      queryClient.invalidateQueries({ queryKey: ['signatures'] });
    }
  });

  function selectEmployee(id: string) {
    setEmployeeId(id);
    const employee = employees.find((item) => item.ID === id);
    setName([employee?.NAME, employee?.LAST_NAME].filter(Boolean).join(' '));
    setEmail(employee?.EMAIL || '');
    setCargo(employee?.WORK_POSITION || '');
    setDraftId(null);
    setPreviewUrl(null);
  }

  function updateEquipment(index: number, field: keyof Equipment, value: string | number) {
    setEquipment((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
    setDraftId(null);
    setPreviewUrl(null);
  }

  const error = create.error || preview.error || send.error;

  return (
    <section>
      <h1 className="mb-6 text-2xl font-bold text-ink">Novo termo</h1>
      <div className="mb-8 rounded border border-zinc-200 bg-white p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid gap-1 text-sm text-steel">
            Colaborador Bitrix24
            <select className="focus-ring rounded border border-zinc-300 px-3 py-2 text-ink" value={employeeId} onChange={(event) => selectEmployee(event.target.value)}>
              <option value="">Selecione</option>
              {employees.map((employee) => <option key={employee.ID} value={employee.ID}>{[employee.NAME, employee.LAST_NAME].filter(Boolean).join(' ')}</option>)}
            </select>
          </label>
          <Field label="Nome" value={name} onChange={setName} />
          <Field label="E-mail" value={email} onChange={setEmail} type="email" />
          <Field label="CPF" value={cpf} onChange={setCpf} />
          <Field label="Cargo" value={cargo} onChange={setCargo} />
          <Field label="Cidade" value={city} onChange={setCity} />
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="font-semibold text-ink">Equipamentos e acessórios</h2>
          <button type="button" onClick={() => setEquipment((items) => [...items, emptyEquipment()])} className="focus-ring inline-flex items-center gap-2 rounded border border-zinc-300 px-3 py-2 text-sm text-steel">
            <Plus size={16} /> Adicionar item
          </button>
        </div>
        <div className="mt-3 grid gap-3">
          {equipment.map((item, index) => (
            <div key={index} className="grid gap-2 rounded bg-zinc-50 p-3 md:grid-cols-[80px_1.5fr_1fr_1fr_1fr_auto]">
              <input aria-label="Quantidade" type="number" min={1} className="rounded border border-zinc-300 px-2 py-2" value={item.quantity} onChange={(event) => updateEquipment(index, 'quantity', Number(event.target.value))} />
              <input aria-label="Modelo ou descrição" placeholder="Modelo ou descrição" className="rounded border border-zinc-300 px-2 py-2" value={item.description} onChange={(event) => updateEquipment(index, 'description', event.target.value)} />
              <input aria-label="Número de série" placeholder="Número de série" className="rounded border border-zinc-300 px-2 py-2" value={item.serialNumber} onChange={(event) => updateEquipment(index, 'serialNumber', event.target.value)} />
              <input aria-label="Patrimônio" placeholder="Patrimônio" className="rounded border border-zinc-300 px-2 py-2" value={item.assetTag} onChange={(event) => updateEquipment(index, 'assetTag', event.target.value)} />
              <input aria-label="Acessórios" placeholder="Acessórios" className="rounded border border-zinc-300 px-2 py-2" value={item.accessories} onChange={(event) => updateEquipment(index, 'accessories', event.target.value)} />
              <button disabled={equipment.length === 1} onClick={() => setEquipment((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="rounded p-2 text-coral disabled:opacity-30" title="Remover"><Trash2 size={18} /></button>
            </div>
          ))}
        </div>

        {error && <p className="mt-4 text-sm text-coral">{(error as { message?: string }).message || 'Não foi possível concluir a operação.'}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={!employeeId || !name || !email || !cpf || equipment.some((item) => !item.description) || create.isPending} onClick={() => create.mutate()} className="focus-ring rounded bg-mint px-4 py-2 font-semibold text-white disabled:opacity-50">
            Salvar rascunho
          </button>
          <button disabled={!draftId || preview.isPending} onClick={() => draftId && preview.mutate(draftId)} className="focus-ring inline-flex items-center gap-2 rounded border border-zinc-300 px-4 py-2 text-steel disabled:opacity-50">
            <Eye size={17} /> Gerar prévia
          </button>
          {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer" className="focus-ring rounded border border-mint px-4 py-2 text-mint">Abrir PDF</a>}
          <button disabled={!draftId || !previewUrl || send.isPending} onClick={() => draftId && send.mutate(draftId)} className="focus-ring inline-flex items-center gap-2 rounded bg-ink px-4 py-2 font-semibold text-white disabled:opacity-50">
            <Send size={17} /> Enviar para assinatura
          </button>
        </div>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-ink">Histórico de solicitações</h2>
      <DataTable data={requests} columns={[
        { header: 'Colaborador', cell: ({ row }) => row.original.employee?.nome || '-' },
        { header: 'Arquivo', accessorKey: 'documentFileName' },
        { header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
        { header: 'Criado', cell: ({ row }) => formatDate(row.original.createdAt) },
        { header: 'Enviado', cell: ({ row }) => formatDate(row.original.sentAt) },
        { header: 'Falha', accessorKey: 'failureReason' }
      ]} />
    </section>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="grid gap-1 text-sm text-steel">{label}<input type={type} className="focus-ring rounded border border-zinc-300 px-3 py-2 text-ink" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}
