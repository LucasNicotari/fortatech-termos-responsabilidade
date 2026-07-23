import { BitrixService } from './bitrix.service';
import { of } from 'rxjs';

describe('BitrixService sign.b2e', () => {
  it('usa somente colaboradores sinteticos ativos no modo local', async () => {
    const service = new BitrixService(
      {} as never,
      { get: (key: string) => key === 'LOCAL_DEVELOPMENT_MODE' ? 'true' : undefined } as never,
      {} as never,
      {} as never,
      {} as never
    );

    const users = await service.listEmployeesWithDepartments();

    expect(users).toHaveLength(20);
    expect(users.every((user) => user.ACTIVE !== false)).toBe(true);
    expect(users.every((user) => Boolean(user.DEPARTMENT_NAME))).toBe(true);
    expect(users.map((user) => user.ID)).toContain('8465');
  });

  it('sorts active Bitrix users alphabetically by full name', async () => {
    const service = new BitrixService({} as never, {} as never, {} as never, {} as never, {} as never);
    jest.spyOn(service, 'call').mockResolvedValue([
      { ID: '2', NAME: 'Zuleica' },
      { ID: '1', NAME: 'Álvaro' },
      { ID: '3', NAME: 'Bruno', LAST_NAME: 'Almeida' }
    ]);

    const users = await service.listEmployees();

    expect(users.map((item) => item.ID)).toEqual(['1', '3', '2']);
  });

  it('paginates active Bitrix users beyond the first 50 records', async () => {
    const service = new BitrixService({} as never, {} as never, {} as never, {} as never, {} as never);
    const firstPage = Array.from({ length: 50 }, (_, index) => ({ ID: String(index + 1) }));
    const call = jest.spyOn(service, 'call')
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ ID: '8465', NAME: 'Installer' }]);

    const users = await service.listEmployees();

    expect(users).toHaveLength(51);
    expect(users).toContainEqual({ ID: '8465', NAME: 'Installer' });
    expect(call).toHaveBeenNthCalledWith(1, 'user.get', { FILTER: { ACTIVE: true }, start: 0 });
    expect(call).toHaveBeenNthCalledWith(2, 'user.get', { FILTER: { ACTIVE: true }, start: 50 });
  });

  it('resolves the employee department names from the Bitrix company structure', async () => {
    const service = new BitrixService({} as never, {} as never, {} as never, {} as never, {} as never);
    jest.spyOn(service, 'listEmployees').mockResolvedValue([
      { ID: '7', NAME: 'Colaborador', UF_DEPARTMENT: [10, 20] }
    ]);
    jest.spyOn(service, 'listDepartments').mockResolvedValue([
      { ID: '10', NAME: 'Tecnologia' },
      { ID: '20', NAME: 'Infraestrutura' }
    ]);

    await expect(service.listEmployeesWithDepartments()).resolves.toEqual([
      expect.objectContaining({ ID: '7', DEPARTMENT_NAME: 'Tecnologia, Infraestrutura' })
    ]);
  });

  it('identifies a missing department scope instead of hiding the integration error', async () => {
    const service = new BitrixService({} as never, {} as never, {} as never, {} as never, {} as never);
    jest.spyOn(service, 'listEmployees').mockResolvedValue([
      { ID: '7', NAME: 'Colaborador', UF_DEPARTMENT: [10] }
    ]);
    jest.spyOn(service, 'listDepartments').mockRejectedValue(
      new Error('insufficient_scope: higher privileges required')
    );

    await expect(service.listEmployeesWithDepartments()).resolves.toEqual([
      expect.objectContaining({
        ID: '7', DEPARTMENT_NAME: '', DEPARTMENT_LOOKUP_ERROR: 'MISSING_SCOPE'
      })
    ]);
  });

  it('paginates departments in groups of 50', async () => {
    const service = new BitrixService({} as never, {} as never, {} as never, {} as never, {} as never);
    const firstPage = Array.from({ length: 50 }, (_, index) => ({ ID: String(index + 1), NAME: `Departamento ${index + 1}` }));
    const call = jest.spyOn(service, 'call')
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ ID: '51', NAME: 'Último' }]);

    await expect(service.listDepartments()).resolves.toHaveLength(51);
    expect(call).toHaveBeenNthCalledWith(1, 'department.get', { sort: 'NAME', order: 'ASC', START: 0 });
    expect(call).toHaveBeenNthCalledWith(2, 'department.get', { sort: 'NAME', order: 'ASC', START: 50 });
  });

  it('lists event handlers using the installation access token', async () => {
    const service = new BitrixService({} as never, {} as never, {} as never, {} as never, {} as never);
    const call = jest.spyOn(service, 'callWithToken').mockResolvedValue([]);

    await service.listBoundEvents('access-token', 'https://company.bitrix24.com/rest/');

    expect(call).toHaveBeenCalledWith(
      'https://company.bitrix24.com/rest/', 'access-token', 'event.get'
    );
  });

  it('sends the PDF with signer, representative and responsible through native B2E', async () => {
    const service = new BitrixService({} as never, {} as never, {} as never, {} as never, {} as never);
    const call = jest.spyOn(service, 'call').mockResolvedValue({
      uid: 'document-uid',
      state: { code: 'sent', name: 'Enviado' },
      members: []
    });

    await service.sendDocument({
      companyCrmId: 67539,
      signerUserId: 10,
      representativeUserId: 20,
      responsibleUserId: 30,
      companyProviderUid: 'provider-uid',
      fileName: 'TR.Colaborador_Teste.pdf',
      pdf: Buffer.from('%PDF-test'),
      regionDocumentType: '12.999',
      externalId: 'request-1',
      externalDateCreate: new Date('2026-07-23T12:00:00.000Z')
    });

    expect(call).toHaveBeenCalledWith('sign.b2e.document.send', {
      fields: {
        company: { crmId: 67539 },
        members: [
          { userId: 10, role: 'signer' },
          { userId: 20, role: 'assignee' }
        ],
        responsible: { userId: 30 },
        companyProviderUid: 'provider-uid',
        files: [{
          fileName: 'TR.Colaborador_Teste.pdf',
          fileType: 'application/pdf',
          fileContent: Buffer.from('%PDF-test').toString('base64')
        }],
        regionDocumentType: '12.999',
        externalSettings: {
          externalId: 'request-1',
          externalDateCreate: '2026-07-23T12:00:00.000Z'
        }
      },
      language: 'pt'
    });
  });

  it('archives the signed PDF in the configured user Drive folder', async () => {
    const configValues: Record<string, string> = {
      BITRIX_DRIVE_OWNER_USER_ID: '8465',
      BITRIX_DRIVE_FOLDER_NAME: 'Termo de Responsabilidade'
    };
    const config = { get: (key: string) => configValues[key] };
    const service = new BitrixService({} as never, config as never, {} as never, {} as never, {} as never);
    const call = jest.spyOn(service, 'call')
      .mockResolvedValueOnce([{
        ID: '55', NAME: 'Lucas', ENTITY_TYPE: 'user', ENTITY_ID: '8465', ROOT_OBJECT_ID: '100'
      }])
      .mockResolvedValueOnce([{
        ID: '200', NAME: 'Termo de Responsabilidade', STORAGE_ID: '55', TYPE: 'folder'
      }])
      .mockResolvedValueOnce({
        ID: '300', NAME: 'TR.Lucas_Nicotari.pdf', STORAGE_ID: '55', TYPE: 'file',
        PARENT_ID: '200', DETAIL_URL: 'https://company.bitrix24.com.br/disk/file/300'
      });

    const archived = await service.archiveResponsibilityTerm(
      Buffer.from('%PDF-test'),
      'TR.Lucas_Nicotari.pdf'
    );

    expect(call).toHaveBeenNthCalledWith(1, 'disk.storage.getlist', {
      filter: { ENTITY_TYPE: 'user', ENTITY_ID: '8465' }
    });
    expect(call).toHaveBeenNthCalledWith(2, 'disk.folder.getchildren', {
      id: 100,
      filter: { NAME: 'Termo de Responsabilidade' }
    });
    expect(call).toHaveBeenNthCalledWith(3, 'disk.folder.uploadfile', {
      id: 200,
      data: { NAME: 'TR.Lucas_Nicotari.pdf' },
      fileContent: ['TR.Lucas_Nicotari.pdf', Buffer.from('%PDF-test').toString('base64')],
      generateUniqueName: true
    });
    expect(archived.file.ID).toBe('300');
  });

  it('redacts Drive file contents from integration logs', async () => {
    const http = {
      post: jest.fn().mockReturnValue(of({ status: 200, data: { result: { ID: '300' } } }))
    };
    const logs = { create: jest.fn().mockResolvedValue(undefined) };
    const service = new BitrixService(http as never, {} as never, {} as never, {} as never, logs as never);

    await service.callWithToken(
      'https://company.bitrix24.com/rest/',
      'access-token',
      'disk.folder.uploadfile',
      { id: 200, fileContent: ['term.pdf', 'very-sensitive-base64'] }
    );

    const logged = logs.create.mock.calls[0][0].payload;
    expect(JSON.stringify(logged)).not.toContain('very-sensitive-base64');
    expect(logged.fileContent).toEqual(['term.pdf', '[base64:21]']);
  });

  it('coalesces concurrent OAuth refreshes and rotates both tokens', async () => {
    const expired = {
      id: 'installation-1', memberId: 'member-1', active: true,
      clientEndpoint: 'https://company.bitrix24.com/rest/',
      serverEndpoint: 'https://oauth.bitrix.info/rest/',
      accessTokenEncrypted: 'old-access', refreshTokenEncrypted: 'old-refresh',
      expiresAt: new Date(0)
    };
    const refreshed = {
      ...expired, accessTokenEncrypted: 'new-access', refreshTokenEncrypted: 'new-refresh',
      expiresAt: new Date(Date.now() + 3_600_000)
    };
    const http = {
      get: jest.fn().mockReturnValue(of({ data: {
        access_token: 'new-access-value', refresh_token: 'new-refresh-value', expires_in: 3600
      } })),
      post: jest.fn().mockReturnValue(of({ status: 200, data: { result: { ID: '1' } } }))
    };
    const config = { get: (key: string) => key === 'BITRIX_CLIENT_ID' ? 'client' : 'secret' };
    const prisma = { bitrixInstallation: {
      findFirst: jest.fn().mockResolvedValue(expired),
      update: jest.fn().mockResolvedValue(refreshed)
    } };
    const crypto = { decrypt: (value: string) => value, encrypt: (value: string) => `encrypted-${value}` };
    const logs = { create: jest.fn().mockResolvedValue(undefined) };
    const service = new BitrixService(http as never, config as never, prisma as never, crypto as never, logs as never);

    await Promise.all([service.call('user.current'), service.call('user.current')]);

    expect(http.get).toHaveBeenCalledTimes(1);
    expect(prisma.bitrixInstallation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        accessTokenEncrypted: 'encrypted-new-access-value',
        refreshTokenEncrypted: 'encrypted-new-refresh-value'
      })
    }));
    expect(http.post).toHaveBeenCalledTimes(2);
  });

  it('rejects a Bitrix REST error response', async () => {
    const http = {
      post: jest.fn().mockReturnValue(of({ status: 200, data: {
        error: 'expired_token', error_description: 'Token expired'
      } }))
    };
    const logs = { create: jest.fn().mockResolvedValue(undefined) };
    const service = new BitrixService(http as never, {} as never, {} as never, {} as never, logs as never);

    await expect(service.callWithToken('https://company.bitrix24.com/rest/', 'invalid', 'user.current'))
      .rejects.toThrow('expired_token');
    expect(logs.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'BITRIX_ERROR' }));
  });
});
