import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ArchiveStatus, Prisma, SendRequestStatus, SignatureProvider, SignatureStatus, WebhookProcessingStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { PDFDocument } from 'pdf-lib';
import { BitrixService } from '../bitrix/bitrix.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ZapSignService } from '../signature-providers/zapsign.service';
import { ZapSignDocument } from '../signature-providers/zapsign.types';
import { SyncSignaturesDto } from './dto/sync-signatures.dto';
import { TermNotificationsService } from '../notifications/term-notifications.service';

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
    private readonly http: HttpService,
    private readonly zapSign: ZapSignService,
    private readonly notifications: TermNotificationsService
  ) {}

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

  async getLocalSigningSession(token: string) {
    const signature = await this.findLocalSignatureByToken(token);
    if (!signature.sendRequest?.unsignedStoragePath) {
      throw new BadRequestException('Documento local sem PDF para assinatura');
    }
    const finished = signature.status === SignatureStatus.SIGNED || signature.status === SignatureStatus.FINISHED;
    return {
      token,
      employeeName: signature.employee.nome,
      documentName: signature.sendRequest.documentFileName || 'Termo de Responsabilidade.pdf',
      status: signature.status,
      finished,
      previewUrl: await this.storage.createSignedUrl(
        finished && signature.signedStoragePath
          ? signature.signedStoragePath
          : signature.sendRequest.unsignedStoragePath,
        900,
        false
      )
    };
  }

  async completeLocalSigning(token: string, signatureDataUrl: string) {
    const signature = await this.findLocalSignatureByToken(token);
    if (signature.status === SignatureStatus.SIGNED || signature.status === SignatureStatus.FINISHED) {
      return this.getLocalSigningSession(token);
    }
    await this.simulateLocalSignature(signature.id, signatureDataUrl);
    return this.getLocalSigningSession(token);
  }

  async simulateLocalSignature(id: string, signatureDataUrl?: string) {
    if (!this.zapSign.isLocalMode()) throw new BadRequestException('Simulacao disponivel apenas no modo local');
    const signature = await this.findOne(id);
    if (!signature.sendRequestId || !signature.sendRequest?.unsignedStoragePath) {
      throw new BadRequestException('Assinatura local sem PDF de origem');
    }
    const sourcePdf = await this.storage.download(signature.sendRequest.unsignedStoragePath);
    const pdf = signatureDataUrl
      ? await this.applyHandwrittenSignature(sourcePdf, signatureDataUrl)
      : sourcePdf;
    const sha256 = createHash('sha256').update(pdf).digest('hex');
    const path = `signed/local/${signature.employee.bitrixId || signature.employeeId}/${signature.sendRequestId}-${sha256}.pdf`;
    await this.storage.upload(path, pdf, 'application/pdf', true);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.signature.update({
        where: { id },
        data: {
          status: SignatureStatus.FINISHED,
          rawStatusCode: 'local-signed',
          bitrixStage: 'Assinatura simulada localmente',
          signedAt: now,
          finishedAt: now,
          archiveStatus: ArchiveStatus.ARCHIVED,
          signedStoragePath: path,
          signedSha256: sha256,
          signedFileSize: pdf.length,
          archivedAt: now,
          lastSyncedAt: now,
          errorMessage: null
        }
      }),
      this.prisma.signatureEvent.create({
        data: {
          signatureId: id,
          eventType: 'LOCAL_SIGNATURE_SIMULATED',
          status: SignatureStatus.FINISHED,
          bitrixStage: 'Assinatura simulada localmente'
        }
      }),
      this.prisma.sendRequest.update({
        where: { id: signature.sendRequestId },
        data: { status: SendRequestStatus.SENT }
      })
    ]);
    await this.notifications.notifySigned(id, signature.sendRequestId, signature.employee.nome);
    return this.findOne(id);
  }

  private async findLocalSignatureByToken(token: string) {
    if (!this.zapSign.isLocalMode() || !token.startsWith('local-')) {
      throw new NotFoundException('Solicitacao de assinatura nao encontrada');
    }
    const signature = await this.prisma.signature.findUnique({
      where: { providerDocumentId: token },
      include: { employee: true, sendRequest: true }
    });
    if (!signature || signature.provider !== SignatureProvider.ZAPSIGN) {
      throw new NotFoundException('Solicitacao de assinatura nao encontrada');
    }
    return signature;
  }

  private async applyHandwrittenSignature(sourcePdf: Buffer, dataUrl: string) {
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!match) throw new BadRequestException('Assinatura precisa ser uma imagem PNG valida');
    const imageBytes = Buffer.from(match[1], 'base64');
    if (!imageBytes.length || imageBytes.length > 1_000_000
      || imageBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new BadRequestException('Imagem da assinatura invalida ou maior que 1 MB');
    }
    try {
      const document = await PDFDocument.load(sourcePdf);
      const image = await document.embedPng(imageBytes);
      const page = document.getPages().at(-1);
      if (!page) throw new Error('PDF sem paginas');
      const maxWidth = Math.min(210, page.getWidth() - 80);
      const scale = Math.min(maxWidth / image.width, 72 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: (page.getWidth() - width) / 2,
        y: 58,
        width,
        height
      });
      return Buffer.from(await document.save());
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Nao foi possivel aplicar a assinatura ao PDF');
    }
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

  async handleZapSignEvent(payload: Record<string, unknown>) {
    const documentToken = String(payload.token || '');
    const eventType = String(payload.event_type || 'unknown');
    if (!documentToken) throw new BadRequestException('Webhook ZapSign sem token do documento');
    const signature = await this.prisma.signature.findUnique({ where: { providerDocumentId: documentToken } });
    if (!signature || signature.provider !== SignatureProvider.ZAPSIGN) {
      throw new NotFoundException('Documento ZapSign nao pertence ao aplicativo');
    }
    const externalEventId = createHash('sha256')
      .update([eventType, documentToken, String(payload.status || ''), this.latestSignerTimestamp(payload)].join('|'))
      .digest('hex');
    try {
      await this.prisma.webhookEvent.create({
        data: {
          source: 'zapsign', eventType, externalEventId,
          payload: this.toJson(this.sanitizeZapSignPayload(payload)) as Prisma.InputJsonValue
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { ok: true, duplicate: true };
      }
      throw error;
    }
    try {
      await this.syncOne(signature.id, eventType, payload);
      await this.prisma.webhookEvent.update({
        where: { source_externalEventId: { source: 'zapsign', externalEventId } },
        data: { processingStatus: WebhookProcessingStatus.PROCESSED, processedAt: new Date() }
      });
      return { ok: true };
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: { source_externalEventId: { source: 'zapsign', externalEventId } },
        data: {
          processingStatus: WebhookProcessingStatus.FAILED,
          error: error instanceof Error ? error.message : 'Falha',
          processedAt: new Date()
        }
      });
      throw error;
    }
  }

  async retry(id: string) {
    return this.syncOne(id);
  }

  async retryArchive(id: string) {
    const signature = await this.findOne(id);
    if (signature.status !== SignatureStatus.SIGNED && signature.status !== SignatureStatus.FINISHED) {
      throw new BadRequestException('O documento ainda nao foi concluido pelo provedor de assinatura');
    }
    await this.prisma.signature.update({
      where: { id }, data: { archiveStatus: ArchiveStatus.PENDING, archiveError: null }
    });
    return signature.provider === SignatureProvider.ZAPSIGN
      ? this.archiveZapSign(id)
      : this.archiveBitrix(id);
  }

  async getFileUrl(id: string) {
    const signature = await this.findOne(id);
    if (!signature.signedStoragePath || signature.archiveStatus !== ArchiveStatus.ARCHIVED) {
      throw new NotFoundException('Backup do documento assinado ainda nao disponivel');
    }
    return {
      url: await this.storage.createSignedUrl(
        signature.signedStoragePath,
        300,
        signature.sendRequest?.documentFileName || 'Termo_de_Responsabilidade.pdf'
      ),
      expiresIn: 300
    };
  }

  private async syncOne(id: string, eventStatus?: string, payload?: unknown) {
    const signature = await this.findOne(id);
    if (signature.provider === SignatureProvider.ZAPSIGN) {
      return this.syncZapSign(signature, eventStatus, payload);
    }
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
    if (finalSigned && updated.archiveStatus !== ArchiveStatus.ARCHIVED) await this.archiveBitrix(id);
    return this.findOne(id);
  }

  private async syncZapSign(
    signature: Awaited<ReturnType<SignaturesService['findOne']>>,
    eventType?: string,
    payload?: unknown
  ) {
    if (!signature.providerDocumentId) {
      return this.prisma.signature.update({
        where: { id: signature.id }, data: { status: SignatureStatus.ERROR, errorMessage: 'Assinatura sem providerDocumentId' }
      });
    }
    const document = await this.zapSign.getDocument(signature.providerDocumentId);
    const signer = document.signers?.[0];
    const status = this.normalizeZapSignStatus(document, eventType);
    const now = new Date();
    const finalSigned = status === SignatureStatus.SIGNED || status === SignatureStatus.FINISHED;
    const updated = await this.prisma.signature.update({
      where: { id: signature.id },
      data: {
        status,
        rawStatusCode: document.status,
        bitrixStage: this.zapSignStage(status),
        viewedAt: signer?.last_view_at ? new Date(signer.last_view_at) : signature.viewedAt,
        signedAt: signer?.signed_at ? new Date(signer.signed_at) : finalSigned ? signature.signedAt || now : signature.signedAt,
        finishedAt: finalSigned ? signature.finishedAt || now : signature.finishedAt,
        archiveStatus: finalSigned && signature.archiveStatus === ArchiveStatus.NOT_REQUIRED
          ? ArchiveStatus.PENDING
          : signature.archiveStatus,
        lastSyncedAt: now,
        errorMessage: null
      }
    });
    await this.prisma.signatureEvent.create({
      data: {
        signatureId: signature.id,
        eventType: payload ? 'ZAPSIGN_EVENT' : 'ZAPSIGN_SYNC',
        status,
        bitrixStage: document.status,
        payload: this.toJson(this.sanitizeZapSignPayload((payload || document) as Record<string, unknown>))
      }
    });
    if (signature.sendRequestId) {
      await this.prisma.sendRequest.update({
        where: { id: signature.sendRequestId }, data: { status: this.toRequestStatus(status) }
      });
    }
    if (signature.sendRequestId) {
      await this.notifications.notifySent(signature.id, signature.sendRequestId, signature.employee.nome);
      if (finalSigned) {
        await this.notifications.notifySigned(signature.id, signature.sendRequestId, signature.employee.nome);
      }
    }
    if (finalSigned && updated.archiveStatus !== ArchiveStatus.ARCHIVED) {
      await this.archiveZapSign(signature.id, document);
    }
    return this.findOne(signature.id);
  }

  private async archiveBitrix(id: string) {
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

  private async archiveZapSign(id: string, document?: ZapSignDocument) {
    const signature = await this.findOne(id);
    if (!signature.sendRequestId) throw new BadRequestException('Assinatura sem solicitacao de origem');
    try {
      const current = document || await this.zapSign.getDocument(signature.providerDocumentId || '');
      if (!current.signed_file) throw new Error('Arquivo assinado ainda nao disponivel na ZapSign');
      const response = await firstValueFrom(this.http.get<ArrayBuffer>(current.signed_file, {
        responseType: 'arraybuffer', timeout: 30_000, maxContentLength: 20 * 1024 * 1024
      }));
      const pdf = Buffer.from(response.data);
      if (pdf.subarray(0, 4).toString('ascii') !== '%PDF') throw new Error('Arquivo assinado nao e um PDF valido');
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

  private normalizeZapSignStatus(document: ZapSignDocument, eventType?: string) {
    if (eventType === 'doc_refused') return SignatureStatus.DECLINED;
    if (eventType === 'doc_deleted' || eventType === 'doc_expired') return SignatureStatus.CANCELED;
    if (document.status === 'signed') return SignatureStatus.FINISHED;
    const signerStatus = document.signers?.[0]?.status;
    if (signerStatus === 'signed') return SignatureStatus.SIGNED;
    if (signerStatus === 'link-opened') return SignatureStatus.VIEWED;
    return SignatureStatus.SENT;
  }

  private zapSignStage(status: SignatureStatus) {
    const labels: Partial<Record<SignatureStatus, string>> = {
      [SignatureStatus.SENT]: 'Aguardando assinatura do colaborador',
      [SignatureStatus.VIEWED]: 'Documento visualizado pelo colaborador',
      [SignatureStatus.SIGNED]: 'Assinado pelo colaborador',
      [SignatureStatus.FINISHED]: 'Concluido e pronto para arquivamento',
      [SignatureStatus.DECLINED]: 'Recusado pelo colaborador',
      [SignatureStatus.CANCELED]: 'Documento cancelado ou expirado'
    };
    return labels[status] || status;
  }

  private latestSignerTimestamp(payload: Record<string, unknown>) {
    const signers = Array.isArray(payload.signers) ? payload.signers as Array<Record<string, unknown>> : [];
    return signers.map((signer) => String(signer.signed_at || signer.last_view_at || '')).sort().at(-1) || '';
  }

  private sanitizeZapSignPayload(payload: Record<string, unknown>) {
    const signers = Array.isArray(payload.signers) ? payload.signers as Array<Record<string, unknown>> : [];
    return {
      event_type: payload.event_type,
      external_id: payload.external_id,
      token: payload.token,
      status: payload.status,
      signers: signers.map((signer) => ({
        external_id: signer.external_id,
        status: signer.status,
        times_viewed: signer.times_viewed,
        last_view_at: signer.last_view_at,
        signed_at: signer.signed_at
      }))
    };
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
