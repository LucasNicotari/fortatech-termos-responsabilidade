import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';

@Injectable()
export class TokenCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const secret = config.get<string>('BITRIX_TOKEN_ENCRYPTION_KEY');
    if (!secret || secret.length < 32 || secret.startsWith('change-me')) {
      throw new Error('BITRIX_TOKEN_ENCRYPTION_KEY deve ser exclusiva e ter ao menos 32 caracteres');
    }
    this.key = createHash('sha256').update(secret).digest();
  }

  encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, encrypted].map((item) => item.toString('base64url')).join('.');
  }

  decrypt(value: string) {
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue) {
      throw new Error('Token criptografado invalido');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  }

  hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  matchesHash(value: string, expectedHex: string) {
    const actual = Buffer.from(this.hash(value), 'hex');
    const expected = Buffer.from(expectedHex, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
