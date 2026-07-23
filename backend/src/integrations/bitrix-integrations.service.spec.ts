import { Prisma } from '@prisma/client';
import { BitrixIntegrationsService, resolveBitrixExpiry } from './bitrix-integrations.service';

describe('resolveBitrixExpiry', () => {
  const now = Date.parse('2026-07-21T12:00:00.000Z');

  it('accepts duration seconds from a server callback', () => {
    expect(resolveBitrixExpiry(3600, now).toISOString()).toBe('2026-07-21T13:00:00.000Z');
  });

  it('accepts the millisecond timestamp returned by BX24.getAuth', () => {
    const expiration = now + 45 * 60 * 1000;
    expect(resolveBitrixExpiry(expiration, now).getTime()).toBe(expiration);
  });

  it('accepts a Date serialized by a browser form', () => {
    expect(resolveBitrixExpiry('Tue, 21 Jul 2026 13:00:00 GMT', now).toISOString())
      .toBe('2026-07-21T13:00:00.000Z');
  });
});

describe('BitrixIntegrationsService events', () => {
  const installation = {
    id: 'installation-1', memberId: 'member-1', domain: 'company.bitrix24.com',
    active: true, applicationTokenHash: 'stored-hash'
  };

  function createService(overrides: Record<string, unknown> = {}) {
    const prisma = {
      bitrixInstallation: {
        findUnique: jest.fn().mockResolvedValue(installation),
        update: jest.fn().mockResolvedValue(installation)
      },
      webhookEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
        update: jest.fn().mockResolvedValue({ id: 'event-1' })
      },
      ...overrides
    };
    const signatures = { syncByDocumentUid: jest.fn().mockResolvedValue({ id: 'signature-1' }) };
    const crypto = {
      matchesHash: jest.fn((value: string, expected: string) => value === 'application-secret' && expected === 'stored-hash'),
      hash: jest.fn(() => 'stored-hash')
    };
    const service = new BitrixIntegrationsService(
      prisma as never, {} as never, crypto as never, {} as never, signatures as never
    );
    return { service, prisma, signatures, crypto };
  }

  const event = () => ({
    event: 'ONSIGNB2EMEMBERSTATUSCHANGED',
    event_handler_id: '1211',
    data: { memberUid: 'member-signer', documentUid: 'document-1', statusCode: 'done' },
    ts: '1770374945',
    auth: {
      member_id: 'member-1', domain: 'company.bitrix24.com', scope: 'sign.b2e', status: 'L',
      access_token: 'must-not-persist', refresh_token: 'must-not-persist',
      application_token: 'application-secret'
    }
  });

  it('redacts OAuth and application tokens before persisting an event', async () => {
    const { service, prisma, signatures } = createService();

    await service.handleEvent(event());

    const stored = prisma.webhookEvent.create.mock.calls[0][0].data.payload;
    expect(JSON.stringify(stored)).not.toContain('must-not-persist');
    expect(JSON.stringify(stored)).not.toContain('application-secret');
    expect(stored.auth).toEqual(expect.objectContaining({ member_id: 'member-1' }));
    const forwarded = signatures.syncByDocumentUid.mock.calls[0][2];
    expect(JSON.stringify(forwarded)).not.toContain('application-secret');
  });

  it('treats a redelivered event as an idempotent duplicate', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', {
      code: 'P2002', clientVersion: '6.19.3'
    });
    const { service, prisma, signatures } = createService();
    prisma.webhookEvent.create.mockRejectedValue(duplicate);

    await expect(service.handleEvent(event())).resolves.toEqual({ ok: true, duplicate: true });
    expect(signatures.syncByDocumentUid).not.toHaveBeenCalled();
  });

  it('bootstraps the application token hash only through OnAppInstall', async () => {
    const { service, prisma, crypto } = createService();
    prisma.bitrixInstallation.findUnique.mockResolvedValue({ ...installation, applicationTokenHash: null });

    await service.handleEvent({
      event: 'ONAPPINSTALL',
      auth: { member_id: 'member-1', domain: 'company.bitrix24.com', application_token: 'application-secret' }
    });

    expect(crypto.hash).toHaveBeenCalledWith('application-secret');
    expect(prisma.bitrixInstallation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ applicationTokenHash: 'stored-hash' })
    }));
  });

  it('rejects events signed with an invalid application token', async () => {
    const { service } = createService();
    const payload = event();
    payload.auth.application_token = 'wrong';

    await expect(service.handleEvent(payload)).rejects.toThrow('Evento Bitrix24 invalido');
  });
});

describe('BitrixIntegrationsService installation', () => {
  it('does not register event handlers that are already installed', async () => {
    const prisma = {
      bitrixInstallation: { upsert: jest.fn().mockResolvedValue({ id: 'installation-1' }) },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        update: jest.fn().mockResolvedValue({ id: 'user-1' })
      }
    };
    const handler = 'https://backend.example.com/integrations/bitrix/events';
    const events = ['OnAppInstall', 'OnAppUninstall'];
    const bitrix = {
      getCurrentUser: jest.fn().mockResolvedValue({ ID: '1', NAME: 'Admin' }),
      listBoundEvents: jest.fn().mockResolvedValue(events.map((event) => ({ event: event.toUpperCase(), handler }))),
      bindEvent: jest.fn(),
      ensureRestAppUriPlacement: jest.fn().mockResolvedValue(false)
    };
    const crypto = { encrypt: jest.fn((value: string) => `encrypted-${value}`), hash: jest.fn() };
    const config = { get: jest.fn((key: string) => {
      if (key === 'PUBLIC_BACKEND_URL') return 'https://backend.example.com';
      if (key === 'BITRIX_PORTAL_ORIGIN') return 'https://company.bitrix24.com';
      return undefined;
    }) };
    const service = new BitrixIntegrationsService(
      prisma as never, bitrix as never, crypto as never, config as never, {} as never
    );

    const result = await service.install({
      access_token: 'access', refresh_token: 'refresh', domain: 'company.bitrix24.com',
      member_id: 'member-1', expires_in: 3600
    });

    expect(result.warnings).toEqual([]);
    expect(bitrix.bindEvent).not.toHaveBeenCalled();
    expect(bitrix.ensureRestAppUriPlacement).toHaveBeenCalledWith(
      'https://backend.example.com/integrations/bitrix/launch'
    );
  });

  it('registers lifecycle events and the internal signing placement', async () => {
    const prisma = {
      bitrixInstallation: { upsert: jest.fn().mockResolvedValue({ id: 'installation-1' }) },
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
        update: jest.fn().mockResolvedValue({ id: 'user-1' })
      }
    };
    const bitrix = {
      getCurrentUser: jest.fn().mockResolvedValue({ ID: '1', NAME: 'Admin' }),
      listBoundEvents: jest.fn().mockResolvedValue([]),
      bindEvent: jest.fn().mockResolvedValue(true),
      ensureRestAppUriPlacement: jest.fn().mockResolvedValue(true)
    };
    const config = { get: jest.fn((key: string) => {
      if (key === 'PUBLIC_BACKEND_URL') return 'https://backend.example.com';
      if (key === 'BITRIX_PORTAL_ORIGIN') return 'https://company.bitrix24.com';
      return undefined;
    }) };
    const service = new BitrixIntegrationsService(
      prisma as never,
      bitrix as never,
      { encrypt: jest.fn((value: string) => `encrypted-${value}`), hash: jest.fn() } as never,
      config as never,
      {} as never
    );

    await service.install({
      access_token: 'access', refresh_token: 'refresh', domain: 'company.bitrix24.com',
      member_id: 'member-1', expires_in: 3600
    });

    expect(bitrix.bindEvent.mock.calls.map(([event]) => event)).toEqual([
      'OnAppInstall',
      'OnAppUninstall'
    ]);
    expect(bitrix.ensureRestAppUriPlacement).toHaveBeenCalled();
  });
});
