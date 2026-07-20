import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BitrixService } from '../bitrix/bitrix.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly bitrix: BitrixService) {}

  findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        bitrixUserId: true,
        active: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  async authorizeBitrixUser(bitrixUserId: number, role: UserRole) {
    const bitrixUser = await this.bitrix.getUser(bitrixUserId);
    const name = [bitrixUser.NAME, bitrixUser.LAST_NAME].filter(Boolean).join(' ') || `Bitrix ${bitrixUser.ID}`;
    const email = bitrixUser.EMAIL || `bitrix-${bitrixUser.ID}@local.invalid`;
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ bitrixUserId: bitrixUser.ID }, { email }] } });
    return existing
      ? this.prisma.user.update({ where: { id: existing.id }, data: { bitrixUserId: bitrixUser.ID, name, email, role, active: true } })
      : this.prisma.user.create({ data: { bitrixUserId: bitrixUser.ID, name, email, role } });
  }

  updateAccess(id: string, role: UserRole, active: boolean) {
    return this.prisma.user.update({ where: { id }, data: { role, active } });
  }
}
