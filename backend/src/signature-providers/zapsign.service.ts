import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, timingSafeEqual } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { LogsService } from '../logs/logs.service';
import { CreateZapSignDocumentInput, ZapSignDocument } from './zapsign.types';

@Injectable()
export class ZapSignService {
  private readonly apiUrl: string;
  private readonly apiToken: string;
  private readonly webhookSecret: string;
  private readonly localMode: boolean;
  private readonly localDocuments = new Map<string, ZapSignDocument>();

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
    private readonly logs: LogsService
  ) {
    this.apiUrl = this.normalizeApiUrl(
      config.get<string>('ZAPSIGN_API_URL') || 'https://sandbox.api.zapsign.com.br/api/v1'
    );
    this.apiToken = (config.get<string>('ZAPSIGN_API_TOKEN') || '').trim();
    this.webhookSecret = (config.get<string>('ZAPSIGN_WEBHOOK_SECRET') || '').trim();
    this.localMode = config.get<string>('LOCAL_DEVELOPMENT_MODE') === 'true';
  }

  status() {
    return {
      provider: 'zapsign',
      environment: this.apiUrl.includes('sandbox.') ? 'sandbox' : 'production',
      configured: this.localMode || Boolean(this.apiToken),
      webhookConfigured: this.localMode || Boolean(this.webhookSecret),
      emailDelivery: !this.localMode,
      signerCount: 1,
      local: this.localMode
    };
  }

  isLocalMode() {
    return this.localMode;
  }

  async createDocument(input: CreateZapSignDocumentInput) {
    if (this.localMode) {
      const token = `local-${randomUUID()}`;
      const document: ZapSignDocument = {
        token,
        external_id: input.externalId,
        status: 'pending',
        name: input.fileName,
        original_file: null,
        signed_file: null,
        signers: [{
          token: `local-signer-${input.externalId}`,
          status: 'new',
          name: input.signer.name,
          email: input.signer.email
        }]
      };
      this.localDocuments.set(token, document);
      return document;
    }
    this.assertConfigured();
    if (input.pdf.length > 10 * 1024 * 1024) {
      throw new BadRequestException('O PDF excede o limite de 10 MB aceito pela ZapSign');
    }
    const startedAt = Date.now();
    const payload = {
      name: input.fileName,
      base64_pdf: input.pdf.toString('base64'),
      lang: 'pt-br',
      disable_signer_emails: false,
      brand_name: 'Forta Tech',
      external_id: input.externalId,
      folder_path: '/termos-de-responsabilidade/homologacao/',
      signature_order_active: false,
      observers: [...new Set(input.observers || [])].slice(0, 20),
      allow_refuse_signature: true,
      signers: [{
        external_id: input.signer.externalId,
        name: input.signer.name,
        email: input.signer.email,
        cpf: input.signer.cpf.replace(/\D/g, ''),
        require_cpf: true,
        auth_mode: 'assinaturaTela-tokenEmail',
        send_automatic_email: true,
        lock_name: true,
        lock_email: true,
        qualification: 'Colaborador',
        custom_message: 'Revise o Termo de Responsabilidade e, se estiver de acordo, conclua a assinatura.'
      }]
    };
    try {
      const response = await firstValueFrom(this.http.post<ZapSignDocument>(`${this.apiUrl}/docs/`, payload, {
        headers: { Authorization: `Bearer ${this.apiToken}`, 'Content-Type': 'application/json' },
        timeout: 30_000,
        maxBodyLength: 15 * 1024 * 1024
      }));
      if (!response.data?.token || response.data.signers?.length !== 1) {
        throw new Error('Resposta da ZapSign sem documento ou com quantidade inesperada de signatarios');
      }
      await this.logs.create({
        type: 'ZAPSIGN_DOCUMENT_CREATED', source: 'zapsign', endpoint: '/docs/', method: 'POST',
        httpStatus: response.status, durationMs: Date.now() - startedAt,
        response: { status: response.data.status, signerCount: response.data.signers.length }
      });
      return response.data;
    } catch (error) {
      const message = this.errorMessage(error, 'Falha ao enviar o documento para a ZapSign');
      await this.logs.create({
        type: 'ZAPSIGN_DOCUMENT_ERROR', source: 'zapsign', endpoint: '/docs/', method: 'POST',
        durationMs: Date.now() - startedAt, error: message
      });
      throw new ServiceUnavailableException(message);
    }
  }

  async getDocument(token: string) {
    if (this.localMode) {
      const document = this.localDocuments.get(token);
      if (document) return document;
      return {
        token, status: 'pending', name: 'Documento local',
        original_file: null, signed_file: null, signers: []
      } satisfies ZapSignDocument;
    }
    this.assertConfigured();
    try {
      const response = await firstValueFrom(this.http.get<ZapSignDocument>(
        `${this.apiUrl}/docs/${encodeURIComponent(token)}/`,
        { headers: { Authorization: `Bearer ${this.apiToken}` }, timeout: 20_000 }
      ));
      return response.data;
    } catch (error) {
      throw new ServiceUnavailableException(this.errorMessage(error, 'Falha ao consultar o documento na ZapSign'));
    }
  }

  assertWebhookAuthorization(value?: string) {
    if (this.localMode) return;
    if (!this.webhookSecret) throw new ServiceUnavailableException('ZAPSIGN_WEBHOOK_SECRET nao configurado');
    const expected = Buffer.from(`Bearer ${this.webhookSecret}`);
    const received = Buffer.from(value || '');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new UnauthorizedException('Webhook ZapSign nao autorizado');
    }
  }

  private assertConfigured() {
    if (!this.apiToken) {
      throw new ServiceUnavailableException('Configure ZAPSIGN_API_TOKEN para habilitar o envio ao colaborador');
    }
  }

  private normalizeApiUrl(value: string) {
    const url = new URL(value);
    const allowedHosts = ['sandbox.api.zapsign.com.br', 'api.zapsign.com.br', 'br.api.zapsign.com.br'];
    if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname)) {
      throw new Error('ZAPSIGN_API_URL precisa apontar para um endpoint HTTPS oficial da ZapSign');
    }
    return url.toString().replace(/\/$/, '');
  }

  private errorMessage(error: unknown, fallback: string) {
    const response = (error as { response?: { data?: unknown } })?.response?.data;
    if (typeof response === 'string' && response.trim()) return `${fallback}: ${response.slice(0, 300)}`;
    if (response && typeof response === 'object') {
      const safe = JSON.stringify(response).replace(
        /"(token|sign_url|original_file|signed_file|cpf|email|name)":"[^"]+"/gi,
        '"$1":"[REDACTED]"'
      );
      return `${fallback}: ${safe.slice(0, 500)}`;
    }
    return error instanceof Error ? `${fallback}: ${error.message}` : fallback;
  }
}
