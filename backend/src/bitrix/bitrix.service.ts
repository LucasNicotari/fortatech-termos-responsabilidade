import { HttpService } from '@nestjs/axios';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BitrixInstallation } from '@prisma/client';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { LogsService } from '../logs/logs.service';
import { LOCAL_BITRIX_USERS, LOCAL_DEPARTMENTS } from '../local-development/local-fixtures';
import { PrismaService } from '../prisma/prisma.service';
import {
  BitrixCompanyProvider,
  BitrixDepartment,
  BitrixDiskObject,
  BitrixDiskStorage,
  BitrixDocumentResult,
  BitrixEventHandler,
  BitrixMember,
  BitrixSafeDocument,
  BitrixUser,
  SendBitrixDocumentInput
} from './bitrix.types';
import { TokenCryptoService } from './token-crypto.service';

@Injectable()
export class BitrixService {
  private readonly refreshes = new Map<string, Promise<BitrixInstallation>>();
  private readonly localMode: boolean;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: TokenCryptoService,
    private readonly logs: LogsService
  ) {
    this.localMode = config.get?.<string>('LOCAL_DEVELOPMENT_MODE') === 'true';
  }

  async call<T>(method: string, params: Record<string, unknown> = {}, memberId?: string): Promise<T> {
    if (this.localMode) return this.localCall(method, params) as T;
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
      const responseData = isAxiosError(error)
        ? error.response?.data as { error?: string; error_description?: string } | undefined
        : undefined;
      const message = responseData?.error
        ? `${responseData.error}: ${responseData.error_description || 'Erro Bitrix24'}`
        : error instanceof Error ? error.message : 'Erro desconhecido';
      await this.logs.create({
        type: 'BITRIX_ERROR', source: 'bitrix', endpoint: method, method: 'POST',
        durationMs: Date.now() - startedAt, payload: this.describePayload(params), error: message
      });
      throw new Error(message);
    }
  }

  getCurrentUser(accessToken: string, clientEndpoint: string) {
    return this.callWithToken<BitrixUser>(clientEndpoint, accessToken, 'user.current');
  }

  async listEmployees() {
    return this.listUsers();
  }

  async listEmployeesWithDepartments() {
    const users = await this.listEmployees();
    try {
      const departments = await this.listDepartments();
      const names = new Map(departments.map((department) => [String(department.ID), department.NAME]));
      return users.map((user) => ({
        ...user,
        DEPARTMENT_NAME: (user.UF_DEPARTMENT || []).map((id) => names.get(String(id))).filter(Boolean).join(', ')
      }));
    } catch (error) {
      const missingScope = error instanceof Error && /insufficient_scope/i.test(error.message);
      return users.map((user) => ({
        ...user,
        DEPARTMENT_NAME: '',
        DEPARTMENT_LOOKUP_ERROR: missingScope ? 'MISSING_SCOPE' as const : 'LOOKUP_FAILED' as const
      }));
    }
  }

  async listDepartments() {
    const departments = new Map<string, BitrixDepartment>();
    const pageSize = 50;
    const maxPages = 100;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await this.call<BitrixDepartment[]>('department.get', {
        sort: 'NAME', order: 'ASC', START: page * pageSize
      });
      for (const department of result || []) {
        if (department.ID) departments.set(String(department.ID), department);
      }
      if (!result || result.length < pageSize) break;
    }
    return [...departments.values()].sort((left, right) => left.NAME.localeCompare(
      right.NAME, 'pt-BR', { sensitivity: 'base' }
    ));
  }

  private async listUsers() {
    const users = new Map<string, BitrixUser>();
    const pageSize = 50;
    const maxPages = 100;
    for (let page = 0; page < maxPages; page += 1) {
      const start = page * pageSize;
      const result = await this.call<BitrixUser[]>('user.get', { FILTER: { ACTIVE: true }, start });
      for (const user of result || []) {
        if (user.ID) users.set(String(user.ID), user);
      }
      if (!result || result.length < pageSize) break;
    }
    return [...users.values()].sort((left, right) => {
      const leftName = [left.NAME, left.LAST_NAME].filter(Boolean).join(' ').trim();
      const rightName = [right.NAME, right.LAST_NAME].filter(Boolean).join(' ').trim();
      if (!leftName && rightName) return 1;
      if (leftName && !rightName) return -1;
      const normalized = normalizeName(leftName).localeCompare(normalizeName(rightName), 'pt-BR', { sensitivity: 'base' });
      return normalized
        || leftName.localeCompare(rightName, 'pt-BR', { sensitivity: 'variant' })
        || Number(left.ID) - Number(right.ID);
    });
  }

  async getUser(userId: number) {
    const users = await this.call<BitrixUser[]>('user.get', { ID: userId });
    const user = users?.[0];
    if (!user) throw new Error(`Usuario Bitrix24 ${userId} nao encontrado`);
    return user;
  }

  sendPersonalNotification(input: {
    userId: number;
    message: string;
    externalMessage: string;
    tag: string;
  }) {
    return this.call<number | false>('im.notify.personal.add', {
      USER_ID: input.userId,
      MESSAGE: input.message,
      MESSAGE_OUT: input.externalMessage,
      TAG: input.tag,
      SUB_TAG: `FORTADOCS|${input.userId}`
    });
  }

  sendChatMessage(userId: number, message: string) {
    return this.call<number>('im.message.add', {
      DIALOG_ID: String(userId),
      MESSAGE: message,
      SYSTEM: 'N',
      URL_PREVIEW: 'N'
    });
  }

  async archiveResponsibilityTerm(pdf: Buffer, fileName: string) {
    const ownerUserId = String(this.config.get<string>('BITRIX_DRIVE_OWNER_USER_ID') || '').trim();
    const folderName = String(
      this.config.get<string>('BITRIX_DRIVE_FOLDER_NAME') || 'Termo de Responsabilidade'
    ).trim();
    if (!/^\d+$/.test(ownerUserId)) {
      throw new Error('BITRIX_DRIVE_OWNER_USER_ID nao configurado');
    }
    if (!folderName) throw new Error('BITRIX_DRIVE_FOLDER_NAME nao configurado');

    const storages = await this.call<BitrixDiskStorage[]>('disk.storage.getlist', {
      filter: { ENTITY_TYPE: 'user', ENTITY_ID: ownerUserId }
    });
    const storage = (storages || []).find((item) =>
      String(item.ENTITY_TYPE).toLowerCase() === 'user'
      && String(item.ENTITY_ID) === ownerUserId
    );
    if (!storage?.ROOT_OBJECT_ID) {
      throw new Error(`Drive do usuario Bitrix24 ${ownerUserId} nao localizado`);
    }

    const folder = await this.ensureDriveFolder(storage.ROOT_OBJECT_ID, folderName);
    const result = await this.call<BitrixDiskObject>('disk.folder.uploadfile', {
      id: Number(folder.ID),
      data: { NAME: fileName },
      fileContent: [fileName, pdf.toString('base64')],
      generateUniqueName: true
    });
    if (!result?.ID) throw new Error('Bitrix24 nao confirmou o arquivo salvo no Drive');
    return { file: result, folder, storage };
  }

  async ensureRestAppUriPlacement(handler: string) {
    const placements = await this.call<Array<{ placement?: string; handler?: string }>>('placement.get');
    const normalizedHandler = handler.replace(/\/$/, '');
    const exists = (placements || []).some((item) =>
      String(item.placement || '').toUpperCase() === 'REST_APP_URI'
      && String(item.handler || '').replace(/\/$/, '') === normalizedHandler
    );
    if (exists) return false;
    await this.call<boolean>('placement.bind', {
      PLACEMENT: 'REST_APP_URI',
      HANDLER: handler,
      TITLE: 'Assinar no FortaDocs',
      DESCRIPTION: 'Assinatura de Termo de Responsabilidade'
    });
    return true;
  }

  getDocument(uid: string) {
    return this.call<BitrixDocumentResult>('sign.b2e.document.get', { uid, language: 'pt' });
  }

  listCompanyProviders(companyCrmId: number) {
    return this.call<BitrixCompanyProvider[]>('sign.b2e.company.provider.list', {
      companyCrmId,
      language: 'pt',
      limit: 100,
      offset: 0
    });
  }

  sendDocument(input: SendBitrixDocumentInput) {
    return this.call<BitrixDocumentResult>('sign.b2e.document.send', {
      fields: {
        company: { crmId: input.companyCrmId },
        members: [
          { userId: input.signerUserId, role: 'signer' },
          { userId: input.representativeUserId, role: 'assignee' }
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
          externalDateCreate: input.externalDateCreate.toISOString()
        }
      },
      language: 'pt'
    });
  }

  listSafeDocuments(limit = 50, offset = 0) {
    return this.call<BitrixSafeDocument[]>('sign.b2e.mysafe.tail', { limit, offset });
  }

  bindEvent(event: string, handler: string, accessToken: string, clientEndpoint: string) {
    return this.callWithToken(clientEndpoint, accessToken, 'event.bind', { event, handler });
  }

  listBoundEvents(accessToken: string, clientEndpoint: string) {
    return this.callWithToken<BitrixEventHandler[]>(clientEndpoint, accessToken, 'event.get');
  }

  async ensureEventHandlers(events: string[], handler: string) {
    const bound = await this.call<BitrixEventHandler[]>('event.get');
    const registered: string[] = [];
    for (const event of events) {
      const exists = (bound || []).some((item) =>
        item.event.toLowerCase() === event.toLowerCase()
        && item.handler.replace(/\/$/, '') === handler.replace(/\/$/, '')
      );
      if (exists) continue;
      await this.call<boolean>('event.bind', { event, handler });
      registered.push(event);
    }
    return registered;
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
    const fileContent = Array.isArray(params.fileContent)
      ? params.fileContent as unknown[]
      : undefined;
    return {
      ...params,
      fileContent: fileContent
        ? [String(fileContent[0] || ''), `[base64:${String(fileContent[1] || '').length}]`]
        : undefined,
      fields: fields ? {
        ...fields,
        files: files?.map((file) => ({ fileName: file.fileName, bytesBase64: file.fileContent?.length }))
      } : undefined
    };
  }

  private localCall(method: string, params: Record<string, unknown>) {
    if (method === 'user.get') {
      const filter = (params.FILTER || {}) as Record<string, unknown>;
      const requestedId = String(params.ID || filter.ID || '');
      const activeOnly = filter.ACTIVE === true || filter.ACTIVE === 'Y';
      const start = Number(params.start || 0);
      return LOCAL_BITRIX_USERS
        .filter((user) => !requestedId || user.ID === requestedId)
        .filter((user) => !activeOnly || user.ACTIVE !== false)
        .slice(start, start + 50);
    }
    if (method === 'department.get') {
      const start = Number(params.START || params.start || 0);
      return LOCAL_DEPARTMENTS.slice(start, start + 50);
    }
    if (method === 'user.current') return LOCAL_BITRIX_USERS[0];
    if (method === 'im.notify.personal.add') return Date.now();
    if (method === 'im.message.add') return Date.now();
    if (method === 'disk.storage.getlist') {
      return [{
        ID: 'local-storage',
        NAME: 'Drive local',
        ENTITY_TYPE: 'user',
        ENTITY_ID: String((params.filter as Record<string, unknown> | undefined)?.ENTITY_ID || '8465'),
        ROOT_OBJECT_ID: 'local-root'
      }];
    }
    if (method === 'disk.folder.getchildren') {
      return [{
        ID: 'local-terms-folder',
        NAME: 'Termo de Responsabilidade',
        STORAGE_ID: 'local-storage',
        TYPE: 'folder',
        PARENT_ID: 'local-root'
      }];
    }
    if (method === 'disk.folder.addsubfolder') {
      return {
        ID: 'local-terms-folder',
        NAME: String((params.data as Record<string, unknown> | undefined)?.NAME || ''),
        STORAGE_ID: 'local-storage',
        TYPE: 'folder',
        PARENT_ID: String(params.id || '')
      };
    }
    if (method === 'disk.folder.uploadfile') {
      return {
        ID: `local-file-${Date.now()}`,
        NAME: String((params.data as Record<string, unknown> | undefined)?.NAME || ''),
        STORAGE_ID: 'local-storage',
        TYPE: 'file',
        PARENT_ID: String(params.id || ''),
        DETAIL_URL: 'http://localhost/drive/term.pdf'
      };
    }
    if (method === 'placement.get') return [];
    if (method === 'placement.bind') return true;
    if (method === 'sign.b2e.company.provider.list') {
      return [{
        code: 'local',
        uid: 'local-bitrix-provider',
        name: 'Bitrix24 local'
      }];
    }
    if (method === 'sign.b2e.document.send') {
      const fields = params.fields as {
        members?: Array<{ userId: number; role: BitrixMember['role'] }>;
      };
      const uid = `local-bitrix-${Date.now()}`;
      return {
        uid,
        state: { code: 'sent', name: 'Enviado' },
        members: (fields.members || []).map((member, index) => ({
          uid: `${uid}-${member.role}`,
          role: member.role,
          party: index,
          user: { userId: member.userId },
          state: { code: 'waiting', name: 'Aguardando' }
        }))
      };
    }
    if (method === 'event.bind') return true;
    if (method === 'event.get') return [];
    throw new Error(`Metodo Bitrix24 ${method} nao simulado no modo local`);
  }

  private async ensureDriveFolder(rootFolderId: string, folderName: string) {
    const find = async () => {
      const children = await this.call<BitrixDiskObject[]>('disk.folder.getchildren', {
        id: Number(rootFolderId),
        filter: { NAME: folderName }
      });
      return (children || []).find((item) =>
        String(item.TYPE).toLowerCase() === 'folder'
        && item.NAME.localeCompare(folderName, 'pt-BR', { sensitivity: 'base' }) === 0
      );
    };
    const existing = await find();
    if (existing) return existing;
    try {
      const created = await this.call<BitrixDiskObject>('disk.folder.addsubfolder', {
        id: Number(rootFolderId),
        data: { NAME: folderName }
      });
      if (created?.ID) return created;
    } catch (error) {
      const concurrentlyCreated = await find();
      if (concurrentlyCreated) return concurrentlyCreated;
      throw error;
    }
    throw new Error(`Pasta "${folderName}" nao localizada nem criada no Drive`);
  }
}

function normalizeName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
