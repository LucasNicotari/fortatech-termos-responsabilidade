import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export interface UploadedDocx {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface UploadTemplateInput {
  templateId?: string;
  name?: string;
  version: string;
  description?: string;
  makeDefault: boolean;
}

@Injectable()
export class TemplatesService {
  private static readonly DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly documents: DocumentsService
  ) {}

  findAll() {
    return this.prisma.documentTemplate.findMany({
      orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
      include: {
        versions: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }
      }
    });
  }

  async upload(file: UploadedDocx | undefined, input: UploadTemplateInput, actorUserId: string) {
    this.validateUpload(file, input);
    const source = file!.buffer;
    const validation = await this.documents.validateResponsibilityTemplate(source);
    const existingTemplate = input.templateId
      ? await this.prisma.documentTemplate.findUnique({ where: { id: input.templateId } })
      : null;
    if (input.templateId && !existingTemplate) throw new NotFoundException('Tipo de termo nao encontrado');
    if (!existingTemplate && !input.name?.trim()) throw new BadRequestException('Informe o nome do novo tipo de termo');

    const templateId = existingTemplate?.id || randomUUID();
    const versionId = randomUUID();
    const storagePath = `templates/${templateId}/${versionId}-${validation.sourceSha256}.docx`;
    await this.storage.upload(storagePath, source, TemplatesService.DOCX_MIME);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const template = existingTemplate || await transaction.documentTemplate.create({
          data: {
            id: templateId,
            nome: input.name!.trim(),
            descricao: input.description?.trim() || null,
            ativo: true
          }
        });
        const defaultExists = await transaction.documentTemplateVersion.count({ where: { isDefault: true, ativo: true } });
        const makeDefault = input.makeDefault || defaultExists === 0;
        if (makeDefault) await transaction.documentTemplateVersion.updateMany({ data: { isDefault: false } });
        const version = await transaction.documentTemplateVersion.create({
          data: {
            id: versionId,
            templateId: template.id,
            versao: input.version.trim(),
            descricao: input.description?.trim() || null,
            sourceStoragePath: storagePath,
            sourceSha256: validation.sourceSha256,
            isDefault: makeDefault,
            ativo: true
          }
        });
        await transaction.documentTemplate.update({ where: { id: template.id }, data: { ativo: true } });
        await transaction.auditEvent.create({
          data: {
            actorUserId,
            entityType: 'DOCUMENT_TEMPLATE_VERSION',
            entityId: version.id,
            action: 'UPLOAD',
            after: this.toJson({
              templateId: template.id, version: version.versao, sourceSha256: validation.sourceSha256,
              previewSha256: validation.previewSha256, previewSize: validation.previewSize,
              isDefault: makeDefault, originalFileName: file!.originalname
            })
          }
        });
        return { template, version, validation };
      });
    } catch (error) {
      await this.storage.remove(storagePath).catch(() => undefined);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ja existe uma versao com esse numero para o tipo de termo selecionado');
      }
      throw error;
    }
  }

  async setDefault(versionId: string, actorUserId: string) {
    const version = await this.prisma.documentTemplateVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Versao de termo nao encontrada');
    return this.prisma.$transaction(async (transaction) => {
      await transaction.documentTemplateVersion.updateMany({ data: { isDefault: false } });
      const updated = await transaction.documentTemplateVersion.update({
        where: { id: versionId }, data: { isDefault: true, ativo: true }
      });
      await transaction.documentTemplate.update({ where: { id: version.templateId }, data: { ativo: true } });
      await transaction.auditEvent.create({
        data: {
          actorUserId,
          entityType: 'DOCUMENT_TEMPLATE_VERSION', entityId: versionId, action: 'SET_DEFAULT',
          after: this.toJson({ isDefault: true, ativo: true })
        }
      });
      return updated;
    });
  }

  async setVersionActive(versionId: string, active: boolean, actorUserId: string) {
    const version = await this.prisma.documentTemplateVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Versao de termo nao encontrada');
    if (version.isDefault && !active) throw new BadRequestException('Escolha outra versao padrao antes de desativar esta');
    const updated = await this.prisma.documentTemplateVersion.update({ where: { id: versionId }, data: { ativo: active } });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId,
        entityType: 'DOCUMENT_TEMPLATE_VERSION', entityId: versionId, action: active ? 'ACTIVATE' : 'DEACTIVATE',
        before: this.toJson({ ativo: version.ativo }), after: this.toJson({ ativo: active })
      }
    });
    return updated;
  }

  async sourceUrl(versionId: string) {
    const version = await this.prisma.documentTemplateVersion.findUnique({ where: { id: versionId } });
    if (!version?.sourceStoragePath) throw new NotFoundException('Arquivo DOCX desta versao ainda nao foi importado');
    return { url: await this.storage.createSignedUrl(version.sourceStoragePath, 300), expiresIn: 300 };
  }

  private validateUpload(file: UploadedDocx | undefined, input: UploadTemplateInput) {
    if (!file?.buffer?.length) throw new BadRequestException('Selecione um arquivo DOCX');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('O DOCX deve ter no maximo 10 MB');
    if (!file.originalname.toLowerCase().endsWith('.docx')) throw new BadRequestException('Envie um arquivo com extensao .docx');
    if (file.mimetype && ![TemplatesService.DOCX_MIME, 'application/octet-stream'].includes(file.mimetype)) {
      throw new BadRequestException('Tipo de arquivo invalido; envie um DOCX');
    }
    if (!input.version?.trim() || input.version.trim().length > 40) {
      throw new BadRequestException('Informe uma versao com ate 40 caracteres');
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value));
  }
}
