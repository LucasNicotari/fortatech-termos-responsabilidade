import { SignatureStatus } from '@prisma/client';
import { SignaturesService } from './signatures.service';

describe('SignaturesService status mapping', () => {
  const service = new SignaturesService({} as never, {} as never, {} as never, {} as never);
  const normalize = (value: string) => (service as unknown as { normalizeStatus: (status: string) => SignatureStatus }).normalizeStatus(value);

  it.each([
    ['signing', SignatureStatus.IN_PROGRESS],
    ['signed', SignatureStatus.SIGNED],
    ['completed', SignatureStatus.FINISHED],
    ['refused', SignatureStatus.DECLINED],
    ['cancelled', SignatureStatus.CANCELED]
  ])('maps %s to %s', (raw, expected) => expect(normalize(raw)).toBe(expected));
});
