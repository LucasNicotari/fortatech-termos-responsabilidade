import { SignatureStatus } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { SignaturesService } from './signatures.service';

describe('SignaturesService status mapping', () => {
  const service = new SignaturesService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const normalize = (value: string) => (service as unknown as { normalizeStatus: (status: string) => SignatureStatus }).normalizeStatus(value);

  it.each([
    ['signing', SignatureStatus.IN_PROGRESS],
    ['signed', SignatureStatus.SIGNED],
    ['completed', SignatureStatus.FINISHED],
    ['refused', SignatureStatus.DECLINED],
    ['cancelled', SignatureStatus.CANCELED]
  ])('maps %s to %s', (raw, expected) => expect(normalize(raw)).toBe(expected));

  it('aplica uma assinatura PNG desenhada ao PDF local', async () => {
    const document = await PDFDocument.create();
    document.addPage([595, 842]);
    const source = Buffer.from(await document.save());
    const apply = (service as unknown as {
      applyHandwrittenSignature: (pdf: Buffer, signature: string) => Promise<Buffer>;
    }).applyHandwrittenSignature.bind(service);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const signed = await apply(source, png);

    await expect(PDFDocument.load(signed)).resolves.toBeDefined();
    expect(signed.equals(source)).toBe(false);
  });

  it('rejeita uma assinatura que nao seja PNG', async () => {
    const apply = (service as unknown as {
      applyHandwrittenSignature: (pdf: Buffer, signature: string) => Promise<Buffer>;
    }).applyHandwrittenSignature.bind(service);

    await expect(apply(Buffer.from('%PDF'), 'data:text/plain;base64,dGVzdGU='))
      .rejects.toThrow('Assinatura precisa ser uma imagem PNG valida');
  });
});
