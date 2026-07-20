import { Body, Controller, Get, Header, Post, Put, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BitrixService } from '../bitrix/bitrix.service';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { BitrixIntegrationsService, BitrixSigningConfig } from './bitrix-integrations.service';

@Controller()
export class BitrixIntegrationsController {
  constructor(private readonly integrations: BitrixIntegrationsService, private readonly bitrix: BitrixService) {}

  @Post('integrations/bitrix/install')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async install(@Body() body: Record<string, unknown>, @Res() response: Response) {
    const installation = await this.integrations.install(body);
    if (installation.warnings.length) {
      response.status(503).send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Instalação pendente</title></head><body><h1>Instalação pendente</h1><p>Não foi possível registrar todos os eventos. Verifique a PUBLIC_BACKEND_URL, os escopos e as permissões do aplicativo e abra esta tela novamente.</p></body></html>`);
      return;
    }
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

  @Post('integrations/bitrix/launch')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async launch(@Body() body: Record<string, unknown>, @Res() response: Response) {
    const launch = await this.integrations.createLaunch(body);
    const destination = new URL(launch.frontendUrl);
    destination.searchParams.set('launchCode', launch.code);
    response.send(`<!doctype html><html><head><meta charset="utf-8"><title>Fortatech Termos</title></head><body><script>window.location.replace(${JSON.stringify(destination.toString())});</script></body></html>`);
  }

  @Post('integrations/bitrix/events')
  event(@Body() body: Record<string, unknown>) {
    return this.integrations.handleEvent(body);
  }

  @Get('bitrix/employees')
  @UseGuards(JwtAuthGuard)
  employees() {
    return this.bitrix.listEmployees();
  }

  @Get('integrations/bitrix/config')
  @UseGuards(JwtAuthGuard)
  config() {
    return this.integrations.getSigningConfig();
  }

  @Put('integrations/bitrix/config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  saveConfig(@Body() body: BitrixSigningConfig, @CurrentUser() user: { id: string }) {
    return this.integrations.saveSigningConfig(body, user.id);
  }

  @Post('integrations/bitrix/providers')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  providers(@Body('companyCrmId') companyCrmId: number) {
    return this.bitrix.listCompanyProviders(Number(companyCrmId));
  }
}
