import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async localLogin() {
    if (this.config.get<string>('LOCAL_DEVELOPMENT_MODE') !== 'true') {
      throw new NotFoundException('Login local nao habilitado');
    }
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ bitrixUserId: '8465' }, { email: 'lucas.local@fortatech.test' }] }
    });
    const user = existing
      ? await this.prisma.user.update({
        where: { id: existing.id },
        data: { bitrixUserId: '8465', name: 'Lucas Nicotari Maffei', role: UserRole.ADMIN, active: true }
      })
      : await this.prisma.user.create({
        data: {
          bitrixUserId: '8465', name: 'Lucas Nicotari Maffei',
          email: 'lucas.local@fortatech.test', role: UserRole.ADMIN, active: true
        }
      });
    return this.session(user);
  }

  async exchangeBitrixCode(code: string) {
    const codeHash = createHash('sha256').update(code).digest('hex');
    const launchCode = await this.prisma.bitrixLaunchCode.findUnique({
      where: { codeHash },
      include: { user: true }
    });
    if (!launchCode || launchCode.usedAt || launchCode.expiresAt <= new Date() || !launchCode.user.active) {
      throw new UnauthorizedException('Codigo de inicializacao invalido ou expirado');
    }
    const consumed = await this.prisma.bitrixLaunchCode.updateMany({
      where: { id: launchCode.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() }
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('Codigo de inicializacao ja utilizado');
    }
    const user = launchCode.user;
    return this.session(user);
  }

  private async session(user: { id: string; name: string; email: string; role: UserRole; bitrixUserId: string | null }) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, bitrixUserId: user.bitrixUserId },
      { expiresIn: 60 * 60 }
    );
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, bitrixUserId: user.bitrixUserId }
    };
  }
}
