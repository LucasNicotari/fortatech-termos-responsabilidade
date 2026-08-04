import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Download, FileText, FileUp, Power, X } from 'lucide-react';
import { api, apiErrorMessage } from '../services/api';
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
  const [showUpload, setShowUpload] = useState(false);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get<TemplateFamily[]>('/templates')).data
  });

  const currentFamily = data.find((template) => template.versions.some((item) => item.isDefault)) || data[0];
  const currentVersion = currentFamily?.versions.find((item) => item.isDefault);

  const upload = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      if (currentFamily) form.append('templateId', currentFamily.id);
      else form.append('name', name);
      form.append('version', version);
      form.append('description', description);
      form.append('makeDefault', 'true');
      if (file) form.append('file', file);
      return api.post('/templates/upload', form);
    },
    onSuccess: () => {
      setVersion('');
      setDescription('');
      setFile(null);
      setShowUpload(false);
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

  const canSubmit = Boolean(file && version.trim() && (currentFamily || name.trim()));

  if (isLoading) return <div className="h-48 animate-pulse rounded border border-b24-border bg-surface" />;

  return (
    <section>
      {!embedded && <div className="mb-5"><h1 className="text-2xl font-bold text-ink">Modelo do termo</h1><p className="mt-1 text-sm text-steel">Documento usado para gerar os próximos termos.</p></div>}

      <div className="overflow-hidden rounded border border-b24-border bg-surface">
        <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-sky-50 text-b24-blue-dark"><FileText size={19} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-steel">Modelo atual</p>
            <h2 className="truncate font-semibold text-ink">{currentFamily?.nome || 'Nenhum modelo configurado'}</h2>
            {currentVersion && <p className="mt-0.5 text-xs text-steel">Versão {currentVersion.versao} · adicionada em {formatDate(currentVersion.createdAt)}</p>}
          </div>
          {currentVersion?.sourceStoragePath && <button type="button" onClick={() => download(currentVersion.id)} className="focus-ring inline-flex items-center gap-2 rounded border border-b24-border px-3 py-2 text-sm font-medium text-steel hover:bg-zinc-50"><Download size={16} /> Baixar</button>}
          <button type="button" onClick={() => setShowUpload(true)} className="focus-ring inline-flex items-center gap-2 rounded bg-b24-blue px-3 py-2 text-sm font-semibold text-white hover:bg-b24-blue-dark"><FileUp size={16} /> {currentVersion ? 'Atualizar modelo' : 'Adicionar modelo'}</button>
        </div>
      </div>

      {showUpload && (
        <form onSubmit={submit} className="mt-4 rounded border border-b24-border bg-surface p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-semibold text-ink">Nova versão</h2><p className="mt-0.5 text-xs text-steel">A versão enviada será usada somente nos próximos termos.</p></div>
            <button type="button" onClick={() => setShowUpload(false)} aria-label="Fechar" className="focus-ring grid h-8 w-8 place-items-center rounded text-steel hover:bg-zinc-100"><X size={17} /></button>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {!currentFamily && <Field label="Nome do modelo" value={name} onChange={setName} placeholder="Termo de Responsabilidade" />}
            <Field label="Versão" value={version} onChange={setVersion} placeholder="Ex.: 1.1" />
            <Field label="Resumo da alteração" value={description} onChange={setDescription} placeholder="Opcional" />
            <label className="grid gap-1 text-sm text-steel">Arquivo DOCX
              <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setFile(event.target.files?.[0] || null)} className="min-w-0 rounded border border-b24-border bg-surface px-3 py-2 text-ink" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button disabled={!canSubmit || upload.isPending} className="focus-ring inline-flex items-center gap-2 rounded bg-b24-blue px-4 py-2 text-sm font-semibold text-white hover:bg-b24-blue-dark disabled:opacity-50"><FileUp size={16} /> {upload.isPending ? 'Validando...' : 'Enviar modelo'}</button>
            {upload.isError && <p role="alert" className="text-sm text-coral">{apiErrorMessage(upload.error, 'Não foi possível importar o DOCX.')}</p>}
          </div>
        </form>
      )}

      {data.some((template) => template.versions.length > 0) && (
        <details className="group mt-4 overflow-hidden rounded border border-b24-border bg-surface">
          <summary className="focus-ring flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-sm font-semibold text-ink sm:px-5">
            Versões anteriores <ChevronDown size={17} className="text-steel transition group-open:rotate-180" />
          </summary>
          <div className="divide-y divide-b24-border border-t border-b24-border">
            {data.flatMap((template) => template.versions.map((item) => ({ template, item }))).map(({ template, item }) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{template.nome} · versão {item.versao}{item.isDefault ? ' · atual' : ''}</p>
                  <p className="mt-0.5 truncate text-xs text-steel">{item.descricao || formatDate(item.createdAt)}</p>
                </div>
                {item.sourceStoragePath && <Action title="Baixar DOCX" onClick={() => download(item.id)}><Download size={16} /></Action>}
                {!item.isDefault && item.ativo && <Action title="Usar esta versão" onClick={() => setDefault.mutate(item.id)}><CheckCircle2 size={16} /></Action>}
                {!item.isDefault && <Action title={item.ativo ? 'Desativar' : 'Ativar'} onClick={() => toggle.mutate(item)}><Power size={16} /></Action>}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="grid gap-1 text-sm text-steel">{label}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="min-w-0 rounded border border-b24-border px-3 py-2 text-ink" /></label>;
}

function Action({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return <button type="button" title={title} aria-label={title} onClick={onClick} className="focus-ring grid h-8 w-8 place-items-center rounded text-steel hover:bg-zinc-100 hover:text-ink">{children}</button>;
}
