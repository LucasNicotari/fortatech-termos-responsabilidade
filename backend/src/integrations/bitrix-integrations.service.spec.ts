import { Prisma } from '@prisma/client';
import { BitrixIntegrationsService } from './bitrix-integrations.service';

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
