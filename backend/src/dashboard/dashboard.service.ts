import { Injectable } from '@nestjs/common';
import { SendRequestStatus, SignatureStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const [
      totalEmployees,
      pending,
      sent,
      signed,
      sendErrors,
      signatureErrors,
      latestEvents,
      latestSignatures,
      byStatus
    ] = await Promise.all([
      this.prisma.employee.count(),
      this.prisma.sendRequest.count({ where: { status: { in: [SendRequestStatus.DRAFT, SendRequestStatus.READY, SendRequestStatus.PENDING, SendRequestStatus.SENDING, SendRequestStatus.IN_PROGRESS] } } }),
      this.prisma.sendRequest.count({ where: { status: SendRequestStatus.SENT } }),
      this.prisma.signature.count({ where: { status: { in: [SignatureStatus.SIGNED, SignatureStatus.FINISHED] } } }),
      this.prisma.sendRequest.count({ where: { status: SendRequestStatus.FAILED } }),
      this.prisma.signature.count({ where: { status: SignatureStatus.ERROR } }),
      this.prisma.webhookEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.signature.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          employee: true,
          sendRequest: true,
          templateVersion: { include: { template: true } }
        }
      }),
      this.prisma.signature.groupBy({
        by: ['status'],
        _count: { status: true }
      })
    ]);

    return {
      totalEmployees,
      pending,
      sent,
      signed,
      errors: sendErrors + signatureErrors,
      latestEvents,
      latestSignatures,
      byStatus: byStatus.map((item) => ({ status: item.status, total: item._count.status }))
    };
  }
}
