import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SigningJwtStrategy extends PassportStrategy(Strategy, 'signing-jwt') {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'change-me'
    });
  }

  async validate(payload: {
    sub: string;
    scope?: string;
    bitrixUserId?: string;
    signatureId?: string;
  }) {
    if (payload.scope !== 'SIGN_DOCUMENT' || !payload.bitrixUserId || !payload.signatureId) {
      throw new UnauthorizedException('Sessao de assinatura invalida');
    }
    const invitation = await this.prisma.signingInvitation.findUnique({
      where: { id: payload.sub }
    });
    if (!invitation
      || invitation.bitrixUserId !== payload.bitrixUserId
      || invitation.signatureId !== payload.signatureId
      || invitation.revokedAt
      || invitation.expiresAt <= new Date()) {
      throw new UnauthorizedException('Sessao de assinatura expirada');
    }
    return {
      accessMode: 'SIGNER' as const,
      invitationId: invitation.id,
      signatureId: invitation.signatureId,
      bitrixUserId: invitation.bitrixUserId
    };
  }
}
