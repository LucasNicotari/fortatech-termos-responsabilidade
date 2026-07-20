import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw, RotateCcw } from 'lucide-react';
import { api } from '../services/api';
import { Signature } from '../types';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../utils/format';

export function Signatures() {
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ['signatures'],
    queryFn: async () => (await api.get<Signature[]>('/signatures')).data
  });
  const sync = useMutation({
    mutationFn: (id?: string) => api.post('/signatures/sync', id ? { signatureId: id } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signatures'] })
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/signatures/${id}/retry`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signatures'] })
  });
  const retryArchive = useMutation({
    mutationFn: (id: string) => api.post(`/signatures/${id}/archive/retry`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['signatures'] })
  });

  async function download(id: string) {
    const { data: file } = await api.get<{ url: string }>(`/signatures/${id}/file`);
    window.open(file.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Assinaturas</h1>
        <button onClick={() => sync.mutate(undefined)} className="focus-ring inline-flex items-center gap-2 rounded bg-mint px-4 py-2 font-semibold text-white">
          <RefreshCw size={18} />
          Sincronizar
        </button>
      </div>
      <DataTable
        data={data}
        columns={[
          { header: 'Colaborador', cell: ({ row }) => row.original.employee?.nome || '-' },
          { header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
          { header: 'Documento Bitrix', accessorKey: 'bitrixDocumentUid' },
          { header: 'Etapa Bitrix', accessorKey: 'bitrixStage' },
          { header: 'Envio', cell: ({ row }) => formatDate(row.original.sentAt) },
          { header: 'Assinatura', cell: ({ row }) => formatDate(row.original.signedAt) },
          { header: 'Backup', cell: ({ row }) => <StatusBadge status={row.original.archiveStatus || 'NOT_REQUIRED'} /> },
          {
            header: 'Ações',
            cell: ({ row }) => (
              <div className="flex gap-2">
                <button title="Sincronizar" onClick={() => sync.mutate(row.original.id)} className="focus-ring rounded border border-zinc-300 p-2 text-steel hover:bg-zinc-100">
                  <RefreshCw size={16} />
                </button>
                <button title="Tentar novamente" onClick={() => retry.mutate(row.original.id)} className="focus-ring rounded border border-zinc-300 p-2 text-steel hover:bg-zinc-100">
                  <RotateCcw size={16} />
                </button>
                {row.original.archiveStatus === 'FAILED' && (
                  <button title={row.original.archiveError || 'Tentar backup novamente'} onClick={() => retryArchive.mutate(row.original.id)} className="focus-ring rounded border border-zinc-300 p-2 text-coral hover:bg-zinc-100">
                    <RotateCcw size={16} />
                  </button>
                )}
                {row.original.archiveStatus === 'ARCHIVED' && (
                  <button title="Baixar backup" onClick={() => download(row.original.id)} className="focus-ring rounded border border-zinc-300 p-2 text-mint hover:bg-zinc-100">
                    <Download size={16} />
                  </button>
                )}
              </div>
            )
          }
        ]}
      />
    </section>
  );
}
