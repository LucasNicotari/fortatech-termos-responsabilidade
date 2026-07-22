import { of } from 'rxjs';
import { ZapSignService } from './zapsign.service';

describe('ZapSignService', () => {
  it('simula o documento sem chamada HTTP ou entrega de e-mail no modo local', async () => {
    const post = jest.fn();
    const service = new ZapSignService(
      { post } as never,
      { get: (key: string) => key === 'LOCAL_DEVELOPMENT_MODE' ? 'true' : '' } as never,
      {} as never
    );

    const document = await service.createDocument({
      externalId: 'request-local', fileName: 'termo-local.pdf', pdf: Buffer.from('%PDF-test'),
      signer: { externalId: '9001', name: 'Colaborador Teste', email: 'teste@example.test', cpf: '123.456.789-09' }
    });

    expect(document).toMatchObject({ token: expect.stringMatching(/^local-[0-9a-f-]{36}$/), status: 'pending' });
    expect(service.status()).toMatchObject({ configured: true, local: true, emailDelivery: false });
    expect(post).not.toHaveBeenCalled();
  });

  it('envia somente o colaborador como signatario e mantem os responsaveis como observadores', async () => {
    const post = jest.fn().mockReturnValue(of({
      status: 200,
      data: {
        token: 'doc-token', status: 'pending', name: 'termo.pdf',
        signers: [{ token: 'signer-token', status: 'new', name: 'Colaborador' }]
      }
    }));
    const config = {
      get: (key: string) => ({
        ZAPSIGN_API_URL: 'https://sandbox.api.zapsign.com.br/api/v1',
        ZAPSIGN_API_TOKEN: 'test-token',
        ZAPSIGN_WEBHOOK_SECRET: 'webhook-secret'
      })[key]
    };
    const service = new ZapSignService(
      { post } as never,
      config as never,
      { create: jest.fn().mockResolvedValue(undefined) } as never
    );

    await service.createDocument({
      externalId: 'request-1', fileName: 'termo.pdf', pdf: Buffer.from('%PDF-test'),
      signer: { externalId: '8465', name: 'Colaborador Teste', email: 'colaborador@example.com', cpf: '123.456.789-09' },
      observers: ['rh@example.com', 'ti@example.com']
    });

    const payload = post.mock.calls[0][1];
    expect(payload.signers).toHaveLength(1);
    expect(payload.signers[0]).toMatchObject({
      name: 'Colaborador Teste', email: 'colaborador@example.com', cpf: '12345678909',
      auth_mode: 'assinaturaTela-tokenEmail', send_automatic_email: true, lock_name: true, lock_email: true
    });
    expect(payload.observers).toEqual(['rh@example.com', 'ti@example.com']);
  });

  it('informa que o sandbox ainda nao esta configurado sem token', () => {
    const service = new ZapSignService(
      {} as never,
      { get: (key: string) => key === 'ZAPSIGN_API_URL' ? 'https://sandbox.api.zapsign.com.br/api/v1' : '' } as never,
      {} as never
    );
    expect(service.status()).toMatchObject({ environment: 'sandbox', configured: false, signerCount: 1 });
  });
});
