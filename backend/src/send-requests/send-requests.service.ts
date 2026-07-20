import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ArchiveStatus,
  Prisma,
  SendAttemptStatus,
  SendRequestStatus,
  SendTriggerType,
  SignatureStatus
} from '@prisma/client';
import { BitrixService } from '../bitrix/bitrix.service';
import { DocumentsService } from '../documents/documents.service';
import { BitrixSigningConfig } from '../integrations/bitrix-integrations.service';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateSendRequestDto, UpdateSendRequestDto } from './dto/create-send-request.dto';

@Injectable()
export class SendRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrix: BitrixService,
    private readonly documents: DocumentsService,
    private readonly storage: StorageService,
    private readonly logs: LogsService
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
    const bitrixUser = await this.bitrix.getUser(dto.employeeBitrixUserId);
    if (bitrixUser.EMAIL && bitrixUser.EMAIL.toLowerCase() !== dto.employeeEmail.toLowerCase()) {
      throw new BadRequestException('O email informado nao corresponde ao usuario selecionado no Bitrix24');
    }
    const employee = await this.prisma.employee.upsert({
      where: { email: dto.employeeEmail.toLowerCase() },
      update: {
        bitrixId: String(dto.employeeBitrixUserId), nome: dto.employeeName, cpf: dto.cpf,
        cargo: dto.cargo, departamento: dto.departamento
      },
      create: {
        bitrixId: String(dto.employeeBitrixUserId), nome: dto.employeeName,
        email: dto.employeeEmail.toLowerCase(), cpf: dto.cpf,
        cargo: dto.cargo, departamento: dto.departamento
      }
    });
    const templateVersion = dto.templateVersionId
      ? await this.findTemplateVersion(dto.templateVersionId)
      : await this.findDefaultTemplateVersion();
    const signingConfig = await this.getSigningConfig();
    const request = await this.prisma.sendRequest.create({
      data: {
        employeeId: employee.id,
        templateVersionId: templateVersion.id,
        triggerType: SendTriggerType.MANUAL,
        status: SendRequestStatus.DRAFT,
        requestedByUserId,
        employeeSnapshot: this.toJson(this.employeeSnapshot(dto)),
        documentData: this.toJson({ city: dto.city || 'Sao Paulo' }),
        companySignerBitrixId: String(signingConfig.companySignerUserId),
        responsibleBitrixId: String(signingConfig.responsibleUserId),
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
    await this.prisma.$transaction([
      this.prisma.employee.update({
        where: { id: request.employeeId },
        data: { nome: dto.employeeName, email: dto.employeeEmail.toLowerCase(), cpf: dto.cpf, cargo: dto.cargo, departamento: dto.departamento }
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
    const config = await this.getSigningConfig();
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
      const result = await this.bitrix.sendHrSignature({
        externalId: id,
        fileName: request.documentFileName,
        pdf,
        companyCrmId: config.companyCrmId,
        employeeUserId: Number(request.employee.bitrixId),
        companySignerUserId: config.companySignerUserId,
        responsibleUserId: config.responsibleUserId,
        companyProviderUid: config.companyProviderUid,
        regionDocumentType: config.regionDocumentType || '12.999'
      });
      const signer = result.members.find((member) => member.role === 'signer');
      const assignee = result.members.find((member) => member.role === 'assignee');
      const signature = await this.prisma.signature.create({
        data: {
          sendRequestId: id,
          employeeId: request.employeeId,
          templateVersionId: request.templateVersionId,
          bitrixDocumentId: result.uid,
          bitrixDocumentUid: result.uid,
          signerMemberUid: signer?.uid,
          assigneeMemberUid: assignee?.uid,
          status: SignatureStatus.SENT,
          rawStatusCode: result.state.code,
          bitrixStage: result.state.name,
          sentAt: new Date(),
          lastSyncedAt: new Date(),
          archiveStatus: ArchiveStatus.NOT_REQUIRED
        }
      });
      await this.prisma.signatureEvent.create({
        data: { signatureId: signature.id, eventType: 'SIGN_B2E_SENT', status: SignatureStatus.SENT, bitrixStage: result.state.code }
      });
      await this.prisma.sendAttempt.update({
        where: { id: attempt.id },
        data: { status: SendAttemptStatus.SUCCESS, finishedAt: new Date(), bitrixResponse: this.toJson(result) }
      });
      return this.prisma.sendRequest.update({
        where: { id },
        data: { status: SendRequestStatus.SENT, sentAt: new Date(), lockedAt: new Date() },
        include: { employee: true, equipment: true, signatures: true }
      });
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

  private async getSigningConfig() {
    const setting = await this.prisma.setting.findUnique({ where: { key: 'bitrix.signing' } });
    if (!setting) throw new BadRequestException('Configure empresa, provedor e representantes do Bitrix24');
    const value = setting.value as unknown as BitrixSigningConfig;
    if (!value.safeAccessConfirmed) {
      throw new BadRequestException('Confirme a permissao de acesso ao cofre da empresa no Bitrix24');
    }
    return value;
  }

  private employeeSnapshot(dto: CreateSendRequestDto) {
    return {
      bitrixUserId: dto.employeeBitrixUserId,
      name: dto.employeeName,
      email: dto.employeeEmail.toLowerCase(),
      cpf: dto.cpf,
      cargo: dto.cargo,
      departamento: dto.departamento
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value));
  }
}
