import { BitrixService } from './bitrix.service';
import { of } from 'rxjs';

describe('BitrixService sign.b2e', () => {
  it('lists providers using the current companyCrmId parameter', async () => {
    const service = new BitrixService({} as never, {} as never, {} as never, {} as never, {} as never);
    const call = jest.spyOn(service, 'call').mockResolvedValue([]);

    await service.listCompanyProviders(12);

    expect(call).toHaveBeenCalledWith('sign.b2e.company.provider.list', { companyCrmId: 12 });
  });

  it('sends exactly one PDF and the required participants', async () => {
    const service = new BitrixService({} as never, {} as never, {} as never, {} as never, {} as never);
    const result = { uid: 'doc-1', state: { code: 'sent', name: 'Sent' }, members: [] };
    const call = jest.spyOn(service, 'call').mockResolvedValue(result);

    await service.sendHrSignature({
      externalId: 'request-1', fileName: 'TR-request-1.pdf', pdf: Buffer.from('%PDF-test'),
      companyCrmId: 12, employeeUserId: 25, companySignerUserId: 42,
      responsibleUserId: 7, companyProviderUid: 'provider-1', regionDocumentType: '12.999'
    });

    expect(call).toHaveBeenCalledWith('sign.b2e.document.send', {
      fields: expect.objectContaining({
        company: { crmId: 12 },
        members: [{ userId: 25, role: 'signer' }, { userId: 42, role: 'assignee' }],
        responsible: { userId: 7 },
        companyProviderUid: 'provider-1',
        files: [{ fileName: 'TR-request-1.pdf', fileType: 'application/pdf', fileContent: Buffer.from('%PDF-test').toString('base64') }],
        regionDocumentType: '12.999',
        externalSettings: expect.objectContaining({ externalId: 'request-1' })
      })
    });
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
