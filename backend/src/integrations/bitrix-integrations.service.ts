import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserRole, WebhookProcessingStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { BitrixService } from '../bitrix/bitrix.service';
import { BitrixAuthPayload, BitrixUser } from '../bitrix/bitrix.types';
import { TokenCryptoService } from '../bitrix/token-crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { SignaturesService } from '../signatures/signatures.service';

export function resolveBitrixExpiry(value: unknown, now = Date.now()) {
  const fallback = new Date(now + 3600 * 1000);
  if (value instanceof Date) return value.getTime() > now ? value : fallback;
  if (typeof value === 'string' && value.trim() && !/^\d+(\.\d+)?$/.test(value.trim())) {
    const parsedDate = Date.parse(value);
    return Number.isFinite(parsedDate) && parsedDate > now ? new Date(parsedDate) : fallback;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  const timestamp = numeric > 100_000_000_000
    ? numeric
    : numeric > 1_000_000_000
      ? numeric * 1000
      : now + numeric * 1000;
  return timestamp > now ? new Date(timestamp) : fallback;
}

@Injectable()
export class BitrixIntegrationsService {
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
    const expiresAt = resolveBitrixExpiry(auth.expires_in);
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
      try {
        const boundEvents = await this.bitrix.listBoundEvents(auth.access_token, auth.client_endpoint);
        for (const event of ['OnAppInstall', 'OnAppUninstall']) {
          const alreadyBound = (boundEvents || []).some((item) =>
            item.event.toLowerCase() === event.toLowerCase() &&
            item.handler.replace(/\/$/, '') === handler.replace(/\/$/, '')
          );
          if (alreadyBound) continue;
          try {
            await this.bitrix.bindEvent(event, handler, auth.access_token, auth.client_endpoint);
          } catch (error) {
            warnings.push(`${event}: ${error instanceof Error ? error.message : 'falha'}`);
          }
        }
      } catch (error) {
        warnings.push(`event.get: ${error instanceof Error ? error.message : 'falha'}`);
      }
      try {
        await this.bitrix.ensureRestAppUriPlacement(
          `${publicUrl.replace(/\/$/, '')}/integrations/bitrix/launch`
        );
      } catch (error) {
        warnings.push(`REST_APP_URI: ${error instanceof Error ? error.message : 'falha'}`);
      }
    } else {
      warnings.push('PUBLIC_BACKEND_URL nao configurada; eventos nao foram registrados');
    }
    if (warnings.length) {
      await this.prisma.integrationLog.create({
        data: {
          type: 'BITRIX_LIFECYCLE_EVENTS_WARNING',
          source: 'bitrix',
          endpoint: publicUrl ? `${publicUrl.replace(/\/$/, '')}/integrations/bitrix/events` : undefined,
          method: 'event.bind',
          error: warnings.join('; ').slice(0, 2000)
        }
      });
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
    await this.prisma.bitrixInstallation.update({
      where: { id: installation.id },
      data: {
        accessTokenEncrypted: this.crypto.encrypt(auth.accessToken),
        expiresAt: new Date(Date.now() + 55 * 60_000),
        active: true
      }
    });
    const code = randomBytes(32).toString('base64url');
    const signingToken = this.signingTokenFromPlacement(payload);
    if (signingToken) {
      const invitation = await this.prisma.signingInvitation.findUnique({
        where: { tokenHash: createHash('sha256').update(signingToken).digest('hex') },
        include: { signature: { include: { employee: true } } }
      });
      if (!invitation
        || invitation.revokedAt
        || invitation.expiresAt <= new Date()
        || invitation.bitrixUserId !== String(bitrixUser.ID)
        || invitation.signature.employee.bitrixId !== String(bitrixUser.ID)) {
        throw new ForbiddenException('Este termo nao pertence ao usuario conectado ou o convite expirou');
      }
      await this.prisma.$transaction([
        this.prisma.bitrixLaunchCode.create({
          data: {
            codeHash: createHash('sha256').update(code).digest('hex'),
            signingInvitationId: invitation.id,
            expiresAt: new Date(Date.now() + 2 * 60_000)
          }
        }),
        this.prisma.signingInvitation.update({
          where: { id: invitation.id },
          data: { openedAt: invitation.openedAt || new Date() }
        }),
        ...(invitation.completedAt ? [] : [
          this.prisma.signature.update({
            where: { id: invitation.signatureId },
            data: { status: 'VIEWED', viewedAt: invitation.signature.viewedAt || new Date(), bitrixStage: 'Aberto pelo colaborador no Bitrix24' }
          }),
          this.prisma.signatureEvent.create({
            data: {
              signatureId: invitation.signatureId,
              eventType: 'FORTADOCS_SIGNING_OPENED',
              status: 'VIEWED',
              payload: { bitrixUserId: bitrixUser.ID }
            }
          })
        ])
      ]);
      return {
        code,
        frontendUrl: `${(this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173').replace(/\/$/, '')}/sign`
      };
    }
    const user = await this.prisma.user.findUnique({ where: { bitrixUserId: bitrixUser.ID } });
    if (!user?.active) throw new ForbiddenException('Usuario nao autorizado para este aplicativo');
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
        data: { processingStatus: WebhookProcessingStatus.PROCESSED, processedAt: new Date() }
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
    const domain = this.validatePortalDomain(String(auth.domain || auth.DOMAIN || ''));
    const parsed = {
      access_token: String(auth.access_token || auth.AUTH_ID || ''),
      refresh_token: String(auth.refresh_token || auth.REFRESH_ID || ''),
      expires_in: String(auth.expires_in || auth.AUTH_EXPIRES || 3600),
      scope: String(auth.scope || ''),
      domain,
      client_endpoint: domain ? `https://${domain}/rest/` : '',
      server_endpoint: 'https://oauth.bitrix.info/rest/',
      member_id: String(auth.member_id || ''),
      application_token: String(auth.application_token || '')
    };
    const missing = [
      ['access_token', parsed.access_token],
      ['refresh_token', parsed.refresh_token],
      ['domain', parsed.domain],
      ['member_id', parsed.member_id]
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
      throw new BadRequestException(`Payload de instalacao Bitrix24 incompleto; campos ausentes: ${missing.join(', ')}`);
    }
    return parsed;
  }

  private parseLaunchAuth(payload: Record<string, unknown>) {
    const accessToken = String(payload.AUTH_ID || (payload.auth as Record<string, unknown> | undefined)?.access_token || '');
    const memberId = String(payload.member_id || (payload.auth as Record<string, unknown> | undefined)?.member_id || '');
    const domain = this.validatePortalDomain(
      String(payload.DOMAIN || payload.domain || (payload.auth as Record<string, unknown> | undefined)?.domain || '')
    );
    if (!accessToken || !memberId || !domain) throw new BadRequestException('Contexto de abertura Bitrix24 incompleto');
    return { accessToken, memberId, domain };
  }

  private signingTokenFromPlacement(payload: Record<string, unknown>) {
    if (String(payload.PLACEMENT || '').toUpperCase() !== 'REST_APP_URI') return '';
    const raw = payload.PLACEMENT_OPTIONS;
    if (typeof raw !== 'string' || !raw.trim()) return '';
    try {
      const options = JSON.parse(raw) as Record<string, unknown>;
      const token = String(options.signing || '');
      return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : '';
    } catch {
      return '';
    }
  }

  private validatePortalDomain(rawDomain: string) {
    const domain = rawDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain || !/^[a-z0-9.-]+$/.test(domain)) return '';
    const configured = (this.config.get<string>('BITRIX_PORTAL_ORIGIN') || '')
      .split(/\s+/).map((origin) => origin.trim()).filter(Boolean);
    const allowed = configured.some((origin) => {
      try {
        const hostnamePattern = new URL(origin.replace('*.', 'placeholder.')).hostname.toLowerCase();
        return origin.includes('*.')
          ? domain.endsWith(hostnamePattern.slice('placeholder'.length))
          : domain === hostnamePattern;
      } catch {
        return false;
      }
    });
    if (!allowed) throw new UnauthorizedException('Dominio Bitrix24 nao autorizado');
    return domain;
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
