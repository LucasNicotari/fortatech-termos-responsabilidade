import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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
import { createHash, randomBytes } from 'crypto';
import { BitrixService } from '../bitrix/bitrix.service';
import { DocumentsService } from '../documents/documents.service';
import { LogsService } from '../logs/logs.service';
import { TermNotificationsService } from '../notifications/term-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ZapSignService } from '../signature-providers/zapsign.service';
import { CreateSendRequestDto, UpdateSendRequestDto } from './dto/create-send-request.dto';

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
      orderBy: { createdAt: 'desc' },
      include: {
        employee: true,
        equipment: { orderBy: { itemNumber: 'asc' } },
        templateVersion: { include: { template: true } },
        attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 },
        signatures: { orderBy: { createdAt: 'desc' }, take: 1 },
        notificationRecipients: { orderBy: { name: 'asc' } }
      }
    });
  }

  async createDraft(dto: CreateSendRequestDto, requestedByUserId?: string) {
    await this.bitrix.getUser(dto.employeeBitrixUserId);
    const bitrixId = String(dto.employeeBitrixUserId);
    const email = dto.employeeEmail.trim().toLowerCase();
    const cpf = dto.cpf.trim();
    const [byBitrixId, byEmail, byCpf] = await Promise.all([
      this.prisma.employee.findUnique({ where: { bitrixId } }),
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
      nome: dto.employeeName.trim(),
      email,
      cpf,
      cargo: dto.cargo?.trim() || null,
      departamento: dto.departamento.trim()
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
        employeeSnapshot: this.toJson(this.employeeSnapshot(dto)),
        documentData: this.toJson({ city: dto.city || 'Sao Paulo' }),
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
      data: { documentFileName: responsibilityTermFileName(dto.employeeName) },
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
    const email = dto.employeeEmail.trim().toLowerCase();
    const cpf = dto.cpf.trim();
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
          nome: dto.employeeName.trim(), email, cpf,
          cargo: dto.cargo?.trim() || null, departamento: dto.departamento.trim()
        }
      }),
      this.prisma.sendRequestEquipment.deleteMany({ where: { sendRequestId: id } }),
      this.prisma.sendRequestNotificationRecipient.deleteMany({ where: { sendRequestId: id } }),
      this.prisma.sendRequest.update({
        where: { id },
        data: {
          status: SendRequestStatus.DRAFT,
          employeeSnapshot: this.toJson(this.employeeSnapshot(dto)),
          documentData: this.toJson({ city: dto.city || 'Sao Paulo' }),
          documentFileName: responsibilityTermFileName(dto.employeeName),
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
    if (!request) throw new NotFoundException('Solicitacao de envio nao encontrada');
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
          `[B]Termo de Responsabilidade para assinatura[/B]\n`
          + `Olá, ${request.employee.nome}. Revise o documento e registre sua assinatura dentro do Bitrix24.\n\n`
          + `[URL=${signingUrl}]Abrir e assinar no FortaDocs[/URL]\n\n`
          + `O convite é pessoal e expira em 7 dias.`
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
    if (!request) throw new NotFoundException('Solicitacao de envio nao encontrada');
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
    if (!request) throw new NotFoundException('Solicitacao de envio nao encontrada');
    return request;
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
    if (!request) throw new NotFoundException('Solicitacao de envio nao encontrada');
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

  private employeeSnapshot(dto: CreateSendRequestDto) {
    return {
      bitrixUserId: dto.employeeBitrixUserId,
      name: dto.employeeName.trim(),
      email: dto.employeeEmail.trim().toLowerCase(),
      cpf: dto.cpf.trim(),
      cargo: dto.cargo?.trim() || null,
      departamento: dto.departamento.trim()
    };
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

export function signingUrlForCurrentUser(
  signingUrl: string,
  signerUserId: number,
  actorBitrixUserId?: string
) {
  return actorBitrixUserId && String(signerUserId) === actorBitrixUserId
    ? signingUrl
    : undefined;
}
