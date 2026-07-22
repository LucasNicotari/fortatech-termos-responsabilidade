import { TermNotificationsService } from './term-notifications.service';

describe('TermNotificationsService', () => {
  it('notifica Nicoly e Marcelo sem duplicar eventos concluidos', async () => {
    const findFirst = jest.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing' });
    const create = jest.fn().mockResolvedValue({ id: 'event' });
    const sendPersonalNotification = jest.fn().mockResolvedValue(123);
    const service = new TermNotificationsService(
      { sendPersonalNotification } as never,
      { signatureEvent: { findFirst, create } } as never,
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
});
