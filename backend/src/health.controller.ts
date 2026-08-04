import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  ready() {
    return this.checkDependencies();
  }

  @Get('ready')
  readyCheck() {
    return this.checkDependencies();
  }

  @Get('live')
  live() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      revision: this.revision()
    };
  }

  private async checkDependencies() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      database: 'reachable',
      revision: this.revision()
    };
  }

  private revision() {
    return process.env.APP_REVISION?.slice(0, 40)
      || process.env.RENDER_GIT_COMMIT?.slice(0, 7)
      || 'local';
  }
}
