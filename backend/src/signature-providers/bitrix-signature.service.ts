import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { BitrixService } from '../bitrix/bitrix.service';
import { BitrixCompanyProvider } from '../bitrix/bitrix.types';
import { PrismaService } from '../prisma/prisma.service';

const SETTINGS_KEY = 'bitrix_signature';

export interface BitrixSignatureSettings {
  companyCrmId: number;
  representativeUserId: number;
  providerUid?: string;
  regionDocumentType: string;
}

@Injectable()
export class BitrixSignatureService {
  private readonly localMode: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrix: BitrixService,
    private readonly config: ConfigService
  ) {
    this.localMode = config.get<string>('LOCAL_DEVELOPMENT_MODE') === 'true';
  }

  async status() {
    if (this.localMode) {
      return {
        provider: 'bitrix' as const,
        environment: 'local' as const,
        configured: true,
        local: true,
        companyCrmId: this.defaultCompanyCrmId(),
        representativeUserId: 8465,
        providerName: 'Bitrix24 local',
        portalUrl: 'http://localhost:5173'
      };
    }
    const settings = await this.getSettings();
    const installation = await this.prisma.bitrixInstallation.findFirst({
      where: { active: true },
      orderBy: { updatedAt: 'desc' },
      select: { domain: true }
    });
    if (!settings?.representativeUserId) {
      return {
        provider: 'bitrix' as const,
        environment: 'production' as const,
        configured: false,
        reason: 'Selecione o representante da empresa em Configurações.',
        companyCrmId: settings?.companyCrmId || this.defaultCompanyCrmId(),
        portalUrl: installation ? `https://${installation.domain}` : undefined
      };
    }
    try {
      const provider = await this.resolveProvider(settings);
      return {
        provider: 'bitrix' as const,
        environment: 'production' as const,
        configured: Boolean(provider),
        reason: provider ? undefined : 'Nenhum provedor de assinatura está disponível para a empresa.',
        companyCrmId: settings.companyCrmId,
        representativeUserId: settings.representativeUserId,
        providerUid: provider?.uid,
        providerName: provider?.name,
        portalUrl: installation ? `https://${installation.domain}` : undefined
      };
    } catch (error) {
      return {
        provider: 'bitrix' as const,
        environment: 'production' as const,
        configured: false,
        reason: this.friendlyConfigurationError(error),
        companyCrmId: settings.companyCrmId,
        representativeUserId: settings.representativeUserId,
        portalUrl: installation ? `https://${installation.domain}` : undefined
      };
    }
  }

  async internalStatus() {
    if (this.localMode) {
      return {
        provider: 'bitrix' as const,
        environment: 'local' as const,
        configured: true,
        local: true,
        providerName: 'Assinatura interna FortaDocs',
        portalUrl: 'http://localhost:5173'
      };
    }
    const installation = await this.prisma.bitrixInstallation.findFirst({
      where: { active: true },
      orderBy: { updatedAt: 'desc' },
      select: { domain: true, scope: true }
    });
    return {
      provider: 'bitrix' as const,
      environment: 'production' as const,
      configured: Boolean(installation),
      reason: !installation
        ? 'O aplicativo ainda nao esta instalado no Bitrix24.'
        : undefined,
      providerName: 'Assinatura interna FortaDocs',
      portalUrl: installation ? `https://${installation.domain}` : undefined
    };
  }

  async options() {
    const settings = await this.getSettings();
    const companyCrmId = settings?.companyCrmId || this.defaultCompanyCrmId();
    let providers: Awaited<ReturnType<BitrixService['listCompanyProviders']>>;
    let users: Awaited<ReturnType<BitrixService['listEmployees']>>;
    try {
      [providers, users] = await Promise.all([
        this.bitrix.listCompanyProviders(companyCrmId),
        this.bitrix.listEmployees()
      ]);
    } catch (error) {
      throw new ServiceUnavailableException(this.friendlyConfigurationError(error));
    }
    return {
      companyCrmId,
      regionDocumentType: settings?.regionDocumentType || '12.999',
      representativeUserId: settings?.representativeUserId || null,
      providerUid: this.selectProvider(providers, settings?.providerUid)?.uid || null,
      providers,
      users: users.map((user) => ({
        id: Number(user.ID),
        name: [user.NAME, user.LAST_NAME].filter(Boolean).join(' ').trim() || `Usuário ${user.ID}`,
        email: user.EMAIL || '',
        photoUrl: user.PERSONAL_PHOTO
      }))
    };
  }

  async save(representativeUserId: number, updatedByUserId: string) {
    if (!Number.isInteger(representativeUserId) || representativeUserId <= 0) {
      throw new BadRequestException('Selecione um representante válido do Bitrix24');
    }
    const representative = await this.bitrix.getUser(representativeUserId);
    if (!representative?.ID || representative.ACTIVE === false || representative.ACTIVE === 'N') {
      throw new BadRequestException('O representante precisa ser um usuário ativo do Bitrix24');
    }
    const current = await this.getSettings();
    const companyCrmId = current?.companyCrmId || this.defaultCompanyCrmId();
    const providers = await this.bitrix.listCompanyProviders(companyCrmId);
    const provider = this.selectProvider(providers, current?.providerUid);
    if (!provider) {
      throw new BadRequestException('Nenhum provedor de assinatura está disponível para a empresa selecionada');
    }
    const value: BitrixSignatureSettings = {
      companyCrmId,
      representativeUserId,
      providerUid: provider.uid,
      regionDocumentType: '12.999'
    };
    await this.ensureSignatureEvents();
    await this.prisma.setting.upsert({
      where: { key: SETTINGS_KEY },
      update: { value: value as unknown as Prisma.InputJsonValue, updatedByUserId },
      create: {
        key: SETTINGS_KEY,
        value: value as unknown as Prisma.InputJsonValue,
        description: 'Configuração do envio nativo pelo Bitrix24 e-Signature for HR',
        updatedByUserId
      }
    });
    return this.options();
  }

  async requireSettings() {
    if (this.localMode) {
      return {
        companyCrmId: this.defaultCompanyCrmId(),
        representativeUserId: 8465,
        providerUid: 'local-bitrix-provider',
        regionDocumentType: '12.999'
      } satisfies Required<BitrixSignatureSettings>;
    }
    const settings = await this.getSettings();
    if (!settings?.representativeUserId) {
      throw new BadRequestException('Configure o representante da empresa antes de enviar o termo');
    }
    const provider = await this.resolveProvider(settings);
    if (!provider) {
      throw new BadRequestException('Nenhum provedor de assinatura Bitrix24 está disponível');
    }
    await this.ensureSignatureEvents();
    return { ...settings, providerUid: provider.uid } as Required<BitrixSignatureSettings>;
  }

  private async getSettings() {
    const setting = await this.prisma.setting.findUnique({ where: { key: SETTINGS_KEY } });
    if (!setting?.value || typeof setting.value !== 'object' || Array.isArray(setting.value)) return null;
    const value = setting.value as Record<string, unknown>;
    const companyCrmId = Number(value.companyCrmId || this.defaultCompanyCrmId());
    const representativeUserId = Number(value.representativeUserId || 0);
    return {
      companyCrmId: Number.isInteger(companyCrmId) && companyCrmId > 0 ? companyCrmId : this.defaultCompanyCrmId(),
      representativeUserId: Number.isInteger(representativeUserId) ? representativeUserId : 0,
      providerUid: typeof value.providerUid === 'string' ? value.providerUid : undefined,
      regionDocumentType: typeof value.regionDocumentType === 'string' ? value.regionDocumentType : '12.999'
    };
  }

  private async resolveProvider(settings: BitrixSignatureSettings) {
    const providers = await this.bitrix.listCompanyProviders(settings.companyCrmId);
    return this.selectProvider(providers, settings.providerUid);
  }

  private selectProvider(providers: BitrixCompanyProvider[], preferredUid?: string) {
    return providers.find((provider) => provider.uid === preferredUid)
      || providers.find((provider) => provider.code === 'ses-com')
      || providers[0];
  }

  private defaultCompanyCrmId() {
    const configured = Number(this.config.get<string>('BITRIX_SIGN_COMPANY_CRM_ID') || 67539);
    return Number.isInteger(configured) && configured > 0 ? configured : 67539;
  }

  private async ensureSignatureEvents() {
    const publicUrl = this.config.get<string>('PUBLIC_BACKEND_URL');
    if (this.localMode || !publicUrl) return;
    await this.bitrix.ensureEventHandlers(
      ['OnSignB2eDocumentStatusChanged', 'OnSignB2eMemberStatusChanged'],
      `${publicUrl.replace(/\/$/, '')}/integrations/bitrix/events`
    );
  }

  private friendlyConfigurationError(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (/insufficient_scope/i.test(message)) {
      return 'O aplicativo precisa dos escopos CRM e e-Signature for HR e deve ser reinstalado.';
    }
    if (/access.denied|access denied/i.test(message)) {
      return 'O instalador do aplicativo não possui permissão para criar documentos de assinatura.';
    }
    return message || 'Não foi possível validar a assinatura nativa no Bitrix24.';
  }
}
