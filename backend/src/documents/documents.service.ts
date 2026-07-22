import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentTemplateVersion } from '@prisma/client';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { pathToFileURL } from 'url';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  formatResponsibilityTemplateXml,
  parameterizeResponsibilityTemplateXml
} from './template-parameterizer';

export interface ResponsibilityDocumentData {
  employeeName: string;
  cpf: string;
  city?: string;
  date: Date;
  equipments: Array<{
    item: string;
    quantity: number;
    description: string;
    serialNumber?: string;
    assetTag?: string;
    accessories?: string;
  }>;
}

export function libreOfficeConversionArguments(directory: string, input: string) {
  const profile = pathToFileURL(join(directory, 'libreoffice-profile')).href;
  return [
    '--headless',
    `-env:UserInstallation=${profile}`,
    '--convert-to', 'pdf',
    '--outdir', directory,
    input
  ];
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  async renderResponsibilityTerm(version: DocumentTemplateVersion, data: ResponsibilityDocumentData) {
    const source = await this.loadTemplate(version);
    return this.renderSource(source, data);
  }

  async validateResponsibilityTemplate(source: Buffer) {
    const rendered = await this.renderSource(source, {
      employeeName: 'COLABORADOR DE HOMOLOGACAO',
      cpf: '000.000.000-00',
      city: 'Sao Paulo',
      date: new Date('2026-01-15T12:00:00Z'),
      equipments: [
        { item: '01', quantity: 1, description: 'Notebook de teste', serialNumber: 'TESTE-001', assetTag: 'HML-001', accessories: 'Carregador' },
        { item: '02', quantity: 1, description: 'Monitor de teste', serialNumber: 'TESTE-002', assetTag: 'HML-002', accessories: '-' }
      ]
    });
    return {
      sourceSha256: createHash('sha256').update(source).digest('hex'),
      previewSha256: rendered.sha256,
      previewSize: rendered.pdf.length
    };
  }

  private async renderSource(source: Buffer, data: ResponsibilityDocumentData) {
    let zip: PizZip;
    try {
      zip = new PizZip(source);
    } catch {
      throw new UnprocessableEntityException('O arquivo enviado nao e um DOCX valido');
    }
    const documentXml = zip.file('word/document.xml')?.asText();
    if (!documentXml) throw new UnprocessableEntityException('Template DOCX sem word/document.xml');
    const parameterizedXml = formatResponsibilityTemplateXml(
      parameterizeResponsibilityTemplateXml(documentXml)
    );
    const missingMarkers = ['{employeeName}', '{cpf}', '{#equipments}', '{/equipments}']
      .filter((marker) => !parameterizedXml.includes(marker));
    if (missingMarkers.length) {
      throw new UnprocessableEntityException(`Template sem campos obrigatorios: ${missingMarkers.join(', ')}`);
    }
    zip.file('word/document.xml', parameterizedXml);

    const month = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'America/Sao_Paulo' })
      .format(data.date).toLocaleUpperCase('pt-BR');
    const template = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    template.render({
      employeeName: data.employeeName,
      cpf: data.cpf,
      city: data.city || 'São Paulo',
      day: String(data.date.getDate()).padStart(2, '0'),
      month,
      year: data.date.getFullYear(),
      assetTags: data.equipments.map((item) => item.assetTag).filter(Boolean).join(', ') || 'N/A',
      equipments: data.equipments.map((item, index) => ({
        ...item,
        item: item.item || String(index + 1).padStart(2, '0'),
        serialLine: item.serialNumber ? `\nN/S: ${item.serialNumber}` : '',
        assetLine: item.assetTag ? `\nPatrimônio: ${item.assetTag}` : '',
        accessories: item.accessories || '-'
      }))
    });
    const docx = template.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    const pdf = await this.convertToPdf(docx);
    return {
      docx,
      pdf,
      sha256: createHash('sha256').update(pdf).digest('hex')
    };
  }

  private async loadTemplate(version: DocumentTemplateVersion) {
    if (version.sourceStoragePath) return this.storage.download(version.sourceStoragePath);
    const configuredPath = this.config.get<string>('RESPONSIBILITY_TEMPLATE_PATH');
    if (!configuredPath) {
      throw new UnprocessableEntityException('RESPONSIBILITY_TEMPLATE_PATH nao configurado e template nao importado');
    }
    const source = await readFile(configuredPath);
    const sha256 = createHash('sha256').update(source).digest('hex');
    const storagePath = `templates/${version.id}/${sha256}.docx`;
    await this.storage.upload(
      storagePath,
      source,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      true
    );
    await this.prisma.documentTemplateVersion.update({
      where: { id: version.id },
      data: { sourceStoragePath: storagePath, sourceSha256: sha256 }
    });
    return source;
  }

  private async convertToPdf(docx: Buffer) {
    const directory = await mkdtemp(join(tmpdir(), 'fortatech-term-'));
    const input = join(directory, 'term.docx');
    try {
      await writeFile(input, docx);
      const binary = this.config.get<string>('LIBREOFFICE_BIN') || 'libreoffice';
      await new Promise<void>((resolve, reject) => {
        const process = spawn(binary, libreOfficeConversionArguments(directory, input), {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe']
        });
        let stderr = '';
        const timeout = setTimeout(() => {
          process.kill();
          reject(new Error('Conversao PDF excedeu 60 segundos'));
        }, 60_000);
        process.stderr.on('data', (chunk) => { stderr += String(chunk); });
        process.on('error', (error) => { clearTimeout(timeout); reject(error); });
        process.on('exit', (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`LibreOffice falhou (${code}): ${stderr}`));
          }
        });
      });
      return await readFile(join(directory, `${basename(input, '.docx')}.pdf`));
    } catch (error) {
      throw new UnprocessableEntityException(
        `Nao foi possivel gerar o PDF: ${error instanceof Error ? error.message : 'erro desconhecido'}`
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
