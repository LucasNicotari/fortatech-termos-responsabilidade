import { SendRequestStatus, SignatureStatus } from '@prisma/client';
import {
  responsibilityTermFileName,
  SendRequestsService,
  signingInvitationMessage,
  signingUrlForCurrentUser
} from './send-requests.service';

describe('SendRequestsService', () => {
  it('gera o nome do PDF com o primeiro e o ultimo nome do colaborador', () => {
    expect(responsibilityTermFileName('Lucas Nicotari Maffei')).toBe('TR.Lucas_Maffei.pdf');
    expect(responsibilityTermFileName('João D\'Angelo')).toBe('TR.Joao_DAngelo.pdf');
    expect(responsibilityTermFileName('  Nicoly  ')).toBe('TR.Nicoly.pdf');
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
      { getUser: jest.fn().mockResolvedValue({ ID: '9002' }) } as never,
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
      sendRequest: { update: jest.fn().mockResolvedValue({}) },
      auditEvent: { create: jest.fn().mockResolvedValue({}) }
    };
    const prisma = {
      sendRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1',
          status: SendRequestStatus.SENT,
          removedAt: null,
          signatures: [{
            id: 'signature-1',
            status: SignatureStatus.SENT,
            invitation: { id: 'invitation-1' }
          }]
        })
      },
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
    expect(transaction.sendRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        removedByUserId: 'user-1',
        status: SendRequestStatus.CANCELED
      })
    }));
    expect(transaction.auditEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REMOVED_FROM_HISTORY' })
    }));
  });
});
