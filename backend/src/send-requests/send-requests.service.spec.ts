import { ArchiveStatus, SendRequestStatus, SignatureStatus } from '@prisma/client';
import {
  responsibilityTermFileName,
  normalizeResponsibilityCpf,
  SendRequestsService,
  signingInvitationMessage,
  signingUrlForCurrentUser
} from './send-requests.service';

describe('SendRequestsService', () => {
  it('pagina o historico de forma estavel sem expor o CPF', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'request-3' },
      { id: 'request-2' },
      { id: 'request-1' }
    ]);
    const service = new SendRequestsService(
      { sendRequest: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await expect(service.findPage({
      limit: 2,
      cursor: undefined,
      search: 'Lucas',
      filter: 'ALL'
    })).resolves.toEqual({
      items: [{ id: 'request-3' }, { id: 'request-2' }],
      nextCursor: 'request-2'
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 3,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: expect.objectContaining({
        employee: {
          select: { id: true, bitrixId: true, nome: true, email: true }
        }
      })
    }));
  });

  it('gera o nome do PDF com o primeiro e o ultimo nome do colaborador', () => {
    expect(responsibilityTermFileName('Lucas Nicotari Maffei')).toBe('TR.Lucas_Maffei.pdf');
    expect(responsibilityTermFileName('João D\'Angelo')).toBe('TR.Joao_DAngelo.pdf');
    expect(responsibilityTermFileName('  Nicoly  ')).toBe('TR.Nicoly.pdf');
  });

  it('normaliza CPF valido e rejeita sequencias ou digitos incorretos', () => {
    expect(normalizeResponsibilityCpf('52998224725')).toBe('529.982.247-25');
    expect(normalizeResponsibilityCpf('111.111.111-11')).toBeNull();
    expect(normalizeResponsibilityCpf('529.982.247-24')).toBeNull();
  });

  it('expoe o convite somente quando o operador tambem e o colaborador', () => {
    const url = 'https://portal.bitrix24.com/marketplace/view/app/?params[signing]=secret';
    expect(signingUrlForCurrentUser(url, 8465, '8465')).toBe(url);
    expect(signingUrlForCurrentUser(url, 8465, '8243')).toBeUndefined();
    expect(signingUrlForCurrentUser(url, 8465)).toBeUndefined();
  });

  it('gera a mensagem formal com o nome do usuario Bitrix24 e o convite pessoal', () => {
    const message = signingInvitationMessage(
      'Lucas Nicotari Maffei',
      'https://portal.bitrix24.com/marketplace/view/app/?params[signing]=secret'
    );

    expect(message).toContain('Prezado(a), [B]Lucas Nicotari Maffei[/B]');
    expect(message).toContain('➡️ Revisar e assinar documento');
    expect(message).toContain('pessoal, intransferível');
    expect(message).toContain('[B]7 dias[/B]');
  });

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
      {
        getUserWithDepartment: jest.fn().mockResolvedValue({
          ID: '9002',
          NAME: 'Colaborador',
          LAST_NAME: 'Teste 02',
          EMAIL: 'colaborador02@example.test',
          WORK_POSITION: 'Analista',
          DEPARTMENT_NAME: 'Tecnologia'
        })
      } as never,
      {} as never,
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

  it('remove da lista, revoga o convite pendente e preserva a auditoria', async () => {
    const transaction = {
      signingInvitation: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      signature: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      signatureEvent: { create: jest.fn().mockResolvedValue({}) },
      sendRequest: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'request-1',
          status: SendRequestStatus.SENT,
          removedAt: null,
          employee: { nome: 'Colaborador Teste' },
          signatures: [{
            id: 'signature-1',
            status: SignatureStatus.SENT,
            archiveStatus: ArchiveStatus.NOT_REQUIRED,
            invitation: { id: 'invitation-1' }
          }]
        }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) }
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction))
    };
    const service = new SendRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await expect(service.removeFromHistory('request-1', 'user-1')).resolves.toEqual({
      id: 'request-1',
      removed: true,
      completedDocumentPreserved: false,
      activeInvitationsRevoked: 1
    });
    expect(transaction.signingInvitation.updateMany).toHaveBeenCalled();
    expect(transaction.signature.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: SignatureStatus.CANCELED })
    }));
    expect(transaction.signatureEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'REMOVED_FROM_HISTORY' })
    }));
    expect(transaction.sendRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        removedByUserId: 'user-1',
        status: SendRequestStatus.CANCELED
      })
    }));
    expect(transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REMOVED_FROM_HISTORY' })
    }));
  });

  it('remove um lote de forma atomica e ignora IDs ausentes', async () => {
    const transaction = {
      signingInvitation: { updateMany: jest.fn() },
      signature: { updateMany: jest.fn(), findUnique: jest.fn() },
      signatureEvent: { create: jest.fn() },
      sendRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'draft-1',
            status: SendRequestStatus.DRAFT,
            removedAt: null,
            employee: { nome: 'Ana' },
            signatures: []
          },
          {
            id: 'finished-1',
            status: SendRequestStatus.COMPLETED,
            removedAt: null,
            employee: { nome: 'Bruno' },
            signatures: [{
              id: 'signature-finished',
              status: SignatureStatus.FINISHED,
              archiveStatus: ArchiveStatus.ARCHIVED,
              invitation: { id: 'invitation-finished' }
            }]
          }
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      auditEvent: { create: jest.fn().mockResolvedValue({}) }
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction))
    };
    const service = new SendRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await expect(service.bulkRemoveFromHistory(
      ['missing-1', 'finished-1', 'draft-1'],
      'user-1'
    )).resolves.toEqual(expect.objectContaining({
      requestedCount: 3,
      removedCount: 2,
      ignoredCount: 1,
      completedDocumentsPreserved: 1,
      removedIds: ['draft-1', 'finished-1'],
      ignoredIds: ['missing-1']
    }));
    expect(transaction.auditEvent.create).toHaveBeenCalledTimes(2);
  });

  it('bloqueia a remocao enquanto um PDF assinado aguarda o Drive', async () => {
    const transaction = {
      sendRequest: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'signed-1',
          status: SendRequestStatus.SIGNED,
          removedAt: null,
          employee: { nome: 'Colaborador Assinado' },
          signatures: [{
            id: 'signature-signed',
            status: SignatureStatus.SIGNED,
            archiveStatus: ArchiveStatus.FAILED,
            invitation: { id: 'invitation-signed' }
          }]
        }])
      }
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction))
    };
    const service = new SendRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await expect(service.bulkRemoveFromHistory(['signed-1'], 'user-1'))
      .rejects.toThrow('ainda precisam ser salvos no Drive');
  });

  it('nao sobrescreve a assinatura quando ela vence a corrida com a remocao', async () => {
    const transaction = {
      signingInvitation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      signature: {
        updateMany: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({
          status: SignatureStatus.SIGNED,
          archiveStatus: ArchiveStatus.PENDING
        })
      },
      signatureEvent: { create: jest.fn() },
      sendRequest: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'request-1',
          status: SendRequestStatus.SENT,
          removedAt: null,
          employee: { nome: 'Colaborador em Assinatura' },
          signatures: [{
            id: 'signature-1',
            status: SignatureStatus.SENT,
            archiveStatus: ArchiveStatus.NOT_REQUIRED,
            invitation: { id: 'invitation-1' }
          }]
        }]),
        updateMany: jest.fn()
      },
      auditEvent: { create: jest.fn() }
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof transaction) => unknown) => callback(transaction))
    };
    const service = new SendRequestsService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );

    await expect(service.bulkRemoveFromHistory(['request-1'], 'user-1'))
      .rejects.toThrow('precisa ser salvo no Drive');
    expect(transaction.signature.updateMany).not.toHaveBeenCalled();
    expect(transaction.sendRequest.updateMany).not.toHaveBeenCalled();
  });
});
