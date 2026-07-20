import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { BitrixEmployee } from '../types';

interface SigningConfig {
  companyCrmId: number;
  companyProviderUid: string;
  companySignerUserId: number;
  responsibleUserId: number;
  regionDocumentType: string;
  safeAccessConfirmed: boolean;
}

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'RH' | 'TI';
  active: boolean;
  bitrixUserId?: string;
}

interface SigningProvider {
  uid: string;
  name: string;
  code: string;
  expires?: string | null;
}

export function Settings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<SigningConfig>({
    companyCrmId: 0, companyProviderUid: '', companySignerUserId: 0,
    responsibleUserId: 0, regionDocumentType: '12.999', safeAccessConfirmed: false
  });
  const [newUserId, setNewUserId] = useState('');
  const [newRole, setNewRole] = useState<'RH' | 'TI'>('RH');

  const configQuery = useQuery({
    queryKey: ['bitrix-config'],
    queryFn: async () => (await api.get<SigningConfig>('/integrations/bitrix/config')).data,
    retry: false,
    enabled: user?.role === 'ADMIN'
  });
  const { data: employees = [] } = useQuery({
    queryKey: ['bitrix-employees'],
    queryFn: async () => (await api.get<BitrixEmployee[]>('/bitrix/employees')).data,
    enabled: user?.role === 'ADMIN'
  });
  const { data: appUsers = [] } = useQuery({
    queryKey: ['app-users'],
    queryFn: async () => (await api.get<AppUser[]>('/users')).data,
    enabled: user?.role === 'ADMIN'
  });
  const { data: providers = [], isFetching: loadingProviders } = useQuery({
    queryKey: ['bitrix-providers', config.companyCrmId],
    queryFn: async () => (await api.post<SigningProvider[]>('/integrations/bitrix/providers', {
      companyCrmId: config.companyCrmId
    })).data,
    enabled: user?.role === 'ADMIN' && config.companyCrmId > 0
  });

  useEffect(() => { if (configQuery.data) setConfig(configQuery.data); }, [configQuery.data]);

  const save = useMutation({
    mutationFn: () => api.put('/integrations/bitrix/config', config),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bitrix-config'] })
  });
  const authorize = useMutation({
    mutationFn: () => api.post('/users', { bitrixUserId: Number(newUserId), role: newRole }),
    onSuccess: () => {
      setNewUserId('');
      queryClient.invalidateQueries({ queryKey: ['app-users'] });
    }
  });

  if (user?.role !== 'ADMIN') {
    return <section><h1 className="mb-3 text-2xl font-bold text-ink">Configurações</h1><p className="text-steel">Somente administradores podem alterar a integração.</p></section>;
  }

  return (
    <section>
      <h1 className="mb-6 text-2xl font-bold text-ink">Configurações</h1>
      <div className="mb-6 rounded border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-ink">Assinatura Bitrix24</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <NumberField label="ID da empresa CRM" value={config.companyCrmId} onChange={(value) => setConfig({ ...config, companyCrmId: value })} />
          <label className="grid gap-1 text-sm text-steel">Provedor
            <select value={config.companyProviderUid} onChange={(event) => setConfig({ ...config, companyProviderUid: event.target.value })} className="rounded border border-zinc-300 px-3 py-2 text-ink">
              <option value="">{loadingProviders ? 'Carregando...' : 'Selecione'}</option>
              {providers.map((provider) => <option key={provider.uid} value={provider.uid}>{provider.name} ({provider.code})</option>)}
            </select>
          </label>
          <UserField label="Representante" value={config.companySignerUserId} employees={employees} onChange={(value) => setConfig({ ...config, companySignerUserId: value })} />
          <UserField label="Responsável" value={config.responsibleUserId} employees={employees} onChange={(value) => setConfig({ ...config, responsibleUserId: value })} />
          <TextField label="Tipo regional" value={config.regionDocumentType} onChange={(value) => setConfig({ ...config, regionDocumentType: value })} />
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm text-steel">
          <input
            type="checkbox"
            checked={config.safeAccessConfirmed}
            onChange={(event) => setConfig({ ...config, safeAccessConfirmed: event.target.checked })}
            className="mt-1"
          />
          Confirmo que o usuário instalador e o responsável possuem acesso aos documentos no Cofre da empresa do Bitrix24.
        </label>
        <button onClick={() => save.mutate()} disabled={save.isPending} className="mt-4 rounded bg-mint px-4 py-2 font-semibold text-white disabled:opacity-50">Salvar integração</button>
      </div>

      <div className="rounded border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 font-semibold text-ink">Usuários autorizados</h2>
        <div className="mb-4 flex flex-wrap gap-3">
          <select value={newUserId} onChange={(event) => setNewUserId(event.target.value)} className="rounded border border-zinc-300 px-3 py-2">
            <option value="">Selecione no Bitrix24</option>
            {employees.map((employee) => <option key={employee.ID} value={employee.ID}>{[employee.NAME, employee.LAST_NAME].filter(Boolean).join(' ')}</option>)}
          </select>
          <select value={newRole} onChange={(event) => setNewRole(event.target.value as 'RH' | 'TI')} className="rounded border border-zinc-300 px-3 py-2">
            <option value="RH">RH</option><option value="TI">TI</option>
          </select>
          <button disabled={!newUserId || authorize.isPending} onClick={() => authorize.mutate()} className="rounded bg-ink px-4 py-2 text-white disabled:opacity-50">Autorizar</button>
        </div>
        <div className="grid gap-2">
          {appUsers.map((appUser) => (
            <div key={appUser.id} className="flex items-center justify-between rounded bg-zinc-50 px-3 py-2 text-sm">
              <span><strong>{appUser.name}</strong> · {appUser.email}</span>
              <span>{appUser.role} · {appUser.active ? 'Ativo' : 'Inativo'}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-sm text-steel">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="rounded border border-zinc-300 px-3 py-2 text-ink" /></label>;
}
function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="grid gap-1 text-sm text-steel">{label}<input type="number" value={value || ''} onChange={(event) => onChange(Number(event.target.value))} className="rounded border border-zinc-300 px-3 py-2 text-ink" /></label>;
}
function UserField({ label, value, employees, onChange }: { label: string; value: number; employees: BitrixEmployee[]; onChange: (value: number) => void }) {
  return <label className="grid gap-1 text-sm text-steel">{label}<select value={value || ''} onChange={(event) => onChange(Number(event.target.value))} className="rounded border border-zinc-300 px-3 py-2 text-ink"><option value="">Selecione</option>{employees.map((employee) => <option key={employee.ID} value={employee.ID}>{[employee.NAME, employee.LAST_NAME].filter(Boolean).join(' ')}</option>)}</select></label>;
}
