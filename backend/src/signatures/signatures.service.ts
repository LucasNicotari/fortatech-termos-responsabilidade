import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ArchiveStatus, SendRequestStatus, SignatureStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { BitrixService } from '../bitrix/bitrix.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SyncSignaturesDto } from './dto/sync-signatures.dto';

const STATUS_MAP: Record<string, SignatureStatus> = {
  pending: SignatureStatus.PENDING,
  sent: SignatureStatus.SENT,
  waiting: SignatureStatus.SENT,
  viewed: SignatureStatus.VIEWED,
  in_progress: SignatureStatus.IN_PROGRESS,
  signing: SignatureStatus.IN_PROGRESS,
  signed: SignatureStatus.SIGNED,
  completed: SignatureStatus.FINISHED,
  done: SignatureStatus.FINISHED,
  finished: SignatureStatus.FINISHED,
  result: SignatureStatus.FINISHED,
  refused: SignatureStatus.DECLINED,
  declined: SignatureStatus.DECLINED,
  stopped: SignatureStatus.CANCELED,
  canceled: SignatureStatus.CANCELED,
  cancelled: SignatureStatus.CANCELED,
  error: SignatureStatus.ERROR
};

@Injectable()
export class SignaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrix: BitrixService,
    private readonly storage: StorageService,
    private readonly http: HttpService
  ) {}

  findAll() {
    return this.prisma.signature.findMany({
      orderBy: { createdAt: 'desc' },
      include: { employee: true, sendRequest: true, templateVersion: { include: { template: true } } }
    });
  }

  async findOne(id: string) {
    const result = await this.prisma.signature.findUnique({
      where: { id },
      include: {
        employee: true, sendRequest: true,
        templateVersion: { include: { template: true } },
        events: { orderBy: { createdAt: 'desc' } }
      }
    });
    if (!result) throw new NotFoundException('Assinatura nao encontrada');
    return result;
  }

  async sync(dto: SyncSignaturesDto) {
    if (dto.signatureId) return this.syncOne(dto.signatureId);
    const signatures = await this.prisma.signature.findMany({
      where: { status: { in: [SignatureStatus.PENDING, SignatureStatus.SENT, SignatureStatus.VIEWED, SignatureStatus.IN_PROGRESS, SignatureStatus.ERROR] } }
    });
    return Promise.all(signatures.map((signature) => this.syncOne(signature.id)));
  }

  async syncByDocumentUid(documentUid: string, eventStatus?: string, payload?: unknown) {
    if (!documentUid) throw new BadRequestException('Evento sem documentUid');
    const signature = await this.prisma.signature.findUnique({ where: { bitrixDocumentUid: documentUid } });
    if (!signature) throw new NotFoundException(`Documento Bitrix24 ${documentUid} nao pertence ao aplicativo`);
    return this.syncOne(signature.id, eventStatus, payload);
  }

  async retry(id: string) {
    return this.syncOne(id);
  }

  async retryArchive(id: string) {
    const signature = await this.findOne(id);
    if (signature.status !== SignatureStatus.SIGNED && signature.status !== SignatureStatus.FINISHED) {
      throw new BadRequestException('O documento ainda nao foi concluido no Bitrix24');
    }
    await this.prisma.signature.update({
      where: { id }, data: { archiveStatus: ArchiveStatus.PENDING, archiveError: null }
    });
    return this.archive(id);
  }

  async getFileUrl(id: string) {
    const signature = await this.findOne(id);
    if (!signature.signedStoragePath || signature.archiveStatus !== ArchiveStatus.ARCHIVED) {
      throw new NotFoundException('Backup do documento assinado ainda nao disponivel');
    }
    return { url: await this.storage.createSignedUrl(signature.signedStoragePath, 300), expiresIn: 300 };
  }

  private async syncOne(id: string, eventStatus?: string, payload?: unknown) {
    const signature = await this.findOne(id);
    if (!signature.bitrixDocumentUid) {
      return this.prisma.signature.update({
        where: { id }, data: { status: SignatureStatus.ERROR, errorMessage: 'Assinatura sem bitrixDocumentUid' }
      });
    }
    const document = await this.bitrix.getDocument(signature.bitrixDocumentUid);
    const rawStatus = document.state?.code || eventStatus || '';
    let status = this.normalizeStatus(rawStatus);
    const signer = document.members?.find((member) => member.role === 'signer');
    const assignee = document.members?.find((member) => member.role === 'assignee');
    if (status === SignatureStatus.IN_PROGRESS && signer?.state?.code === 'signed' && assignee?.state?.code === 'signed') {
      status = SignatureStatus.SIGNED;
    }
    const now = new Date();
    const finalSigned = status === SignatureStatus.SIGNED || status === SignatureStatus.FINISHED;
    const updated = await this.prisma.signature.update({
      where: { id },
      data: {
        status,
        rawStatusCode: rawStatus,
        bitrixStage: document.state?.name || eventStatus || signature.bitrixStage,
        signerMemberUid: signer?.uid || signature.signerMemberUid,
        assigneeMemberUid: assignee?.uid || signature.assigneeMemberUid,
        signedAt: finalSigned ? signature.signedAt || now : signature.signedAt,
        finishedAt: status === SignatureStatus.FINISHED ? signature.finishedAt || now : signature.finishedAt,
        canceledAt: status === SignatureStatus.CANCELED ? signature.canceledAt || now : signature.canceledAt,
        archiveStatus: finalSigned && signature.archiveStatus === ArchiveStatus.NOT_REQUIRED ? ArchiveStatus.PENDING : signature.archiveStatus,
        lastSyncedAt: now,
        errorMessage: null
      }
    });
    await this.prisma.signatureEvent.create({
      data: {
        signatureId: id,
        eventType: payload ? 'BITRIX_EVENT' : 'BITRIX_SYNC',
        status,
        bitrixStage: rawStatus,
        payload: this.toJson(payload || document)
      }
    });
    if (signature.sendRequestId) {
      await this.prisma.sendRequest.update({
        where: { id: signature.sendRequestId },
        data: { status: this.toRequestStatus(status) }
      });
    }
    if (finalSigned && updated.archiveStatus !== ArchiveStatus.ARCHIVED) await this.archive(id);
    return this.findOne(id);
  }

  private async archive(id: string) {
    const signature = await this.findOne(id);
    if (!signature.sendRequest?.documentFileName || !signature.sendRequestId) {
      throw new BadRequestException('Assinatura sem nome do documento de origem');
    }
    try {
      const expected = signature.sendRequest.documentFileName.toLowerCase().replace(/\.pdf$/, '');
      let found: Awaited<ReturnType<BitrixService['listSafeDocuments']>>[number] | undefined;
      for (let offset = 0; offset < 200 && !found; offset += 50) {
        const page = await this.bitrix.listSafeDocuments(50, offset);
        found = page.find((item) => item.title.toLowerCase().replace(/\.pdf$/, '') === expected);
        if (page.length < 50) break;
      }
      if (!found?.file_url) throw new Error('Documento concluido ainda nao apareceu no cofre da empresa');
      const response = await firstValueFrom(this.http.get<ArrayBuffer>(found.file_url, { responseType: 'arraybuffer' }));
      const pdf = Buffer.from(response.data);
      if (pdf.subarray(0, 4).toString('ascii') !== '%PDF') throw new Error('Arquivo do cofre nao e um PDF valido');
      const sha256 = createHash('sha256').update(pdf).digest('hex');
      const year = (signature.signedAt || new Date()).getFullYear();
      const path = `signed/${year}/${signature.employee.bitrixId || signature.employeeId}/${signature.sendRequestId}-${sha256}.pdf`;
      await this.storage.upload(path, pdf, 'application/pdf', true);
      return this.prisma.signature.update({
        where: { id },
        data: {
          archiveStatus: ArchiveStatus.ARCHIVED,
          archiveError: null,
          signedStoragePath: path,
          signedSha256: sha256,
          signedFileSize: pdf.length,
          bitrixSafeDocumentId: String(found.id),
          archivedAt: new Date()
        }
      });
    } catch (error) {
      return this.prisma.signature.update({
        where: { id },
        data: { archiveStatus: ArchiveStatus.FAILED, archiveError: error instanceof Error ? error.message : 'Falha no backup' }
      });
    }
  }

  private normalizeStatus(value?: string) {
    if (!value) return SignatureStatus.PENDING;
    return STATUS_MAP[value.toLowerCase()] || SignatureStatus.IN_PROGRESS;
  }

  private toRequestStatus(status: SignatureStatus) {
    if (status === SignatureStatus.SIGNED || status === SignatureStatus.FINISHED) return SendRequestStatus.SENT;
    if (status === SignatureStatus.DECLINED) return SendRequestStatus.DECLINED;
    if (status === SignatureStatus.CANCELED) return SendRequestStatus.CANCELED;
    if (status === SignatureStatus.ERROR) return SendRequestStatus.FAILED;
    return SendRequestStatus.IN_PROGRESS;
  }

  private toJson(value: unknown) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }
}
