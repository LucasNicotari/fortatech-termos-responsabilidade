import { SigningJwtStrategy } from './signing-jwt.strategy';

describe('SigningJwtStrategy', () => {
  const config = { get: jest.fn(() => 'a-secure-jwt-secret-with-more-than-32-characters') };

  it('aceita somente a sessao vinculada ao convite e ao usuario Bitrix', async () => {
    const prisma = {
      signingInvitation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'invite-1',
          signatureId: 'signature-1',
          bitrixUserId: '8465',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null
        })
      }
    };
    const strategy = new SigningJwtStrategy(config as never, prisma as never);

    await expect(strategy.validate({
      sub: 'invite-1',
      scope: 'SIGN_DOCUMENT',
      bitrixUserId: '8465',
      signatureId: 'signature-1'
    })).resolves.toEqual(expect.objectContaining({
      accessMode: 'SIGNER',
      invitationId: 'invite-1',
      bitrixUserId: '8465'
    }));
  });

  it('rejeita token reaproveitado para outro usuario', async () => {
    const prisma = {
      signingInvitation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'invite-1',
          signatureId: 'signature-1',
          bitrixUserId: '8465',
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null
        })
      }
    };
    const strategy = new SigningJwtStrategy(config as never, prisma as never);

    await expect(strategy.validate({
      sub: 'invite-1',
      scope: 'SIGN_DOCUMENT',
      bitrixUserId: '9999',
      signatureId: 'signature-1'
    })).rejects.toThrow('Sessao de assinatura expirada');
  });
});
