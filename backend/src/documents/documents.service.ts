import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException
} from '@nestjs/common';
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

export function responsibilityDateParts(date: Date) {
  const timeZone = 'America/Sao_Paulo';
  const numericParts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    numericParts.find((part) => part.type === type)?.value || '';
  return {
    day: value('day'),
    month: new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone })
      .format(date)
      .toLocaleUpperCase('pt-BR'),
    year: Number(value('year'))
  };
}

@Injectable()
export class DocumentsService {
  private readonly conversionConcurrency: number;
  private readonly conversionQueueLimit: number;
  private readonly conversionQueueTimeoutMs: number;
  private activeConversions = 0;
  private readonly conversionQueue: Array<{
    grant: () => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {
    this.conversionConcurrency = this.configuredInteger(
      'PDF_CONVERSION_CONCURRENCY',
      1,
      1,
      4
    );
    this.conversionQueueLimit = this.configuredInteger(
      'PDF_CONVERSION_QUEUE_LIMIT',
      20,
      1,
      100
    );
    this.conversionQueueTimeoutMs = this.configuredInteger(
      'PDF_CONVERSION_QUEUE_TIMEOUT_MS',
      30_000,
      1_000,
      120_000
    );
  }

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

    const renderedDate = responsibilityDateParts(data.date);
    const template = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
    template.render({
      employeeName: data.employeeName,
      cpf: data.cpf,
      city: data.city || 'São Paulo',
      day: renderedDate.day,
      month: renderedDate.month,
      year: renderedDate.year,
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
    await this.acquireConversionSlot();
    try {
      return await this.performPdfConversion(docx);
    } finally {
      this.releaseConversionSlot();
    }
  }

  private async performPdfConversion(docx: Buffer) {
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

  private acquireConversionSlot() {
    if (this.activeConversions < this.conversionConcurrency) {
      this.activeConversions += 1;
      return Promise.resolve();
    }
    if (this.conversionQueue.length >= this.conversionQueueLimit) {
      throw new ServiceUnavailableException(
        'Fila de geracao de PDF cheia; tente novamente em instantes'
      );
    }
    return new Promise<void>((resolve, reject) => {
      let timer: NodeJS.Timeout;
      const entry = {
        grant: () => {
          clearTimeout(timer);
          this.activeConversions += 1;
          resolve();
        },
        reject,
        timer: undefined as unknown as NodeJS.Timeout
      };
      timer = setTimeout(() => {
        const index = this.conversionQueue.indexOf(entry);
        if (index >= 0) this.conversionQueue.splice(index, 1);
        reject(new ServiceUnavailableException(
          'Tempo de espera para gerar o PDF excedido; tente novamente'
        ));
      }, this.conversionQueueTimeoutMs);
      entry.timer = timer;
      this.conversionQueue.push(entry);
    });
  }

  private releaseConversionSlot() {
    this.activeConversions = Math.max(0, this.activeConversions - 1);
    const next = this.conversionQueue.shift();
    next?.grant();
  }

  private configuredInteger(key: string, fallback: number, minimum: number, maximum: number) {
    const parsed = Number(this.config.get<string>(key));
    return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
      ? parsed
      : fallback;
  }
}
