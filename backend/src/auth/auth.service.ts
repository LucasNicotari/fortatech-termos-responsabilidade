import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly workflow: WorkflowService
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
      include: {
        user: true,
        signingInvitation: {
          include: { signature: { include: { employee: true } } }
        }
      }
    });
    if (!launchCode || launchCode.usedAt || launchCode.expiresAt <= new Date()) {
      throw new UnauthorizedException('Codigo de inicializacao invalido ou expirado');
    }
    const invitation = launchCode.signingInvitation;
    if (invitation && (
      invitation.revokedAt
      || invitation.expiresAt <= new Date()
    )) {
      throw new UnauthorizedException('Convite de assinatura invalido ou expirado');
    }
    if (!invitation && !launchCode.user?.active) {
      throw new UnauthorizedException('Usuario nao autorizado');
    }
    const consumed = await this.prisma.bitrixLaunchCode.updateMany({
      where: { id: launchCode.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() }
    });
    if (consumed.count !== 1) {
      throw new UnauthorizedException('Codigo de inicializacao ja utilizado');
    }
    if (invitation) {
      const employee = invitation.signature.employee;
      const accessToken = await this.jwt.signAsync({
        sub: invitation.id,
        scope: 'SIGN_DOCUMENT',
        bitrixUserId: invitation.bitrixUserId,
        signatureId: invitation.signatureId
      }, { expiresIn: 60 * 60 });
      return {
        accessToken,
        accessMode: 'SIGNER',
        user: {
          name: employee.nome,
          email: employee.email,
          role: 'SIGNER',
          bitrixUserId: invitation.bitrixUserId
        }
      };
    }
    return this.session(launchCode.user!);
  }

  async currentSession(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.active) {
      throw new UnauthorizedException('Usuario nao autorizado');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      bitrixUserId: user.bitrixUserId,
      canOperate: await this.workflow.canOperate(user.bitrixUserId || undefined)
    };
  }

  private async session(user: { id: string; name: string; email: string; role: UserRole; bitrixUserId: string | null }) {
    const canOperate = await this.workflow.canOperate(user.bitrixUserId || undefined);
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, bitrixUserId: user.bitrixUserId },
      { expiresIn: 60 * 60 }
    );
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return {
      accessToken,
      accessMode: 'ADMIN',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        bitrixUserId: user.bitrixUserId,
        canOperate
      }
    };
  }
}
