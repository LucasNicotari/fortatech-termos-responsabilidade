import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'change-me'
    });
  }

  async validate(payload: { sub: string; email: string; role: string; bitrixUserId?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.active) return null;
    return { id: user.id, email: user.email, role: user.role, bitrixUserId: user.bitrixUserId };
  }
}
