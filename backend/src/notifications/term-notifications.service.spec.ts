import { TermNotificationsService } from './term-notifications.service';

describe('TermNotificationsService', () => {
  it('notifica os destinatarios escolhidos no termo sem duplicar eventos concluidos', async () => {
    const findFirst = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing' });
    const create = jest.fn().mockResolvedValue({ id: 'event' });
    const sendPersonalNotification = jest.fn().mockResolvedValue(123);
    const service = new TermNotificationsService(
      { sendPersonalNotification } as never,
      {
        sendRequestNotificationRecipient: {
          findMany: jest.fn().mockResolvedValue([
            { bitrixUserId: '7718' },
            { bitrixUserId: '8137' }
          ])
        },
        signatureEvent: { findFirst, create }
      } as never,
      { create: jest.fn() } as never,
      { notificationRecipientIds: () => Promise.resolve([7718, 8137]) } as never
    );

    const result = await service.notifySent('signature-1', 'request-1', 'Colaborador Teste');

    expect(result).toEqual([
      { userId: 7718, delivered: true },
      { userId: 8137, delivered: true, duplicate: true }
    ]);
    expect(sendPersonalNotification).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'BITRIX_TERM_SENT_NOTIFIED_7718' })
    }));
  });

  it('notifica automaticamente quem criou o termo quando a assinatura termina', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'event' });
    const sendPersonalNotification = jest.fn().mockResolvedValue(321);
    const service = new TermNotificationsService(
      { sendPersonalNotification } as never,
      {
        sendRequestNotificationRecipient: {
          findMany: jest.fn().mockResolvedValue([
            { bitrixUserId: '7718' },
            { bitrixUserId: '8465' }
          ])
        },
        sendRequest: {
          findUnique: jest.fn().mockResolvedValue({
            requestedBy: { bitrixUserId: '8465' }
          })
        },
        signatureEvent: {
          findFirst: jest.fn().mockResolvedValue(null),
          create
        }
      } as never,
      { create: jest.fn() } as never,
      { notificationRecipientIds: () => Promise.resolve([]) } as never
    );

    const result = await service.notifySigned('signature-1', 'request-1', 'Colaborador Teste');

    expect(result.map((item) => item.userId)).toEqual([7718, 8465]);
    expect(sendPersonalNotification).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'BITRIX_TERM_SIGNED_NOTIFIED_8465' })
    }));
  });
});
