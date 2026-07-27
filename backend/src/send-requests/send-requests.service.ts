import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ArchiveStatus,
  Prisma,
  SendAttemptStatus,
  SendRequestStatus,
  SendTriggerType,
  SignatureProvider,
  SignatureStatus
} from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { BitrixService } from '../bitrix/bitrix.service';
import { DocumentsService } from '../documents/documents.service';
import { LogsService } from '../logs/logs.service';
import { TermNotificationsService } from '../notifications/term-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ZapSignService } from '../signature-providers/zapsign.service';
import { CreateSendRequestDto, UpdateSendRequestDto } from './dto/create-send-request.dto';
import {
  ListSendRequestsDto,
  TermHistoryFilter
} from './dto/list-send-requests.dto';

@Injectable()
export class SendRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrix: BitrixService,
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
    private readonly logs: LogsService,
    private readonly zapSign: ZapSignService,
    private readonly notifications: TermNotificationsService,
    private readonly config: ConfigService
  ) {}

  findAll() {
    return this.prisma.sendRequest.findMany({
      where: { removedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        employee: {
          select: { id: true, bitrixId: true, nome: true, email: true }
        },
        equipment: { orderBy: { itemNumber: 'asc' } },
        templateVersion: { include: { template: true } },
        attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 },
        signatures: { orderBy: { createdAt: 'desc' }, take: 1 },
        notificationRecipients: { orderBy: { name: 'asc' } }
      }
    });
  }

  async findPage(query: ListSendRequestsDto) {
    const where = this.historyWhere(query.filter, query.search);
    const items = await this.prisma.sendRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: {
        employee: {
          select: { id: true, bitrixId: true, nome: true, email: true }
        },
        equipment: { orderBy: { itemNumber: 'asc' } },
        templateVersion: { include: { template: true } },
        attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 },
        signatures: { orderBy: { createdAt: 'desc' }, take: 1 },
        notificationRecipients: { orderBy: { name: 'asc' } }
      }
    });
    const hasMore = items.length > query.limit;
    if (hasMore) items.pop();
    return {
      items,
      nextCursor: hasMore ? items.at(-1)?.id || null : null
    };
  }

  private historyWhere(filter: TermHistoryFilter, search?: string): Prisma.SendRequestWhereInput {
    const conditions: Prisma.SendRequestWhereInput[] = [{ removedAt: null }];
    const normalizedSearch = search?.trim();
    if (normalizedSearch) {
      conditions.push({
        OR: [
          { employee: { nome: { contains: normalizedSearch, mode: 'insensitive' } } },
          { employee: { email: { contains: normalizedSearch, mode: 'insensitive' } } },
          { employee: { bitrixId: { contains: normalizedSearch, mode: 'insensitive' } } },
          { documentFileName: { contains: normalizedSearch, mode: 'insensitive' } }
        ]
      });
    }
    const filterWhere = this.historyFilterWhere(filter);
    if (filterWhere) conditions.push(filterWhere);
    return { AND: conditions };
  }

  private historyFilterWhere(filter: TermHistoryFilter): Prisma.SendRequestWhereInput | undefined {
    if (filter === 'DRAFT') {
      return { status: { in: [SendRequestStatus.DRAFT, SendRequestStatus.READY] } };
    }
    if (filter === 'WAITING') {
      return {
        OR: [
          {
            status: {
              in: [
                SendRequestStatus.PENDING,
                SendRequestStatus.SENDING,
                SendRequestStatus.SENT,
                SendRequestStatus.VIEWED,
                SendRequestStatus.IN_PROGRESS
              ]
            }
          },
          {
            signatures: {
              some: {
                status: {
                  in: [
                    SignatureStatus.PENDING,
                    SignatureStatus.SENT,
                    SignatureStatus.VIEWED,
                    SignatureStatus.IN_PROGRESS
                  ]
                }
              }
            }
          }
        ]
      };
    }
    if (filter === 'COMPLETED') {
      return {
        OR: [
          { status: SendRequestStatus.COMPLETED },
          { signatures: { some: { status: SignatureStatus.FINISHED } } }
        ]
      };
    }
    if (filter === 'ATTENTION') {
      return {
        OR: [
          { status: { in: [SendRequestStatus.FAILED, SendRequestStatus.CANCELED] } },
          { signatures: { some: { archiveStatus: ArchiveStatus.FAILED } } },
          {
            signatures: {
              some: {
                status: {
                  in: [
                    SignatureStatus.DECLINED,
                    SignatureStatus.ERROR,
                    SignatureStatus.CANCELED
                  ]
                }
              }
            }
          }
        ]
      };
    }
    return undefined;
  }

  async createDraft(dto: CreateSendRequestDto, requestedByUserId?: string) {
    const profile = await this.employeeProfile(dto.employeeBitrixUserId);
    const bitrixId = profile.bitrixId;
    const cpf = this.validCpf(dto.cpf);
    const byBitrixId = await this.prisma.employee.findUnique({ where: { bitrixId } });
    const email = profile.email;
    const [byEmail, byCpf] = await Promise.all([
      this.prisma.employee.findUnique({ where: { email } }),
      this.prisma.employee.findUnique({ where: { cpf } })
    ]);
    if (byEmail && byBitrixId && byEmail.id !== byBitrixId.id) {
      throw new BadRequestException('O email informado ja pertence a outro colaborador');
    }
    if (byEmail?.bitrixId && byEmail.bitrixId !== bitrixId) {
      throw new BadRequestException('O email informado ja pertence a outro colaborador');
    }
    if ((byCpf && byBitrixId && byCpf.id !== byBitrixId.id)
      || (byCpf && byEmail && byCpf.id !== byEmail.id)
      || (byCpf?.bitrixId && byCpf.bitrixId !== bitrixId)) {
      throw new BadRequestException('O CPF informado ja pertence a outro colaborador');
    }
    const existing = byBitrixId || byEmail || byCpf;
    const employeeData = {
      bitrixId,
      nome: profile.name,
      email,
      cpf,
      cargo: profile.cargo,
      departamento: profile.departamento
    };
    const employee = existing
      ? await this.prisma.employee.update({ where: { id: existing.id }, data: employeeData })
      : await this.prisma.employee.create({ data: employeeData });
    const templateVersion = dto.templateVersionId
      ? await this.findTemplateVersion(dto.templateVersionId)
      : await this.findDefaultTemplateVersion();
    const notificationRecipients = await this.resolveNotificationRecipients(
      dto.notificationRecipientBitrixUserIds || []
    );
    const request = await this.prisma.sendRequest.create({
      data: {
        employeeId: employee.id,
        templateVersionId: templateVersion.id,
        triggerType: SendTriggerType.MANUAL,
        status: SendRequestStatus.DRAFT,
        requestedByUserId,
        employeeSnapshot: this.toJson(this.employeeSnapshot(profile, cpf)),
        documentData: this.toJson({ city: 'Sao Paulo' }),
        equipment: {
          create: dto.equipment.map((item, index) => ({
            itemNumber: index + 1,
            quantity: item.quantity,
            description: item.description,
            serialNumber: item.serialNumber,
            assetTag: item.assetTag,
            accessories: item.accessories
          }))
        },
        notificationRecipients: { create: notificationRecipients }
      }
    });
    return this.prisma.sendRequest.update({
      where: { id: request.id },
      data: { documentFileName: responsibilityTermFileName(profile.name) },
      include: {
        employee: true,
        equipment: true,
        notificationRecipients: true,
        templateVersion: { include: { template: true } }
      }
    });
  }

  async updateDraft(id: string, dto: UpdateSendRequestDto) {
    const request = await this.getEditable(id);
    if (String(dto.employeeBitrixUserId) !== request.employee.bitrixId) {
      throw new BadRequestException('Nao e permitido trocar o colaborador de um rascunho; crie outro');
    }
    const profile = await this.employeeProfile(dto.employeeBitrixUserId);
    const email = profile.email;
    const cpf = this.validCpf(dto.cpf);
    const notificationRecipients = await this.resolveNotificationRecipients(
      dto.notificationRecipientBitrixUserIds || []
    );
    const [byEmail, byCpf] = await Promise.all([
      this.prisma.employee.findUnique({ where: { email } }),
      this.prisma.employee.findUnique({ where: { cpf } })
    ]);
    if (byEmail && byEmail.id !== request.employeeId) {
      throw new BadRequestException('O email informado ja pertence a outro colaborador');
    }
    if (byCpf && byCpf.id !== request.employeeId) {
      throw new BadRequestException('O CPF informado ja pertence a outro colaborador');
    }
    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id: request.employeeId },
        data: {
          nome: profile.name,
          email,
          cpf,
          cargo: profile.cargo,
          departamento: profile.departamento
        }
      }),
      this.prisma.sendRequestEquipment.deleteMany({ where: { sendRequestId: id } }),
      this.prisma.sendRequestNotificationRecipient.deleteMany({ where: { sendRequestId: id } }),
      this.prisma.sendRequest.update({
        where: { id },
        data: {
          status: SendRequestStatus.DRAFT,
          employeeSnapshot: this.toJson(this.employeeSnapshot(profile, cpf)),
          documentData: this.toJson({ city: 'Sao Paulo' }),
          documentFileName: responsibilityTermFileName(profile.name),
          unsignedStoragePath: null,
          unsignedSha256: null,
          equipment: {
            create: dto.equipment.map((item, index) => ({
              itemNumber: index + 1, quantity: item.quantity, description: item.description,
              serialNumber: item.serialNumber, assetTag: item.assetTag, accessories: item.accessories
            }))
          },
          notificationRecipients: { create: notificationRecipients }
        }
      })
    ]);
    return this.findOne(id);
  }

  async preview(id: string) {
    const request = await this.getEditable(id);
    const snapshot = request.employeeSnapshot as Record<string, unknown>;
    const documentData = request.documentData as Record<string, unknown>;
    const rendered = await this.documents.renderResponsibilityTerm(request.templateVersion, {
      employeeName: String(snapshot.name),
      cpf: String(snapshot.cpf),
      city: String(documentData?.city || 'Sao Paulo'),
      date: new Date(),
      equipments: request.equipment.map((item) => ({
        item: String(item.itemNumber).padStart(2, '0'), quantity: item.quantity,
        description: item.description, serialNumber: item.serialNumber || undefined,
        assetTag: item.assetTag || undefined, accessories: item.accessories || undefined
      }))
    });
    const path = `unsigned/${request.id}/${rendered.sha256}.pdf`;
    await this.storage.upload(path, rendered.pdf, 'application/pdf', true);
    const updated = await this.prisma.sendRequest.update({
      where: { id },
      data: {
        status: SendRequestStatus.READY,
        documentFileName: responsibilityTermFileName(String(snapshot.name)),
        unsignedStoragePath: path,
        unsignedSha256: rendered.sha256
      }
    });
    return { request: updated, previewUrl: await this.storage.createSignedUrl(path, 300, false) };
  }

  async send(id: string, actorBitrixUserId?: string) {
    const request = await this.prisma.sendRequest.findUnique({
      where: { id },
      include: {
        employee: true,
        requestedBy: true,
        attempts: true,
        templateVersion: { include: { template: true } }
      }
    });
    if (!request || request.removedAt) throw new NotFoundException('Solicitacao de envio nao encontrada');
    if (request.status !== SendRequestStatus.READY || !request.unsignedStoragePath || !request.documentFileName) {
      throw new BadRequestException('Gere e revise a previa antes do envio');
    }
    const attempt = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.sendRequest.updateMany({
        where: { id, status: SendRequestStatus.READY, lockedAt: null },
        data: { status: SendRequestStatus.SENDING, failureReason: null }
      });
      if (claimed.count !== 1) {
        throw new BadRequestException('Esta solicitacao ja esta sendo enviada');
      }
      const attemptNumber = await transaction.sendAttempt.count({ where: { sendRequestId: id } });
      return transaction.sendAttempt.create({
        data: { sendRequestId: id, attemptNumber: attemptNumber + 1, status: SendAttemptStatus.SENDING }
      });
    });
    try {
      const pdf = await this.storage.download(request.unsignedStoragePath);
      const snapshot = request.employeeSnapshot as Record<string, unknown>;
      if (this.zapSign.isLocalMode()) {
        return this.sendLocalSimulation(request, attempt.id, pdf, snapshot);
      }
      const signerUserId = Number(request.employee.bitrixId);
      if (!Number.isInteger(signerUserId) || signerUserId <= 0) {
        throw new BadRequestException('O colaborador precisa estar vinculado a um usuário do Bitrix24');
      }
      const signerUser = await this.bitrix.getUser(signerUserId);
      const signerName = [signerUser.NAME, signerUser.LAST_NAME]
        .filter(Boolean)
        .join(' ')
        .trim() || request.employee.nome;
      const publicUrl = this.config.get<string>('PUBLIC_BACKEND_URL');
      const clientId = this.config.get<string>('BITRIX_CLIENT_ID');
      const installation = await this.prisma.bitrixInstallation.findFirst({
        where: { active: true },
        orderBy: { updatedAt: 'desc' }
      });
      if (!publicUrl || !clientId || !installation) {
        throw new BadRequestException('Integracao Bitrix24 incompleta para envio pelo chat');
      }
      await this.bitrix.ensureRestAppUriPlacement(
        `${publicUrl.replace(/\/$/, '')}/integrations/bitrix/launch`
      );
      const signingToken = randomBytes(32).toString('base64url');
      const signature = await this.prisma.signature.create({
        data: {
          sendRequestId: id,
          employeeId: request.employeeId,
          templateVersionId: request.templateVersionId,
          provider: SignatureProvider.FORTADOCS,
          status: SignatureStatus.SENT,
          rawStatusCode: 'chat-sent',
          bitrixStage: 'Aguardando assinatura do colaborador no FortaDocs',
          sentAt: new Date(),
          lastSyncedAt: new Date(),
          archiveStatus: ArchiveStatus.NOT_REQUIRED,
          invitation: {
            create: {
              tokenHash: createHash('sha256').update(signingToken).digest('hex'),
              bitrixUserId: String(signerUserId),
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000)
            }
          }
        },
        include: { invitation: true }
      });
      const signingUrl = `https://${installation.domain}/marketplace/view/${encodeURIComponent(clientId)}/?params[signing]=${encodeURIComponent(signingToken)}`;
      let chatMessageId: number;
      try {
        chatMessageId = await this.bitrix.sendChatMessage(
          signerUserId,
          signingInvitationMessage(signerName, signingUrl)
        );
      } catch (error) {
        await this.prisma.signature.delete({ where: { id: signature.id } });
        throw error;
      }
      await this.prisma.signingInvitation.update({
        where: { id: signature.invitation!.id },
        data: { chatMessageId: String(chatMessageId) }
      });
      let signerNotificationId: number | false | null = null;
      try {
        signerNotificationId = await this.bitrix.sendPersonalNotification({
          userId: signerUserId,
          message: `[URL=${signingUrl}]Você possui um Termo de Responsabilidade aguardando assinatura no FortaDocs.[/URL]`,
          externalMessage: '',
          tag: `FORTADOCS_SIGN_${id}_${signerUserId}`
        });
      } catch (notificationError) {
        await this.logs.create({
          type: 'BITRIX_SIGNER_NOTIFICATION_ERROR',
          source: 'bitrix',
          endpoint: 'im.notify.personal.add',
          error: notificationError instanceof Error ? notificationError.message : 'Falha ao alertar o colaborador',
          payload: { sendRequestId: id, signatureId: signature.id, bitrixUserId: signerUserId }
        });
      }
      await this.prisma.signatureEvent.create({
        data: {
          signatureId: signature.id,
          eventType: 'FORTADOCS_CHAT_SENT',
          status: SignatureStatus.SENT,
          bitrixStage: 'Aguardando assinatura do colaborador no FortaDocs',
          payload: { bitrixUserId: signerUserId, chatMessageId, signerNotificationId, expiresInDays: 7 }
        }
      });
      await this.prisma.sendAttempt.update({
        where: { id: attempt.id },
        data: {
          status: SendAttemptStatus.SUCCESS,
          finishedAt: new Date(),
          providerResponse: this.toJson({
            provider: 'FORTADOCS',
            chatMessageId,
            status: 'SENT'
          })
        }
      });
      const updatedRequest = await this.prisma.sendRequest.update({
        where: { id },
        data: { status: SendRequestStatus.SENT, sentAt: new Date(), lockedAt: new Date() },
        include: { employee: true, equipment: true, signatures: true, notificationRecipients: true }
      });
      await this.notifications.notifySent(signature.id, id, request.employee.nome);
      return {
        ...updatedRequest,
        selfSigningUrl: signingUrlForCurrentUser(signingUrl, signerUserId, actorBitrixUserId)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido no envio';
      await this.prisma.sendAttempt.update({
        where: { id: attempt.id }, data: { status: SendAttemptStatus.FAILED, finishedAt: new Date(), error: message }
      });
      await this.logs.create({ type: 'SEND_REQUEST_ERROR', source: 'backend', endpoint: `/send-requests/${id}/send`, error: message });
      await this.prisma.sendRequest.update({ where: { id }, data: { status: SendRequestStatus.FAILED, failureReason: message } });
      throw error;
    }
  }

  private async sendLocalSimulation(
    request: {
      id: string;
      documentFileName: string | null;
      templateVersionId: string | null;
      employee: { id: string; bitrixId: string | null; nome: string; email: string; cpf: string | null };
    },
    attemptId: string,
    pdf: Buffer,
    snapshot: Record<string, unknown>
  ) {
    const result = await this.zapSign.createDocument({
      externalId: request.id,
      fileName: request.documentFileName!,
      pdf,
      signer: {
        externalId: request.employee.bitrixId || request.employee.id,
        name: String(snapshot.name || request.employee.nome),
        email: String(snapshot.email || request.employee.email),
        cpf: String(snapshot.cpf || request.employee.cpf || '')
      },
      observers: []
    });
    const signature = await this.prisma.signature.create({
      data: {
        sendRequestId: request.id,
        employeeId: request.employee.id,
        templateVersionId: request.templateVersionId,
        provider: SignatureProvider.ZAPSIGN,
        providerDocumentId: result.token,
        status: SignatureStatus.SENT,
        rawStatusCode: result.status,
        bitrixStage: 'Simulação local aguardando colaborador',
        sentAt: new Date(),
        lastSyncedAt: new Date(),
        archiveStatus: ArchiveStatus.NOT_REQUIRED
      }
    });
    await this.prisma.signatureEvent.create({
      data: {
        signatureId: signature.id,
        eventType: 'LOCAL_SENT',
        status: SignatureStatus.SENT,
        bitrixStage: result.status
      }
    });
    await this.prisma.sendAttempt.update({
      where: { id: attemptId },
      data: {
        status: SendAttemptStatus.SUCCESS,
        finishedAt: new Date(),
        providerResponse: this.toJson({ provider: 'LOCAL', documentToken: result.token })
      }
    });
    return this.prisma.sendRequest.update({
      where: { id: request.id },
      data: { status: SendRequestStatus.SENT, sentAt: new Date(), lockedAt: new Date() },
      include: { employee: true, equipment: true, signatures: true }
    });
  }

  private async resolveNotificationRecipients(ids: number[]) {
    const uniqueIds = [...new Set(ids)];
    const users = await Promise.all(uniqueIds.map((id) => this.bitrix.getUser(id)));
    return users.map((user) => ({
      bitrixUserId: String(user.ID),
      name: [user.NAME, user.LAST_NAME].filter(Boolean).join(' ').trim() || `Usuario ${user.ID}`,
      email: user.EMAIL?.trim().toLowerCase() || null
    }));
  }

  async retry(id: string) {
    const request = await this.prisma.sendRequest.findUnique({ where: { id } });
    if (!request || request.removedAt) throw new NotFoundException('Solicitacao de envio nao encontrada');
    if (request.lockedAt) throw new BadRequestException('Documento ja enviado e imutavel');
    return this.prisma.sendRequest.update({
      where: { id }, data: { status: SendRequestStatus.DRAFT, failureReason: null, unsignedStoragePath: null, unsignedSha256: null }
    });
  }

  async findOne(id: string) {
    const request = await this.prisma.sendRequest.findUnique({
      where: { id },
      include: {
        employee: true,
        equipment: { orderBy: { itemNumber: 'asc' } },
        notificationRecipients: { orderBy: { name: 'asc' } },
        templateVersion: { include: { template: true } },
        signatures: true
      }
    });
    if (!request || request.removedAt) throw new NotFoundException('Solicitacao de envio nao encontrada');
    return request;
  }

  async removeFromHistory(id: string, actorUserId?: string) {
    const result = await this.bulkRemoveFromHistory([id], actorUserId);
    const removed = result.items.find((item) => item.id === id);
    if (!removed) throw new NotFoundException('Solicitacao de envio nao encontrada');
    return {
      id,
      removed: true,
      completedDocumentPreserved: removed.completedDocumentPreserved,
      activeInvitationsRevoked: removed.activeInvitationsRevoked
    };
  }

  async bulkRemoveFromHistory(ids: string[], actorUserId?: string) {
    const requestedIds = [...new Set(ids)].sort();
    const batchId = randomUUID();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const requests = await transaction.sendRequest.findMany({
            where: { id: { in: requestedIds } },
            include: {
              employee: { select: { nome: true } },
              signatures: { include: { invitation: true } }
            }
          });
          const byId = new Map(requests.map((request) => [request.id, request]));
          const ignoredIds = requestedIds.filter((id) => !byId.get(id) || byId.get(id)!.removedAt);
          const candidates = requestedIds
            .map((id) => byId.get(id))
            .filter((request): request is NonNullable<typeof request> => Boolean(request && !request.removedAt));
          const blocked = candidates.filter((request) =>
            request.signatures.some((signature) => this.awaitingRequiredArchive(signature))
          );
          if (blocked.length) {
            throw new ConflictException({
              message: 'Existem termos assinados que ainda precisam ser salvos no Drive antes da remocao',
              blockedIds: blocked.map((request) => request.id),
              blockedEmployees: blocked.map((request) => request.employee.nome)
            });
          }

          const now = new Date();
          const activeStatuses: SignatureStatus[] = [
            SignatureStatus.PENDING,
            SignatureStatus.SENT,
            SignatureStatus.VIEWED,
            SignatureStatus.IN_PROGRESS
          ];
          const items: Array<{
            id: string;
            completedDocumentPreserved: boolean;
            activeInvitationsRevoked: number;
          }> = [];

          for (const request of candidates) {
            let activeInvitationsRevoked = 0;
            let completedDocumentPreserved = request.signatures.some((signature) =>
              this.hasPreservedSignature(signature.status)
            );

            for (const signature of request.signatures) {
              if (!activeStatuses.includes(signature.status)) continue;
              let mayCancel = !signature.invitation;
              if (signature.invitation) {
                const revoked = await transaction.signingInvitation.updateMany({
                  where: {
                    signatureId: signature.id,
                    completedAt: null,
                    revokedAt: null
                  },
                  data: { revokedAt: now }
                });
                mayCancel = revoked.count === 1;
                activeInvitationsRevoked += revoked.count;
              }
              if (mayCancel) {
                const canceled = await transaction.signature.updateMany({
                  where: { id: signature.id, status: { in: activeStatuses } },
                  data: {
                    status: SignatureStatus.CANCELED,
                    canceledAt: now,
                    bitrixStage: 'Cancelado ao remover do historico'
                  }
                });
                if (canceled.count === 1) {
                  await transaction.signatureEvent.create({
                    data: {
                      signatureId: signature.id,
                      eventType: 'REMOVED_FROM_HISTORY',
                      status: SignatureStatus.CANCELED,
                      bitrixStage: 'Cancelado por remocao logica do historico',
                      payload: { batchId }
                    }
                  });
                  continue;
                }
              }

              const current = await transaction.signature.findUnique({
                where: { id: signature.id },
                select: { status: true, archiveStatus: true }
              });
              if (current && this.awaitingRequiredArchive(current)) {
                throw new ConflictException({
                  message: `O termo de ${request.employee.nome} foi assinado e precisa ser salvo no Drive antes da remocao`,
                  blockedIds: [request.id],
                  blockedEmployees: [request.employee.nome]
                });
              }
              completedDocumentPreserved ||= Boolean(
                current && this.hasPreservedSignature(current.status)
              );
            }

            const removed = await transaction.sendRequest.updateMany({
              where: { id: request.id, removedAt: null },
              data: {
                removedAt: now,
                removedByUserId: actorUserId || null,
                status: completedDocumentPreserved
                  ? SendRequestStatus.COMPLETED
                  : activeInvitationsRevoked
                    ? SendRequestStatus.CANCELED
                    : request.status
              }
            });
            if (removed.count !== 1) {
              ignoredIds.push(request.id);
              continue;
            }
            await transaction.auditEvent.create({
              data: {
                actorUserId: actorUserId || null,
                entityType: 'SEND_REQUEST',
                entityId: request.id,
                action: 'REMOVED_FROM_HISTORY',
                before: this.toJson({ status: request.status, removedAt: null }),
                after: this.toJson({
                  status: completedDocumentPreserved
                    ? SendRequestStatus.COMPLETED
                    : activeInvitationsRevoked
                      ? SendRequestStatus.CANCELED
                      : request.status,
                  removedAt: now.toISOString()
                }),
                metadata: this.toJson({
                  batchId,
                  completedDocumentPreserved,
                  activeInvitationsRevoked
                })
              }
            });
            items.push({
              id: request.id,
              completedDocumentPreserved,
              activeInvitationsRevoked
            });
          }

          return {
            batchId,
            requestedCount: requestedIds.length,
            removedCount: items.length,
            ignoredCount: ignoredIds.length,
            activeInvitationsRevoked: items.reduce(
              (total, item) => total + item.activeInvitationsRevoked,
              0
            ),
            completedDocumentsPreserved: items.filter(
              (item) => item.completedDocumentPreserved
            ).length,
            removedIds: items.map((item) => item.id),
            ignoredIds: [...new Set(ignoredIds)].sort(),
            items
          };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 20_000
        });
      } catch (error) {
        if (attempt < 3 && this.isRetryableTransactionError(error)) continue;
        throw error;
      }
    }
    throw new ConflictException('Nao foi possivel concluir a remocao concorrente');
  }

  private awaitingRequiredArchive(signature: {
    status: SignatureStatus;
    archiveStatus: ArchiveStatus;
  }) {
    return signature.status === SignatureStatus.SIGNED
      && signature.archiveStatus !== ArchiveStatus.ARCHIVED;
  }

  private hasPreservedSignature(status: SignatureStatus) {
    return status === SignatureStatus.SIGNED || status === SignatureStatus.FINISHED;
  }

  private isRetryableTransactionError(error: unknown) {
    return (error as { code?: string } | undefined)?.code === 'P2034';
  }

  private async getEditable(id: string) {
    const request = await this.prisma.sendRequest.findUnique({
      where: { id },
      include: {
        employee: true,
        equipment: { orderBy: { itemNumber: 'asc' } },
        notificationRecipients: true,
        templateVersion: true
      }
    });
    if (!request || request.removedAt) throw new NotFoundException('Solicitacao de envio nao encontrada');
    const editableStatuses: SendRequestStatus[] = [SendRequestStatus.DRAFT, SendRequestStatus.READY, SendRequestStatus.FAILED];
    if (request.lockedAt || !editableStatuses.includes(request.status)) {
      throw new BadRequestException('Documento enviado e imutavel');
    }
    return request;
  }

  private async findDefaultTemplateVersion() {
    const result = await this.prisma.documentTemplateVersion.findFirst({
      where: { isDefault: true, ativo: true, template: { ativo: true } }, include: { template: true }
    });
    if (!result) throw new BadRequestException('Nenhuma versao de template padrao ativa');
    return result;
  }

  private async findTemplateVersion(id: string) {
    const result = await this.prisma.documentTemplateVersion.findUnique({ where: { id }, include: { template: true } });
    if (!result?.ativo || !result.template.ativo) throw new BadRequestException('Versao de template invalida');
    return result;
  }

  private employeeSnapshot(profile: {
    bitrixId: string;
    name: string;
    email: string;
    cargo: string | null;
    departamento: string | null;
  }, cpf: string) {
    return {
      bitrixUserId: Number(profile.bitrixId),
      name: profile.name,
      email: profile.email,
      cpf,
      cargo: profile.cargo,
      departamento: profile.departamento
    };
  }

  private async employeeProfile(bitrixUserId: number) {
    const user = await this.bitrix.getUserWithDepartment(bitrixUserId);
    const name = [user.NAME, user.LAST_NAME].filter(Boolean).join(' ').trim();
    const email = user.EMAIL?.trim().toLowerCase() || '';
    if (!name) throw new BadRequestException('O perfil do colaborador no Bitrix24 nao possui nome');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('O perfil do colaborador no Bitrix24 nao possui e-mail valido');
    }
    return {
      bitrixId: String(user.ID),
      name,
      email,
      cargo: user.WORK_POSITION?.trim() || null,
      departamento: user.DEPARTMENT_NAME?.trim() || null
    };
  }

  private validCpf(value: string) {
    const cpf = normalizeResponsibilityCpf(value);
    if (!cpf) throw new BadRequestException('CPF invalido');
    return cpf;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value));
  }
}

export function responsibilityTermFileName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const selected = parts.length > 1 ? [parts[0], parts.at(-1)!] : parts;
  const safeName = selected
    .map((part) => part.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-]/g, ''))
    .filter(Boolean)
    .join('_') || 'Colaborador';
  return `TR.${safeName}.pdf`;
}

export function normalizeResponsibilityCpf(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return null;
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const result = (sum * 10) % 11;
    return result === 10 ? 0 : result;
  };
  if (digit(9) !== Number(digits[9]) || digit(10) !== Number(digits[10])) return null;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function signingUrlForCurrentUser(
  signingUrl: string,
  signerUserId: number,
  actorBitrixUserId?: string
) {
  return actorBitrixUserId && String(signerUserId) === actorBitrixUserId
    ? signingUrl
    : undefined;
}

export function signingInvitationMessage(employeeName: string, signingUrl: string) {
  return `[B]Termo de Responsabilidade para assinatura[/B]\n\n`
    + `Prezado(a), [B]${employeeName}[/B],\n\n`
    + `A [B]FortaTech[/B] disponibilizou um Termo de Responsabilidade para sua assinatura eletrônica.\n\n`
    + `Leia atentamente o documento e, estando de acordo, registre sua assinatura por meio do link abaixo:\n\n`
    + `[URL=${signingUrl}]➡️ Revisar e assinar documento[/URL]\n\n`
    + `Este convite é pessoal, intransferível e permanecerá disponível por [B]7 dias[/B].`;
}
