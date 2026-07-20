import { useQuery } from '@tanstack/react-query';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { FileCheck2, Send, TriangleAlert, Users } from 'lucide-react';
import { api } from '../services/api';
import { DashboardSummary } from '../types';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../utils/format';

const colors = ['#2a9d8f', '#e9a03b', '#3b82f6', '#d85c4a', '#6366f1', '#71717a'];

export function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/dashboard/summary')).data
  });

  const cards = [
    { label: 'Colaboradores', value: data?.totalEmployees || 0, icon: Users },
    { label: 'Pendentes', value: data?.pending || 0, icon: TriangleAlert },
    { label: 'Enviados', value: data?.sent || 0, icon: Send },
    { label: 'Assinados', value: data?.signed || 0, icon: FileCheck2 },
    { label: 'Erros', value: data?.errors || 0, icon: TriangleAlert }
  ];

  return (
    <section>
      <h1 className="mb-6 text-2xl font-bold text-ink">Dashboard</h1>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between text-steel">
              <span className="text-sm font-medium">{card.label}</span>
              <card.icon size={18} />
            </div>
            <div className="text-3xl font-bold text-ink">{card.value}</div>
          </div>
        ))}
      </div>
      <div className="mb-6 grid gap-6 xl:grid-cols-[360px_1fr]">
        <div className="rounded border border-zinc-200 bg-white p-4">
          <h2 className="mb-4 text-base font-semibold text-ink">Status</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data?.byStatus || []} dataKey="total" nameKey="status" outerRadius={90}>
                  {(data?.byStatus || []).map((entry, index) => (
                    <Cell key={entry.status} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-base font-semibold text-ink">Últimas assinaturas</h2>
          <DataTable
            data={data?.latestSignatures || []}
            columns={[
              { header: 'Colaborador', cell: ({ row }) => row.original.employee?.nome || '-' },
              { header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
              { header: 'Documento', accessorKey: 'bitrixDocumentId' },
              { header: 'Atualizado em', cell: ({ row }) => formatDate(row.original.updatedAt) }
            ]}
          />
        </div>
      </div>
      <h2 className="mb-3 text-base font-semibold text-ink">Eventos recentes do Bitrix24</h2>
      {isLoading ? <p>Carregando...</p> : (
        <DataTable
          data={data?.latestEvents || []}
          columns={[
            { header: 'Evento', accessorKey: 'eventType' },
            { header: 'Processado', cell: ({ row }) => (row.original.processed ? 'Sim' : 'Não') },
            { header: 'Erro', accessorKey: 'error' },
            { header: 'Recebido em', cell: ({ row }) => formatDate(row.original.createdAt) }
          ]}
        />
      )}
    </section>
  );
}
