import { HttpService } from '@nestjs/axios';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitrixInstallation } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { LogsService } from '../logs/logs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BitrixDocumentResult,
  BitrixSafeDocument,
  BitrixSendSignatureInput,
  BitrixUser
} from './bitrix.types';
import { TokenCryptoService } from './token-crypto.service';

@Injectable()
export class BitrixService {
  private readonly refreshes = new Map<string, Promise<BitrixInstallation>>();

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: TokenCryptoService,
    private readonly logs: LogsService
  ) {}

  async call<T>(method: string, params: Record<string, unknown> = {}, memberId?: string): Promise<T> {
    let installation = memberId
      ? await this.prisma.bitrixInstallation.findUnique({ where: { memberId } })
      : await this.prisma.bitrixInstallation.findFirst({ where: { active: true }, orderBy: { updatedAt: 'desc' } });
    if (!installation?.active) throw new UnauthorizedException('Aplicativo Bitrix24 nao instalado');
    if (installation.expiresAt.getTime() <= Date.now() + 60_000) {
      installation = await this.refreshInstallation(installation);
    }
    return this.callWithToken<T>(installation.clientEndpoint, this.crypto.decrypt(installation.accessTokenEncrypted), method, params);
  }

  async callWithToken<T>(clientEndpoint: string, accessToken: string, method: string, params: Record<string, unknown> = {}) {
    const url = `${clientEndpoint.replace(/\/$/, '')}/${method}`;
    const startedAt = Date.now();
    try {
      const response = await firstValueFrom(
        this.http.post<{ result?: T; error?: string; error_description?: string }>(url, {
          ...params,
          auth: accessToken
        })
      );
      if (response.data.error) {
        throw new Error(`${response.data.error}: ${response.data.error_description || 'Erro Bitrix24'}`);
      }
      await this.logs.create({
        type: 'BITRIX_REQUEST', source: 'bitrix', endpoint: method, method: 'POST',
        httpStatus: response.status, durationMs: Date.now() - startedAt,
        payload: this.describePayload(params)
      });
      return response.data.result as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      await this.logs.create({
        type: 'BITRIX_ERROR', source: 'bitrix', endpoint: method, method: 'POST',
        durationMs: Date.now() - startedAt, payload: this.describePayload(params), error: message
      });
      throw error;
    }
  }

  getCurrentUser(accessToken: string, clientEndpoint: string) {
    return this.callWithToken<BitrixUser>(clientEndpoint, accessToken, 'user.current');
  }

  listEmployees() {
    return this.call<BitrixUser[]>('user.get', { FILTER: { ACTIVE: true } });
  }

  async getUser(userId: number) {
    const users = await this.call<BitrixUser[]>('user.get', { ID: userId });
    const user = users?.[0];
    if (!user) throw new Error(`Usuario Bitrix24 ${userId} nao encontrado`);
    return user;
  }

  listCompanyProviders(companyCrmId: number) {
    return this.call<unknown[]>('sign.b2e.company.provider.list', { companyCrmId });
  }

  sendHrSignature(input: BitrixSendSignatureInput) {
    return this.call<BitrixDocumentResult>('sign.b2e.document.send', {
      fields: {
        company: { crmId: input.companyCrmId },
        members: [
          { userId: input.employeeUserId, role: 'signer' },
          { userId: input.companySignerUserId, role: 'assignee' }
        ],
        responsible: { userId: input.responsibleUserId },
        companyProviderUid: input.companyProviderUid,
        files: [{
          fileName: input.fileName,
          fileType: 'application/pdf',
          fileContent: input.pdf.toString('base64')
        }],
        regionDocumentType: input.regionDocumentType,
        externalSettings: {
          externalId: input.externalId,
          externalDateCreate: new Date().toISOString()
        }
      }
    });
  }

  getDocument(uid: string) {
    return this.call<BitrixDocumentResult>('sign.b2e.document.get', { uid, language: 'pt' });
  }

  listSafeDocuments(limit = 50, offset = 0) {
    return this.call<BitrixSafeDocument[]>('sign.b2e.mysafe.tail', { limit, offset });
  }

  bindEvent(event: string, handler: string, accessToken: string, clientEndpoint: string) {
    return this.callWithToken(clientEndpoint, accessToken, 'event.bind', { event, handler });
  }

  private refreshInstallation(installation: BitrixInstallation) {
    const existing = this.refreshes.get(installation.memberId);
    if (existing) return existing;
    const promise = this.performRefresh(installation).finally(() => this.refreshes.delete(installation.memberId));
    this.refreshes.set(installation.memberId, promise);
    return promise;
  }

  private async performRefresh(installation: BitrixInstallation) {
    const clientId = this.config.get<string>('BITRIX_CLIENT_ID');
    const clientSecret = this.config.get<string>('BITRIX_CLIENT_SECRET');
    if (!clientId || !clientSecret) throw new Error('BITRIX_CLIENT_ID/BITRIX_CLIENT_SECRET nao configurados');
    const tokenUrl = new URL('/oauth/token/', installation.serverEndpoint).toString();
    const response = await firstValueFrom(this.http.get<Record<string, unknown>>(tokenUrl, {
      params: {
        grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret,
        refresh_token: this.crypto.decrypt(installation.refreshTokenEncrypted)
      }
    }));
    const accessToken = String(response.data.access_token || '');
    const refreshToken = String(response.data.refresh_token || '');
    if (!accessToken || !refreshToken) throw new Error('Bitrix24 nao retornou novo par OAuth');
    return this.prisma.bitrixInstallation.update({
      where: { id: installation.id },
      data: {
        accessTokenEncrypted: this.crypto.encrypt(accessToken),
        refreshTokenEncrypted: this.crypto.encrypt(refreshToken),
        expiresAt: new Date(Date.now() + Number(response.data.expires_in || 3600) * 1000)
      }
    });
  }

  private describePayload(params: Record<string, unknown>) {
    const fields = params.fields as Record<string, unknown> | undefined;
    const files = fields?.files as Array<{ fileName?: string; fileContent?: string }> | undefined;
    return {
      ...params,
      fields: fields ? {
        ...fields,
        files: files?.map((file) => ({ fileName: file.fileName, bytesBase64: file.fileContent?.length }))
      } : undefined
    };
  }
}
