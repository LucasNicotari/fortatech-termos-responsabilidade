import { SendRequestStatus, SignatureStatus } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import {
  findCenteredSignatureLineY,
  handwrittenSignaturePlacement,
  mapWithConcurrency,
  SignaturesService
} from './signatures.service';

describe('SignaturesService status mapping', () => {
  const service = new SignaturesService({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const normalize = (value: string) => (service as unknown as { normalizeStatus: (status: string) => SignatureStatus }).normalizeStatus(value);
  const requestStatus = (value: SignatureStatus) => (service as unknown as {
    toRequestStatus: (status: SignatureStatus) => SendRequestStatus;
  }).toRequestStatus(value);

  it.each([
    ['signing', SignatureStatus.IN_PROGRESS],
    ['signed', SignatureStatus.SIGNED],
    ['completed', SignatureStatus.FINISHED],
    ['refused', SignatureStatus.DECLINED],
    ['cancelled', SignatureStatus.CANCELED]
  ])('maps %s to %s', (raw, expected) => expect(normalize(raw)).toBe(expected));

  it.each([
    [SignatureStatus.SENT, SendRequestStatus.SENT],
    [SignatureStatus.VIEWED, SendRequestStatus.VIEWED],
    [SignatureStatus.SIGNED, SendRequestStatus.SIGNED],
    [SignatureStatus.FINISHED, SendRequestStatus.COMPLETED]
  ])('keeps request lifecycle aligned from %s to %s', (signature, request) => {
    expect(requestStatus(signature)).toBe(request);
  });

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

  it('rejeita PNG comprimido com dimensoes excessivas antes de incorporar ao PDF', async () => {
    const apply = (service as unknown as {
      applyHandwrittenSignature: (pdf: Buffer, signature: string) => Promise<Buffer>;
    }).applyHandwrittenSignature.bind(service);
    const oversized = Buffer.alloc(24);
    Buffer.from('89504e470d0a1a0a', 'hex').copy(oversized);
    oversized.writeUInt32BE(5_000, 16);
    oversized.writeUInt32BE(100, 20);

    await expect(apply(
      Buffer.from('%PDF'),
      `data:image/png;base64,${oversized.toString('base64')}`
    )).rejects.toThrow('Dimensoes da assinatura excedem o limite permitido');
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

  it('limita a concorrencia das sincronizacoes sem perder a ordem dos resultados', async () => {
    let running = 0;
    let maximum = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (value) => {
      running += 1;
      maximum = Math.max(maximum, running);
      await new Promise((resolve) => setTimeout(resolve, 3));
      running -= 1;
      return value * 2;
    });

    expect(maximum).toBe(2);
    expect(results).toEqual([2, 4, 6, 8, 10, 12]);
  });
});
