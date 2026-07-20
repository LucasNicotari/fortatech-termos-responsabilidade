import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

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
