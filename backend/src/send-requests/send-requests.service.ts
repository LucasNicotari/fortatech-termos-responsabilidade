import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ArchiveStatus,
  Prisma,
  SendAttemptStatus,
  SendRequestStatus,
  SendTriggerType,
  SignatureProvider,
  SignatureStatus
} from '@prisma/client';
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
    private readonly notifications: TermNotificationsService
  ) {}

  findAll() {
    return this.prisma.sendRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        employee: true,
        equipment: { orderBy: { itemNumber: 'asc' } },
        templateVersion: { include: { template: true } },
        attempts: { orderBy: { attemptNumber: 'desc' }, take: 1 },
        signatures: { orderBy: { createdAt: 'desc' }, take: 1 }
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
        }
      }
    });
    return this.prisma.sendRequest.update({
      where: { id: request.id },
      data: { documentFileName: `TR-${request.id}.pdf` },
      include: { employee: true, equipment: true, templateVersion: { include: { template: true } } }
    });
  }

  async updateDraft(id: string, dto: UpdateSendRequestDto) {
    const request = await this.getEditable(id);
    if (String(dto.employeeBitrixUserId) !== request.employee.bitrixId) {
      throw new BadRequestException('Nao e permitido trocar o colaborador de um rascunho; crie outro');
    }
    const email = dto.employeeEmail.trim().toLowerCase();
    const cpf = dto.cpf.trim();
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
      this.prisma.sendRequest.update({
        where: { id },
        data: {
          status: SendRequestStatus.DRAFT,
          employeeSnapshot: this.toJson(this.employeeSnapshot(dto)),
          documentData: this.toJson({ city: dto.city || 'Sao Paulo' }),
          unsignedStoragePath: null,
          unsignedSha256: null,
          equipment: {
            create: dto.equipment.map((item, index) => ({
              itemNumber: index + 1, quantity: item.quantity, description: item.description,
              serialNumber: item.serialNumber, assetTag: item.assetTag, accessories: item.accessories
            }))
          }
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
      data: { status: SendRequestStatus.READY, unsignedStoragePath: path, unsignedSha256: rendered.sha256 }
    });
    return { request: updated, previewUrl: await this.storage.createSignedUrl(path, 300) };
  }

  async send(id: string) {
    const request = await this.prisma.sendRequest.findUnique({
      where: { id },
      include: { employee: true, attempts: true, templateVersion: { include: { template: true } } }
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
      const observers = await this.notifications.recipientEmails();
      const result = await this.zapSign.createDocument({
        externalId: id,
        fileName: request.documentFileName,
        pdf,
        signer: {
          externalId: request.employee.bitrixId || request.employeeId,
          name: String(snapshot.name || request.employee.nome),
          email: String(snapshot.email || request.employee.email),
          cpf: String(snapshot.cpf || request.employee.cpf || '')
        },
        observers
      });
      const signature = await this.prisma.signature.create({
        data: {
          sendRequestId: id,
          employeeId: request.employeeId,
          templateVersionId: request.templateVersionId,
          provider: SignatureProvider.ZAPSIGN,
          providerDocumentId: result.token,
          status: SignatureStatus.SENT,
          rawStatusCode: result.status,
          bitrixStage: 'Aguardando assinatura do colaborador',
          sentAt: new Date(),
          lastSyncedAt: new Date(),
          archiveStatus: ArchiveStatus.NOT_REQUIRED
        }
      });
      await this.prisma.signatureEvent.create({
        data: { signatureId: signature.id, eventType: 'ZAPSIGN_SENT', status: SignatureStatus.SENT, bitrixStage: result.status }
      });
      await this.prisma.sendAttempt.update({
        where: { id: attempt.id },
        data: {
          status: SendAttemptStatus.SUCCESS,
          finishedAt: new Date(),
          providerResponse: this.toJson({ provider: 'ZAPSIGN', documentToken: result.token, status: result.status })
        }
      });
      const updatedRequest = await this.prisma.sendRequest.update({
        where: { id },
        data: { status: SendRequestStatus.SENT, sentAt: new Date(), lockedAt: new Date() },
        include: { employee: true, equipment: true, signatures: true }
      });
      await this.notifications.notifySent(signature.id, id, request.employee.nome);
      return updatedRequest;
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
      include: { employee: true, equipment: { orderBy: { itemNumber: 'asc' } }, templateVersion: { include: { template: true } }, signatures: true }
    });
    if (!request) throw new NotFoundException('Solicitacao de envio nao encontrada');
    return request;
  }

  private async getEditable(id: string) {
    const request = await this.prisma.sendRequest.findUnique({
      where: { id },
      include: { employee: true, equipment: { orderBy: { itemNumber: 'asc' } }, templateVersion: true }
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
