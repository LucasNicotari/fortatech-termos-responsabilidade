import { Body, Controller, Get, Header, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BitrixService } from '../bitrix/bitrix.service';
import { BitrixIntegrationsService } from './bitrix-integrations.service';

@Controller()
export class BitrixIntegrationsController {
  constructor(private readonly integrations: BitrixIntegrationsService, private readonly bitrix: BitrixService) {}

  @Get('integrations/bitrix/install')
  @Header('Content-Type', 'text/html; charset=utf-8')
  installPage(@Res() response: Response) {
    response.send(this.bitrixPostBridge('Preparando a instalacao do aplicativo...'));
  }

  @Post('integrations/bitrix/install')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async install(
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @Res() response: Response
  ) {
    await this.integrations.install(this.withBitrixQueryContext(body, query));
    response.send(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Instalação concluída</title>
    <script src="https://api.bitrix24.com/api/v1/"></script>
  </head>
  <body>
    <p>Concluindo a instalação do aplicativo...</p>
    <script>
      BX24.init(function () {
        BX24.installFinish();
      });
    </script>
  </body>
</html>`);
  }

  @Get('integrations/bitrix/launch')
  @Header('Content-Type', 'text/html; charset=utf-8')
  launchPage(@Res() response: Response) {
    response.send(this.bitrixPostBridge('Autenticando no aplicativo...'));
  }

  @Post('integrations/bitrix/launch')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async launch(
    @Body() body: Record<string, unknown>,
    @Query() query: Record<string, unknown>,
    @Res() response: Response
  ) {
    const payload = this.withBitrixQueryContext(body, query);
    if (!this.hasLaunchContext(payload)) {
      if (String(body._bridge_attempt || '') === '1') {
        response.send(this.bitrixErrorPage(
          'Não foi possível autenticar pelo Bitrix24',
          'Feche esta janela e abra o FortaDocs novamente pelo menu do portal. Se persistir, reinstale o aplicativo.'
        ));
        return;
      }
      response.send(this.bitrixPostBridge('Obtendo a autorização do Bitrix24...'));
      return;
    }
    const launch = await this.integrations.createLaunch(payload);
    const destination = new URL(launch.frontendUrl);
    destination.searchParams.set('launchCode', launch.code);
    response.send(`<!doctype html><html><head><meta charset="utf-8"><title>Fortatech Termos</title></head><body><script>window.location.replace(${JSON.stringify(destination.toString())});</script></body></html>`);
  }

  @Post('integrations/bitrix/events')
  event(@Body() body: Record<string, unknown>) {
    return this.integrations.handleEvent(body);
  }

  @Get('bitrix/term-employees')
  @UseGuards(JwtAuthGuard)
  termEmployees() {
    return this.bitrix.listEmployeesWithDepartments();
  }

  private bitrixPostBridge(message: string) {
    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Fortatech Termos</title>
    <script src="https://api.bitrix24.com/api/v1/"></script>
  </head>
  <body>
    <p id="status">${message}</p>
    <script>
      (function () {
        function fail(message) {
          document.getElementById('status').textContent = message;
        }
        if (!window.BX24) {
          fail('Nao foi possivel carregar o SDK do Bitrix24. Atualize a pagina.');
          return;
        }
        BX24.init(function () {
          var submitted = false;
          function submitAuth(auth) {
            if (submitted) return;
            submitted = true;
          if (!auth) {
            fail('O Bitrix24 nao forneceu os dados de autorizacao. Abra novamente pelo menu do portal.');
            return;
          }
          var query = new URLSearchParams(window.location.search);
          var domain = auth.domain || query.get('DOMAIN') || '';
          var expiresIn = auth.expires_in;
          if (expiresIn instanceof Date) {
            expiresIn = Math.max(1, Math.floor((expiresIn.getTime() - Date.now()) / 1000));
          } else if (typeof expiresIn === 'number' && expiresIn > 100000000000) {
            expiresIn = Math.max(1, Math.floor((expiresIn - Date.now()) / 1000));
          }
          var values = Object.assign({}, auth, {
            _bridge_attempt: '1',
            expires_in: expiresIn || 3600,
            domain: domain,
            DOMAIN: domain,
            client_endpoint: auth.client_endpoint || (domain ? 'https://' + domain + '/rest/' : ''),
            server_endpoint: auth.server_endpoint || 'https://oauth.bitrix.info/rest/'
          });
          query.forEach(function (value, key) {
            if (values[key] === undefined || values[key] === null || values[key] === '') {
              values[key] = value;
            }
          });
          var form = document.createElement('form');
          form.method = 'post';
          form.action = window.location.href;
          Object.keys(values).forEach(function (name) {
            var value = values[name];
            if (value === undefined || value === null || typeof value === 'object') return;
            var input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            input.value = String(value);
            form.appendChild(input);
          });
          document.body.appendChild(form);
          form.submit();
          }
          var currentAuth = BX24.getAuth();
          if (currentAuth && currentAuth.access_token && currentAuth.refresh_token) {
            submitAuth(currentAuth);
            return;
          }
          var fallback = window.setTimeout(function () {
            submitAuth(BX24.getAuth());
          }, 5000);
          try {
            BX24.refreshAuth(function (refreshedAuth) {
              window.clearTimeout(fallback);
              submitAuth(refreshedAuth || BX24.getAuth());
            });
          } catch (_error) {
            window.clearTimeout(fallback);
            submitAuth(currentAuth);
          }
        });
      })();
    </script>
  </body>
</html>`;
  }

  private withBitrixQueryContext(body: Record<string, unknown>, query: Record<string, unknown>) {
    const bodyDomain = String(body.domain || body.DOMAIN || '');
    return {
      ...body,
      DOMAIN: bodyDomain || String(query.DOMAIN || query.domain || '')
    };
  }

  private hasLaunchContext(payload: Record<string, unknown>) {
    const auth = payload.auth && typeof payload.auth === 'object'
      ? payload.auth as Record<string, unknown>
      : {};
    return Boolean(
      String(payload.AUTH_ID || auth.access_token || '')
      && String(payload.member_id || auth.member_id || '')
      && String(payload.DOMAIN || payload.domain || auth.domain || '')
    );
  }

  private bitrixErrorPage(title: string, message: string) {
    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>FortaDocs</title>
    <style>
      body { margin: 0; background: #f4f7f9; color: #34455b; font: 14px Arial, sans-serif; }
      main { max-width: 520px; margin: 64px auto; padding: 32px; border: 1px solid #dfe6ec;
        border-radius: 12px; background: #fff; text-align: center; }
      h1 { margin: 0 0 12px; color: #172b4d; font-size: 20px; }
      p { margin: 0; line-height: 1.55; }
      button { margin-top: 24px; border: 0; border-radius: 6px; padding: 10px 16px;
        background: #2fc6f5; color: #fff; cursor: pointer; font-weight: 600; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
      <button type="button" onclick="window.location.reload()">Tentar novamente</button>
    </main>
  </body>
</html>`;
  }
}
