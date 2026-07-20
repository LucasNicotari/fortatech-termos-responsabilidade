import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '../services/api';
import { Employee } from '../types';
import { DataTable } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate } from '../utils/format';

type FormData = Pick<Employee, 'nome' | 'email' | 'cargo' | 'departamento' | 'empresa'>;

export function Employees() {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<FormData>();
  const { data = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: async () => (await api.get<Employee[]>('/employees')).data
  });
  const create = useMutation({
    mutationFn: (payload: FormData) => api.post('/employees', payload),
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    }
  });

  return (
    <section>
      <h1 className="mb-6 text-2xl font-bold text-ink">Colaboradores</h1>
      <form onSubmit={handleSubmit((values) => create.mutate(values))} className="mb-6 grid gap-3 rounded border border-zinc-200 bg-white p-4 md:grid-cols-5">
        <input className="focus-ring rounded border border-zinc-300 px-3 py-2" placeholder="Nome" {...register('nome', { required: true })} />
        <input className="focus-ring rounded border border-zinc-300 px-3 py-2" placeholder="Email" {...register('email', { required: true })} />
        <input className="focus-ring rounded border border-zinc-300 px-3 py-2" placeholder="Cargo" {...register('cargo')} />
        <input className="focus-ring rounded border border-zinc-300 px-3 py-2" placeholder="Departamento" {...register('departamento')} />
        <button className="focus-ring rounded bg-mint px-4 py-2 font-semibold text-white">Adicionar</button>
      </form>
      <DataTable
        data={data}
        columns={[
          { header: 'Nome', accessorKey: 'nome' },
          { header: 'Email', accessorKey: 'email' },
          { header: 'Cargo', accessorKey: 'cargo' },
          { header: 'Departamento', accessorKey: 'departamento' },
          { header: 'Empresa', accessorKey: 'empresa' },
          { header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
          { header: 'Convite', cell: ({ row }) => <StatusBadge status={row.original.invitationStatus} /> },
          { header: 'Criado em', cell: ({ row }) => formatDate(row.original.createdAt) }
        ]}
      />
    </section>
  );
}
