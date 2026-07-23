import { LogsService } from './logs.service';

describe('LogsService', () => {
  it('remove o convite de assinatura de mensagens antes de persistir', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'log-1' });
    const service = new LogsService({ integrationLog: { create } } as never);
    const secret = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

    await service.create({
      type: 'BITRIX_REQUEST',
      source: 'bitrix',
      endpoint: 'im.message.add',
      payload: {
        MESSAGE: `[URL=https://portal.bitrix24.com/marketplace/view/app/?params[signing]=${secret}]Assinar[/URL]`
      }
    });

    const payload = create.mock.calls[0][0].data.payload as { MESSAGE: string };
    expect(payload.MESSAGE).not.toContain(secret);
    expect(payload.MESSAGE).toContain('params[signing]=[REDACTED]');
  });

  it('continua removendo valores quando a propria chave e sensivel', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'log-2' });
    const service = new LogsService({ integrationLog: { create } } as never);

    await service.create({
      type: 'TEST',
      source: 'test',
      payload: { accessToken: 'never-persist-this', nested: { password: 'also-secret' } }
    });

    expect(create.mock.calls[0][0].data.payload).toEqual({
      accessToken: '[REDACTED]',
      nested: { password: '[REDACTED]' }
    });
  });
});
