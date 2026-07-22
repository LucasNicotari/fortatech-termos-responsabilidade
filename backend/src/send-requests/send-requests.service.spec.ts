import { SendRequestsService } from './send-requests.service';

describe('SendRequestsService', () => {
  it('retorna erro de negocio quando o CPF pertence a outro colaborador', async () => {
    const prisma = {
      employee: {
        findUnique: jest.fn(({ where }: { where: Record<string, string> }) => {
          if (where.cpf) return Promise.resolve({ id: 'employee-existing', bitrixId: '9001' });
          return Promise.resolve(null);
        })
      }
    };
    const service = new SendRequestsService(
      prisma as never,
      { getUser: jest.fn().mockResolvedValue({ ID: '9002' }) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await expect(service.createDraft({
      employeeBitrixUserId: 9002,
      employeeEmail: 'colaborador02@example.test',
      employeeName: 'Colaborador Teste 02',
      cpf: '529.982.247-25',
      departamento: 'Tecnologia',
      equipment: [{ quantity: 1, description: 'Notebook local' }]
    })).rejects.toThrow('O CPF informado ja pertence a outro colaborador');
  });
});
