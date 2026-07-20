import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '../services/api';
import { Template } from '../types';
import { DataTable } from '../components/DataTable';

type FormData = Pick<Template, 'nome' | 'versao' | 'descricao'>;

export function Templates() {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset } = useForm<FormData>();
  const { data = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => (await api.get<Template[]>('/templates')).data
  });
  const create = useMutation({
    mutationFn: (payload: FormData) => api.post('/templates', payload),
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    }
  });
  const toggle = useMutation({
    mutationFn: (template: Template) => api.patch(`/templates/${template.id}`, { ativo: !template.ativo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] })
  });

  return (
    <section>
      <h1 className="mb-6 text-2xl font-bold text-ink">Templates</h1>
      <form onSubmit={handleSubmit((values) => create.mutate(values))} className="mb-6 grid gap-3 rounded border border-zinc-200 bg-white p-4 md:grid-cols-4">
        <input className="focus-ring rounded border border-zinc-300 px-3 py-2" placeholder="Nome" {...register('nome', { required: true })} />
        <input className="focus-ring rounded border border-zinc-300 px-3 py-2" placeholder="Versão" {...register('versao', { required: true })} />
        <input className="focus-ring rounded border border-zinc-300 px-3 py-2" placeholder="Descrição" {...register('descricao')} />
        <button className="focus-ring rounded bg-mint px-4 py-2 font-semibold text-white">Cadastrar</button>
      </form>
      <DataTable
        data={data}
        columns={[
          { header: 'Nome', accessorKey: 'nome' },
          { header: 'Versão', accessorKey: 'versao' },
          { header: 'Origem', cell: () => 'DOCX versionado' },
          { header: 'Ativo', cell: ({ row }) => (row.original.ativo ? 'Sim' : 'Não') },
          {
            header: 'Ações',
            cell: ({ row }) => (
              <button onClick={() => toggle.mutate(row.original)} className="focus-ring rounded border border-zinc-300 px-3 py-1 text-sm text-steel hover:bg-zinc-100">
                {row.original.ativo ? 'Desativar' : 'Ativar'}
              </button>
            )
          }
        ]}
      />
    </section>
  );
}
