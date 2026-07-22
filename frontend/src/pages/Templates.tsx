import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Download, FileUp, Power } from 'lucide-react';
import { api } from '../services/api';
import { formatDate } from '../utils/format';

interface TemplateVersion {
  id: string;
  versao: string;
  descricao?: string;
  sourceSha256?: string;
  sourceStoragePath?: string;
  isDefault: boolean;
  ativo: boolean;
  createdAt: string;
}

interface TemplateFamily {
  id: string;
  nome: string;
  descricao?: string;
  ativo: boolean;
  versions: TemplateVersion[];
}

export function Templates({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient();
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [makeDefault, setMakeDefault] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const { data = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get<TemplateFamily[]>('/templates')).data
  });

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      if (templateId) form.append('templateId', templateId);
      if (!templateId) form.append('name', name);
      form.append('version', version);
      form.append('description', description);
      form.append('makeDefault', String(makeDefault));
      if (file) form.append('file', file);
      return api.post('/templates/upload', form);
    },
    onSuccess: () => {
      setVersion('');
      setDescription('');
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    }
  });
  const setDefault = useMutation({
    mutationFn: (versionId: string) => api.put(`/templates/versions/${versionId}/default`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] })
  });
  const toggle = useMutation({
    mutationFn: (item: TemplateVersion) => api.patch(`/templates/versions/${item.id}`, { active: !item.ativo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] })
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    upload.mutate();
  }

  async function download(versionId: string) {
    const { data: result } = await api.get<{ url: string }>(`/templates/versions/${versionId}/source`);
    window.open(result.url, '_blank', 'noopener,noreferrer');
  }

  const canSubmit = Boolean(file && version.trim() && (templateId || name.trim()));

  return (
    <section>
      {embedded ? <div className="mb-4"><h2 className="font-semibold text-ink">Modelos de termo</h2><p className="mt-1 text-sm text-steel">Gerencie versões sem apagar o histórico dos documentos.</p></div> : <><h1 className="mb-2 text-2xl font-bold text-ink">Modelos de termo</h1><p className="mb-6 text-sm text-steel">Envie novas versões sem apagar as anteriores. A versão padrão será usada somente nos próximos termos.</p></>}

      <form onSubmit={submit} className="mb-6 rounded border border-zinc-200 bg-white p-4 sm:p-5">
        <h2 className="font-semibold text-ink">Adicionar DOCX</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="grid gap-1 text-sm text-steel">Tipo de termo
            <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} className="min-w-0 rounded border border-zinc-300 px-3 py-2 text-ink">
              <option value="">Criar novo tipo</option>
              {data.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
            </select>
          </label>
          {!templateId && <Field label="Nome do novo tipo" value={name} onChange={setName} placeholder="Ex.: Termo de Responsabilidade" />}
          <Field label="Versão" value={version} onChange={setVersion} placeholder="Ex.: 1.0" />
          <Field label="Descrição" value={description} onChange={setDescription} placeholder="Resumo das alterações" />
          <label className="grid gap-1 text-sm text-steel">Arquivo DOCX
            <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] || null)} className="min-w-0 rounded border border-zinc-300 bg-white px-3 py-2 text-ink" />
          </label>
          <label className="flex items-center gap-2 self-end rounded bg-zinc-50 px-3 py-2 text-sm text-steel">
            <input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} className="h-4 w-4 accent-emerald-600" />
            Usar como padrão nos próximos termos
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button disabled={!canSubmit || upload.isPending} className="inline-flex items-center gap-2 rounded bg-mint px-4 py-2 font-semibold text-white disabled:opacity-50">
            <FileUp size={18} /> {upload.isPending ? 'Validando e enviando...' : 'Enviar e validar DOCX'}
          </button>
          {upload.isSuccess && <p role="status" className="text-sm font-medium text-emerald-700">Modelo validado e versionado com sucesso.</p>}
          {upload.isError && <p role="alert" className="text-sm font-medium text-red-700">{apiError(upload.error)}</p>}
        </div>
        <details className="mt-4 rounded bg-zinc-50 px-3 py-2 text-sm text-steel">
          <summary className="cursor-pointer font-medium text-ink">Campos aceitos no DOCX</summary>
          <p className="mt-2">Use o modelo atual como base. Os campos de colaborador e a tabela de equipamentos são preenchidos automaticamente antes da geração do PDF.</p>
          <code className="mt-2 block break-words text-xs">{'{employeeName} {cpf} {city} {day} {month} {year} {assetTags} {#equipments} {item} {quantity} {description} {serialLine} {assetLine} {accessories} {/equipments}'}</code>
        </details>
      </form>

      <div className="grid gap-5">
        {data.map((template) => (
          <article key={template.id} className="overflow-hidden rounded border border-zinc-200 bg-white">
            <div className="border-b border-zinc-200 px-4 py-3 sm:px-5">
              <h2 className="font-semibold text-ink">{template.nome}</h2>
              {template.descricao && <p className="mt-1 text-sm text-steel">{template.descricao}</p>}
            </div>
            <div className="divide-y divide-zinc-200">
              {template.versions.map((item) => (
                <div key={item.id} className="grid gap-3 px-4 py-3 text-sm sm:px-5 lg:grid-cols-[120px_minmax(0,1fr)_160px_auto] lg:items-center">
                  <div className="flex items-center gap-2">
                    <strong className="text-ink">v{item.versao}</strong>
                    {item.isDefault && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Padrão</span>}
                  </div>
                  <div className="min-w-0 text-steel">
                    <p>{item.descricao || 'Sem descrição'}</p>
                    <p className="mt-1 text-xs text-zinc-500">Adicionado em {formatDate(item.createdAt)} · {item.ativo ? 'Ativo' : 'Inativo'}</p>
                  </div>
                  <span className="truncate font-mono text-xs text-zinc-500" title={item.sourceSha256}>{item.sourceSha256?.slice(0, 16) || 'Arquivo legado'}</span>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {item.sourceStoragePath && <Action title="Baixar DOCX" onClick={() => download(item.id)}><Download size={16} /></Action>}
                    {!item.isDefault && item.ativo && <Action title="Definir como padrão" onClick={() => setDefault.mutate(item.id)}><CheckCircle2 size={16} /></Action>}
                    {!item.isDefault && <Action title={item.ativo ? 'Desativar' : 'Ativar'} onClick={() => toggle.mutate(item)}><Power size={16} /></Action>}
                  </div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="grid gap-1 text-sm text-steel">{label}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 rounded border border-zinc-300 px-3 py-2 text-ink" /></label>;
}

function Action({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" title={title} onClick={onClick} className="rounded border border-zinc-300 p-2 text-steel hover:bg-zinc-100">{children}</button>;
}

function apiError(error: unknown) {
  const body = (error as { response?: { data?: { message?: string | string[] | { message?: string | string[] } } } })?.response?.data?.message;
  const message = typeof body === 'object' && !Array.isArray(body) ? body.message : body;
  return Array.isArray(message) ? message.join(', ') : message || 'Não foi possível importar o DOCX.';
}
