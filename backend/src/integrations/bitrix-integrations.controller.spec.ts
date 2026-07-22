import { Response } from 'express';
import { BitrixIntegrationsController } from './bitrix-integrations.controller';

describe('BitrixIntegrationsController browser bridge', () => {
  const integrations = {
    install: jest.fn(),
    createLaunch: jest.fn()
  };
  const controller = new BitrixIntegrationsController(integrations as never, {} as never);

  function response() {
    return { send: jest.fn() } as unknown as Response;
  }

  it('serves a GET installation page that obtains OAuth data and posts it back', () => {
    const target = response();

    controller.installPage(target);

    const html = (target.send as jest.Mock).mock.calls[0][0] as string;
    expect(html).toContain('https://api.bitrix24.com/api/v1/');
    expect(html).toContain('BX24.init');
    expect(html).toContain('BX24.getAuth');
    expect(html).toContain('BX24.refreshAuth');
    expect(html).toContain('DOMAIN: domain');
    expect(html).toContain("form.method = 'post'");
    expect(html).toContain('form.action = window.location.href');
  });

  it('serves the same authenticated bridge when Bitrix opens the application with GET', () => {
    const target = response();

    controller.launchPage(target);

    const html = (target.send as jest.Mock).mock.calls[0][0] as string;
    expect(html).toContain('Autenticando no aplicativo...');
    expect(html).toContain('BX24.getAuth');
  });

  it('uses the DOMAIN query parameter when the browser form omits it', async () => {
    integrations.install.mockResolvedValue({ warnings: [] });
    const target = response();

    await controller.install(
      { access_token: 'token', refresh_token: 'refresh', member_id: 'member' },
      { DOMAIN: 'company.bitrix24.com.br' },
      target
    );

    expect(integrations.install).toHaveBeenCalledWith(expect.objectContaining({
      DOMAIN: 'company.bitrix24.com.br'
    }));
  });

  it('finishes installation even when optional lifecycle events have warnings', async () => {
    integrations.install.mockResolvedValue({ warnings: ['event.get: insufficient_scope'] });
    const target = response();

    await controller.install(
      { access_token: 'token', refresh_token: 'refresh', member_id: 'member', domain: 'company.bitrix24.com.br' },
      {},
      target
    );

    const html = (target.send as jest.Mock).mock.calls.at(-1)?.[0] as string;
    expect(html).toContain('BX24.installFinish()');
    expect(html).not.toContain('Instalação pendente');
  });
});
