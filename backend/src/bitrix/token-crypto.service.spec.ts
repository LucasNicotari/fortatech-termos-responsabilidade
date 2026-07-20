import { ConfigService } from '@nestjs/config';
import { TokenCryptoService } from './token-crypto.service';

describe('TokenCryptoService', () => {
  const config = { get: (key: string) => key === 'BITRIX_TOKEN_ENCRYPTION_KEY' ? 'a'.repeat(64) : undefined } as ConfigService;
  const service = new TokenCryptoService(config);

  it('encrypts with random IV and decrypts the original token', () => {
    const first = service.encrypt('oauth-secret');
    const second = service.encrypt('oauth-secret');
    expect(first).not.toBe(second);
    expect(service.decrypt(first)).toBe('oauth-secret');
    expect(service.decrypt(second)).toBe('oauth-secret');
  });

  it('compares application tokens without exposing them', () => {
    const hash = service.hash('application-token');
    expect(service.matchesHash('application-token', hash)).toBe(true);
    expect(service.matchesHash('wrong-token', hash)).toBe(false);
  });
});
