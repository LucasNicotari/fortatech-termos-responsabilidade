import { Injectable } from '@nestjs/common';
import { BitrixService } from '../bitrix/bitrix.service';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';

@Injectable()
export class TermNotificationsService {
  constructor(
    private readonly bitrix: BitrixService,
    private readonly prisma: PrismaService,
    private readonly logs: LogsService,
    private readonly workflow: WorkflowService
  ) {}

  async recipientEmails() {
    const results = await Promise.allSettled((await this.workflow.notificationRecipientIds()).map((id) => this.bitrix.getUser(id)));
    const users = results
      .filter((result): result is PromiseFulfilledResult<Awaited<ReturnType<BitrixService['getUser']>>> => result.status === 'fulfilled')
      .map((result) => result.value);
    return [...new Set(users
      .map((user) => user.EMAIL?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)))];
  }

  async notifySent(signatureId: string, requestId: string, employeeName: string) {
    return this.notify(
      signatureId, requestId, 'SENT',
      `Termo de Responsabilidade enviado para ${employeeName}.`,
      `O Termo de Responsabilidade de ${employeeName} foi enviado e aguarda a assinatura do colaborador.`
    );
  }

  async notifySigned(signatureId: string, requestId: string, employeeName: string) {
    return this.notify(
      signatureId, requestId, 'SIGNED',
      `Termo de Responsabilidade assinado por ${employeeName}.`,
      `O Termo de Responsabilidade de ${employeeName} foi assinado e concluido.`
    );
  }

  private async notify(
    signatureId: string,
    requestId: string,
    state: 'SENT' | 'SIGNED',
    message: string,
    externalMessage: string
  ) {
    const results: Array<{ userId: number; delivered: boolean; duplicate?: boolean }> = [];
    const [recipients, request] = await Promise.all([
      this.prisma.sendRequestNotificationRecipient.findMany({
        where: { sendRequestId: requestId },
        select: { bitrixUserId: true }
      }),
      state === 'SIGNED'
        ? this.prisma.sendRequest.findUnique({
            where: { id: requestId },
            select: { requestedBy: { select: { bitrixUserId: true } } }
          })
        : Promise.resolve(null)
    ]);
    const recipientIds = recipients.map((recipient) => Number(recipient.bitrixUserId));
    if (state === 'SIGNED') recipientIds.push(Number(request?.requestedBy?.bitrixUserId));
    for (const userId of [...new Set(recipientIds.filter((id) => Number.isInteger(id) && id > 0))]) {
      const eventType = `BITRIX_TERM_${state}_NOTIFIED_${userId}`;
      const existing = await this.prisma.signatureEvent.findFirst({ where: { signatureId, eventType } });
      if (existing) {
        results.push({ userId, delivered: true, duplicate: true });
        continue;
      }
      try {
        const notificationId = await this.bitrix.sendPersonalNotification({
          userId, message, externalMessage,
          tag: `FORTADOCS_${state}_${requestId}_${userId}`
        });
        await this.prisma.signatureEvent.create({
          data: { signatureId, eventType, payload: { userId, notificationId, state } }
        });
        results.push({ userId, delivered: true });
      } catch (error) {
        await this.logs.create({
          type: 'BITRIX_TERM_NOTIFICATION_ERROR', source: 'bitrix', endpoint: 'im.notify.personal.add',
          payload: { signatureId, requestId, userId, state },
          error: error instanceof Error ? error.message : 'Falha ao notificar no Bitrix24'
        });
        results.push({ userId, delivered: false });
      }
    }
    return results;
  }
}
