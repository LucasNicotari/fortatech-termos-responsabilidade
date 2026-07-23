import { SignatureStatus } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import {
  findCenteredSignatureLineY,
  handwrittenSignaturePlacement,
  SignaturesService
} from './signatures.service';

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
    const page = document.addPage([595, 842]);
    page.drawLine({
      start: { x: 200, y: 716 },
      end: { x: 403, y: 716 },
      thickness: 0.7
    });
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

  it('localiza a linha central do colaborador mesmo quando o bloco muda de altura', () => {
    const content = `
      q 1 0 0 1 200 716.989 cm
      0.7 w 0 0 0 RG
      0 -1.2 m 202.6 -1.2 l S
      Q
    `;

    expect(findCenteredSignatureLineY(content, 595, 842)).toBeCloseTo(715.789, 3);
  });

  it('posiciona a assinatura imediatamente sobre a linha localizada', () => {
    const placement = handwrittenSignaturePlacement(595, 842, 900, 260, 715.789);

    expect(placement.y).toBeCloseTo(716.789, 3);
    expect(placement.x + placement.width / 2).toBeCloseTo(595 / 2, 5);
    expect(placement.height).toBeLessThanOrEqual(22);
    expect(placement.y).toBeGreaterThan(700);
  });
});
