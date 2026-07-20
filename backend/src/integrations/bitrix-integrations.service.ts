import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole, WebhookProcessingStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { BitrixService } from '../bitrix/bitrix.service';
import { BitrixAuthPayload, BitrixUser } from '../bitrix/bitrix.types';
import { TokenCryptoService } from '../bitrix/token-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignaturesService } from '../signatures/signatures.service';

export interface BitrixSigningConfig {
  companyCrmId: number;
  companyProviderUid: string;
  companySignerUserId: number;
  responsibleUserId: number;
  regionDocumentType: string;
  safeAccessConfirmed: boolean;
}

@Injectable()
export class BitrixIntegrationsService {
  static readonly CONFIG_KEY = 'bitrix.signing';

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrix: BitrixService,
    private readonly crypto: TokenCryptoService,
    private readonly config: ConfigService,
    private readonly signatures: SignaturesService
  ) {}

  async install(payload: Record<string, unknown>) {
    const auth = this.parseAuth(payload);
    const currentUser = await this.bitrix.getCurrentUser(auth.access_token, auth.client_endpoint);
    if (!currentUser?.ID) throw new UnauthorizedException('Nao foi possivel validar o instalador no Bitrix24');
    const expiresAt = new Date(Date.now() + Number(auth.expires_in || 3600) * 1000);
    const user = await this.upsertInstaller(currentUser);
    await this.prisma.bitrixInstallation.upsert({
      where: { memberId: auth.member_id },
      update: {
        domain: auth.domain,
        clientEndpoint: auth.client_endpoint,
        serverEndpoint: auth.server_endpoint,
        accessTokenEncrypted: this.crypto.encrypt(auth.access_token),
        refreshTokenEncrypted: this.crypto.encrypt(auth.refresh_token),
        applicationTokenHash: auth.application_token ? this.crypto.hash(auth.application_token) : undefined,
        scope: auth.scope,
        expiresAt,
        active: true
      },
      create: {
        memberId: auth.member_id,
        domain: auth.domain,
        clientEndpoint: auth.client_endpoint,
        serverEndpoint: auth.server_endpoint,
        accessTokenEncrypted: this.crypto.encrypt(auth.access_token),
        refreshTokenEncrypted: this.crypto.encrypt(auth.refresh_token),
        applicationTokenHash: auth.application_token ? this.crypto.hash(auth.application_token) : null,
        scope: auth.scope,
        expiresAt
      }
    });
    const publicUrl = this.config.get<string>('PUBLIC_BACKEND_URL');
    const warnings: string[] = [];
    if (publicUrl) {
      const handler = `${publicUrl.replace(/\/$/, '')}/integrations/bitrix/events`;
      for (const event of ['OnAppInstall', 'OnSignB2eDocumentStatusChanged', 'OnSignB2eMemberStatusChanged', 'OnAppUninstall']) {
        try {
          await this.bitrix.bindEvent(event, handler, auth.access_token, auth.client_endpoint);
        } catch (error) {
          warnings.push(`${event}: ${error instanceof Error ? error.message : 'falha'}`);
        }
      }
    } else {
      warnings.push('PUBLIC_BACKEND_URL nao configurada; eventos nao foram registrados');
    }
    return { ok: true, memberId: auth.member_id, adminUserId: user.id, warnings };
  }

  async createLaunch(payload: Record<string, unknown>) {
    const auth = this.parseLaunchAuth(payload);
    const installation = await this.prisma.bitrixInstallation.findUnique({ where: { memberId: auth.memberId } });
    if (!installation?.active || installation.domain !== auth.domain) {
      throw new UnauthorizedException('Instalacao Bitrix24 nao reconhecida');
    }
    const bitrixUser = await this.bitrix.getCurrentUser(auth.accessToken, installation.clientEndpoint);
    const user = await this.prisma.user.findUnique({ where: { bitrixUserId: bitrixUser.ID } });
    if (!user?.active) throw new ForbiddenException('Usuario nao autorizado para este aplicativo');
    const code = randomBytes(32).toString('base64url');
    await this.prisma.bitrixLaunchCode.create({
      data: {
        codeHash: createHash('sha256').update(code).digest('hex'),
        userId: user.id,
        expiresAt: new Date(Date.now() + 2 * 60_000)
      }
    });
    return { code, frontendUrl: this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173' };
  }

  async handleEvent(payload: Record<string, unknown>) {
    const auth = (payload.auth || {}) as Record<string, unknown>;
    const memberId = String(auth.member_id || '');
    const appToken = String(auth.application_token || '');
    const installation = await this.prisma.bitrixInstallation.findUnique({ where: { memberId } });
    const eventType = String(payload.event || 'UNKNOWN').toUpperCase();
    const eventDomain = String(auth.domain || '');
    if (!installation || (eventDomain && eventDomain !== installation.domain)) {
      throw new UnauthorizedException('Evento Bitrix24 invalido');
    }
    if (eventType === 'ONAPPINSTALL') {
      if (!appToken || (installation.applicationTokenHash && !this.crypto.matchesHash(appToken, installation.applicationTokenHash))) {
        throw new UnauthorizedException('Evento de instalacao Bitrix24 invalido');
      }
      if (!installation.applicationTokenHash) {
        await this.prisma.bitrixInstallation.update({
          where: { id: installation.id },
          data: { applicationTokenHash: this.crypto.hash(appToken), active: true }
        });
      }
      return { ok: true };
    }
    if (!appToken || !installation.applicationTokenHash || !this.crypto.matchesHash(appToken, installation.applicationTokenHash)) {
      throw new UnauthorizedException('Evento Bitrix24 invalido');
    }
    if (eventType === 'ONAPPUNINSTALL') {
      await this.prisma.bitrixInstallation.update({ where: { id: installation.id }, data: { active: false } });
      return { ok: true };
    }
    const data = (payload.data || {}) as Record<string, unknown>;
    const documentUid = String(data.documentUid || '');
    const statusCode = String(data.statusCode || data.memberStatusCode || '');
    const safePayload = this.sanitizeEventPayload(payload);
    const externalEventId = createHash('sha256')
      .update([eventType, documentUid, String(data.memberUid || ''), statusCode, String(payload.ts || '')].join('|'))
      .digest('hex');
    try {
      await this.prisma.webhookEvent.create({
        data: { source: 'bitrix-app', eventType, externalEventId, payload: safePayload }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { ok: true, duplicate: true };
      }
      throw error;
    }
    try {
      await this.signatures.syncByDocumentUid(documentUid, statusCode, safePayload);
      await this.prisma.webhookEvent.update({
        where: { source_externalEventId: { source: 'bitrix-app', externalEventId } },
        data: { processed: true, processingStatus: WebhookProcessingStatus.PROCESSED, processedAt: new Date() }
      });
      return { ok: true };
    } catch (error) {
      await this.prisma.webhookEvent.update({
        where: { source_externalEventId: { source: 'bitrix-app', externalEventId } },
        data: { processingStatus: WebhookProcessingStatus.FAILED, error: error instanceof Error ? error.message : 'Falha', processedAt: new Date() }
      });
      throw error;
    }
  }

  async getSigningConfig(): Promise<BitrixSigningConfig> {
    const setting = await this.prisma.setting.findUnique({ where: { key: BitrixIntegrationsService.CONFIG_KEY } });
    if (!setting) throw new BadRequestException('Configuracao de assinatura Bitrix24 ainda nao concluida');
    const value = setting.value as unknown as BitrixSigningConfig;
    if (!value.safeAccessConfirmed) {
      throw new BadRequestException('Confirme a permissao de acesso ao cofre da empresa no Bitrix24');
    }
    return value;
  }

  async saveSigningConfig(value: BitrixSigningConfig, userId: string) {
    if (!Number.isInteger(value.companyCrmId) || value.companyCrmId <= 0 ||
        !Number.isInteger(value.companySignerUserId) || value.companySignerUserId <= 0 ||
        !Number.isInteger(value.responsibleUserId) || value.responsibleUserId <= 0 ||
        !value.companyProviderUid || value.safeAccessConfirmed !== true) {
      throw new BadRequestException('Configuracao Bitrix24 incompleta');
    }
    const normalized = { ...value, regionDocumentType: value.regionDocumentType || '12.999' };
    return this.prisma.setting.upsert({
      where: { key: BitrixIntegrationsService.CONFIG_KEY },
      update: { value: this.toJson(normalized), updatedByUserId: userId },
      create: {
        key: BitrixIntegrationsService.CONFIG_KEY,
        value: this.toJson(normalized),
        description: 'Empresa, provedor e participantes fixos do Bitrix24 Sign B2E',
        updatedByUserId: userId
      }
    });
  }

  private async upsertInstaller(bitrixUser: BitrixUser) {
    const name = [bitrixUser.NAME, bitrixUser.LAST_NAME].filter(Boolean).join(' ') || `Bitrix ${bitrixUser.ID}`;
    const email = bitrixUser.EMAIL || `bitrix-${bitrixUser.ID}@local.invalid`;
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ bitrixUserId: bitrixUser.ID }, { email }] } });
    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { bitrixUserId: bitrixUser.ID, name, email, role: UserRole.ADMIN, active: true }
      });
    }
    return this.prisma.user.create({ data: { bitrixUserId: bitrixUser.ID, name, email, role: UserRole.ADMIN } });
  }

  private parseAuth(payload: Record<string, unknown>): BitrixAuthPayload {
    const auth = (payload.auth || payload) as Record<string, unknown>;
    const parsed = {
      access_token: String(auth.access_token || auth.AUTH_ID || ''),
      refresh_token: String(auth.refresh_token || auth.REFRESH_ID || ''),
      expires_in: String(auth.expires_in || auth.AUTH_EXPIRES || 3600),
      scope: String(auth.scope || ''),
      domain: String(auth.domain || auth.DOMAIN || ''),
      client_endpoint: String(auth.client_endpoint || ''),
      server_endpoint: String(auth.server_endpoint || 'https://oauth.bitrix.info/rest/'),
      member_id: String(auth.member_id || ''),
      application_token: String(auth.application_token || '')
    };
    if (!parsed.access_token || !parsed.refresh_token || !parsed.domain || !parsed.member_id) {
      throw new BadRequestException('Payload de instalacao Bitrix24 incompleto');
    }
    if (!parsed.client_endpoint) parsed.client_endpoint = `https://${parsed.domain}/rest/`;
    return parsed;
  }

  private parseLaunchAuth(payload: Record<string, unknown>) {
    const accessToken = String(payload.AUTH_ID || (payload.auth as Record<string, unknown> | undefined)?.access_token || '');
    const memberId = String(payload.member_id || (payload.auth as Record<string, unknown> | undefined)?.member_id || '');
    const domain = String(payload.DOMAIN || (payload.auth as Record<string, unknown> | undefined)?.domain || '');
    if (!accessToken || !memberId || !domain) throw new BadRequestException('Contexto de abertura Bitrix24 incompleto');
    return { accessToken, memberId, domain };
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value));
  }

  private sanitizeEventPayload(payload: Record<string, unknown>) {
    const auth = (payload.auth || {}) as Record<string, unknown>;
    return this.toJson({
      event: payload.event,
      event_handler_id: payload.event_handler_id,
      data: payload.data,
      ts: payload.ts,
      auth: {
        member_id: auth.member_id,
        domain: auth.domain,
        scope: auth.scope,
        status: auth.status
      }
    });
  }
}
