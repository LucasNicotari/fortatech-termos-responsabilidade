import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { api } from '../services/api';
import { IntegrationLog } from '../types';
import { DataTable } from '../components/DataTable';
import { formatDate } from '../utils/format';

export function Logs() {
  const [selected, setSelected] = useState<IntegrationLog | null>(null);
  const { data = [] } = useQuery({
    queryKey: ['logs'],
    queryFn: async () => (await api.get<IntegrationLog[]>('/logs')).data
  });

  return (
    <section>
      <h1 className="mb-6 text-2xl font-bold text-ink">Logs</h1>
      <DataTable
        data={data}
        columns={[
          { header: 'Tipo', accessorKey: 'type' },
          { header: 'Origem', accessorKey: 'source' },
          { header: 'Endpoint', accessorKey: 'endpoint' },
          { header: 'Data', cell: ({ row }) => formatDate(row.original.createdAt) },
          { header: 'Status', cell: ({ row }) => (row.original.error ? 'Erro' : 'OK') },
          {
            header: 'Detalhes',
            cell: ({ row }) => (
              <button title="Ver payload" onClick={() => setSelected(row.original)} className="focus-ring rounded border border-zinc-300 p-2 text-steel hover:bg-zinc-100">
                <Eye size={16} />
              </button>
            )
          }
        ]}
      />
      {selected && (
        <div className="fixed inset-0 grid place-items-center bg-black/30 p-4" onClick={() => setSelected(null)}>
          <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded border border-zinc-200 bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <h2 className="mb-3 text-lg font-semibold text-ink">{selected.type}</h2>
            <pre className="whitespace-pre-wrap rounded bg-zinc-950 p-4 text-xs text-zinc-100">{JSON.stringify(selected, null, 2)}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
