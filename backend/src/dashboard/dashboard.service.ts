import { Injectable } from '@nestjs/common';
import { ArchiveStatus, SendRequestStatus, SignatureStatus } from '@prisma/client';
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
      errors,
      latestSignatures
    ] = await Promise.all([
      this.prisma.employee.count({
        where: { sendRequests: { some: { removedAt: null } } }
      }),
      this.prisma.sendRequest.count({
        where: {
          removedAt: null,
          status: {
            in: [
              SendRequestStatus.DRAFT,
              SendRequestStatus.READY,
              SendRequestStatus.PENDING,
              SendRequestStatus.SENDING,
              SendRequestStatus.VIEWED,
              SendRequestStatus.IN_PROGRESS,
              SendRequestStatus.SIGNED
            ]
          }
        }
      }),
      this.prisma.sendRequest.count({ where: { removedAt: null, status: SendRequestStatus.SENT } }),
      this.prisma.signature.count({ where: { sendRequest: { removedAt: null }, status: SignatureStatus.FINISHED } }),
      this.prisma.sendRequest.count({
        where: {
          removedAt: null,
          OR: [
            { status: SendRequestStatus.FAILED },
            {
              signatures: {
                some: {
                  OR: [
                    { status: SignatureStatus.ERROR },
                    { archiveStatus: ArchiveStatus.FAILED }
                  ]
                }
              }
            }
          ]
        }
      }),
      this.prisma.signature.findMany({
        where: { sendRequest: { removedAt: null } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          employee: {
            select: { id: true, bitrixId: true, nome: true, email: true }
          },
          sendRequest: {
            select: {
              id: true,
              status: true,
              documentFileName: true,
              createdAt: true,
              updatedAt: true
            }
          },
          templateVersion: { include: { template: true } }
        }
      })
    ]);

    return {
      totalEmployees,
      pending,
      sent,
      signed,
      errors,
      latestSignatures
    };
  }
}
