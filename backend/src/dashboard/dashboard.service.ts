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
      latestSignatures
    ] = await Promise.all([
      this.prisma.employee.count(),
      this.prisma.sendRequest.count({ where: { removedAt: null, status: { in: [SendRequestStatus.DRAFT, SendRequestStatus.READY, SendRequestStatus.PENDING, SendRequestStatus.SENDING, SendRequestStatus.IN_PROGRESS] } } }),
      this.prisma.sendRequest.count({ where: { removedAt: null, status: SendRequestStatus.SENT } }),
      this.prisma.signature.count({ where: { sendRequest: { removedAt: null }, status: { in: [SignatureStatus.SIGNED, SignatureStatus.FINISHED] } } }),
      this.prisma.sendRequest.count({ where: { removedAt: null, status: SendRequestStatus.FAILED } }),
      this.prisma.signature.count({ where: { sendRequest: { removedAt: null }, status: SignatureStatus.ERROR } }),
      this.prisma.signature.findMany({
        where: { sendRequest: { removedAt: null } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          employee: true,
          sendRequest: true,
          templateVersion: { include: { template: true } }
        }
      })
    ]);

    return {
      totalEmployees,
      pending,
      sent,
      signed,
      errors: sendErrors + signatureErrors,
      latestSignatures
    };
  }
}
