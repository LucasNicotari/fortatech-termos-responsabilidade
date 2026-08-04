import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, TermWorkflowParticipant, User, UserRole } from '@prisma/client';
import { BitrixService } from '../bitrix/bitrix.service';
import { BitrixUser } from '../bitrix/bitrix.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrix: BitrixService,
    private readonly config: ConfigService
  ) {}

  async matrix() {
    const [assignments, appUsers] = await Promise.all([
      this.prisma.termWorkflowParticipant.findMany(),
      this.prisma.user.findMany({ where: { bitrixUserId: { not: null } } })
    ]);
    const selectedIds = new Set([
      ...assignments
        .filter((item) => item.canOperate || item.receiveNotifications)
        .map((item) => item.bitrixUserId),
      ...appUsers
        .filter((item) => item.active)
        .map((item) => item.bitrixUserId!)
    ]);
    const users = await Promise.all(
      [...selectedIds].map((id) => this.bitrix.getUserWithDepartment(Number(id)))
    );
    return this.settingsUsers(this.mapUsers(users, assignments, appUsers));
  }

  async candidates(search: string) {
    const normalized = this.normalize(search);
    return (await this.directoryMatrix())
      .filter((item) => !normalized || this.normalize(
        `${item.name} ${item.email} ${item.workPosition} ${item.departmentName} ${item.bitrixUserId}`
      ).includes(normalized))
      .slice(0, 20)
      .map((item) => this.settingsUser(item));
  }

  private async directoryMatrix() {
    const [users, assignments, appUsers] = await Promise.all([
      this.bitrix.listEmployeesWithDepartments(),
      this.prisma.termWorkflowParticipant.findMany(),
      this.prisma.user.findMany({ where: { bitrixUserId: { not: null } } })
    ]);
    return this.mapUsers(users, assignments, appUsers);
  }

  private mapUsers(users: BitrixUser[], assignments: TermWorkflowParticipant[], appUsers: User[]) {
    const byId = new Map(assignments.map((item) => [item.bitrixUserId, item]));
    const appUserById = new Map(appUsers.map((item) => [item.bitrixUserId!, item]));
    return users.filter((user) => user.ACTIVE !== false && user.ACTIVE !== 'N').map((user) => {
      const assignment = byId.get(String(user.ID));
      const appUser = appUserById.get(String(user.ID));
      return {
        bitrixUserId: Number(user.ID),
        name: [user.NAME, user.LAST_NAME].filter(Boolean).join(' ').trim() || user.EMAIL || `Usuário Bitrix ${user.ID}`,
        email: user.EMAIL || '',
        workPosition: user.WORK_POSITION || '',
        departmentName: user.DEPARTMENT_NAME || '',
        active: user.ACTIVE !== false && user.ACTIVE !== 'N',
        hasAccess: Boolean(appUser?.active || assignment?.canOperate),
        role: appUser?.role || (assignment?.canOperate ? UserRole.TI : UserRole.RH),
        canOperate: assignment?.canOperate || false,
        receiveNotifications: assignment?.receiveNotifications || false
      };
    }).sort((left, right) => left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' })
      || left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'variant' })
      || left.bitrixUserId - right.bitrixUserId);
  }

  async replace(dto: UpdateWorkflowDto, updatedByUserId: string) {
    const requested = dto.assignments.map((item) => ({ ...item, hasAccess: item.hasAccess || item.canOperate }));
    const selected = requested.filter((item) => item.canOperate || item.receiveNotifications);
    if (!requested.some((item) => item.canOperate)) {
      throw new BadRequestException('Selecione ao menos um operador');
    }
    const requestedIds = requested.map((item) => String(item.bitrixUserId));
    const ids = selected.map((item) => String(item.bitrixUserId));
    if (new Set(requestedIds).size !== requestedIds.length) throw new BadRequestException('Usuario duplicado nas atribuicoes');

    const bitrixUsers = (await this.bitrix.listEmployees())
      .filter((user) => user.ACTIVE !== false && user.ACTIVE !== 'N');
    const validUsers = new Map(bitrixUsers.map((user) => [String(user.ID), user]));
    const invalid = requestedIds.filter((id) => !validUsers.has(id));
    if (invalid.length) throw new BadRequestException(`Usuarios Bitrix24 invalidos: ${invalid.join(', ')}`);

    const [before, currentUser] = await Promise.all([
      this.prisma.termWorkflowParticipant.findMany({ orderBy: { bitrixUserId: 'asc' } }),
      this.prisma.user.findUnique({ where: { id: updatedByUserId } })
    ]);
    await this.prisma.$transaction(async (transaction) => {
      await transaction.termWorkflowParticipant.deleteMany({
        where: ids.length ? { bitrixUserId: { notIn: ids } } : undefined
      });
      for (const item of selected) {
        await transaction.termWorkflowParticipant.upsert({
          where: { bitrixUserId: String(item.bitrixUserId) },
          update: { canOperate: item.canOperate, receiveNotifications: item.receiveNotifications, updatedByUserId },
          create: { bitrixUserId: String(item.bitrixUserId), canOperate: item.canOperate, receiveNotifications: item.receiveNotifications, updatedByUserId }
        });
      }
      const accessIds = requested.filter((item) => item.hasAccess).map((item) => String(item.bitrixUserId));
      await transaction.user.updateMany({
        where: {
          bitrixUserId: { not: null, notIn: accessIds },
          id: currentUser ? { not: currentUser.id } : undefined
        },
        data: { active: false }
      });
      for (const item of requested) {
        const bitrixUser = validUsers.get(String(item.bitrixUserId))!;
        const name = [bitrixUser.NAME, bitrixUser.LAST_NAME].filter(Boolean).join(' ').trim() || `Bitrix ${bitrixUser.ID}`;
        const email = bitrixUser.EMAIL || `bitrix-${bitrixUser.ID}@local.invalid`;
        const existingUser = await transaction.user.findFirst({ where: { OR: [{ bitrixUserId: String(bitrixUser.ID) }, { email }] } });
        const isCurrentUser = existingUser?.id === currentUser?.id || String(bitrixUser.ID) === currentUser?.bitrixUserId;
        const active = isCurrentUser ? true : item.hasAccess;
        const role = isCurrentUser && currentUser?.role === UserRole.ADMIN ? UserRole.ADMIN : item.role;
        if (existingUser) {
          await transaction.user.update({ where: { id: existingUser.id }, data: { bitrixUserId: String(bitrixUser.ID), name, email, role, active } });
        } else if (active) {
          await transaction.user.create({ data: { bitrixUserId: String(bitrixUser.ID), name, email, role, active: true } });
        }
      }
      await transaction.auditEvent.create({
        data: {
          actorUserId: updatedByUserId,
          entityType: 'TERM_WORKFLOW',
          entityId: 'default',
          action: 'REPLACE_ASSIGNMENTS',
          before: this.toJson(before),
          after: this.toJson(requested)
        }
      });
    });
    return this.matrix();
  }

  async canOperate(bitrixUserId?: string) {
    if (!bitrixUserId) return false;
    const count = await this.prisma.termWorkflowParticipant.count();
    if (!count) return this.envIds('BITRIX_TERM_OPERATOR_USER_IDS').includes(bitrixUserId);
    return Boolean(await this.prisma.termWorkflowParticipant.findFirst({
      where: { bitrixUserId, canOperate: true }
    }));
  }

  async notificationRecipientIds() {
    const [total, assignments] = await Promise.all([
      this.prisma.termWorkflowParticipant.count(),
      this.prisma.termWorkflowParticipant.findMany({
        where: { receiveNotifications: true },
        select: { bitrixUserId: true },
        orderBy: { bitrixUserId: 'asc' }
      })
    ]);
    return total
      ? assignments.map((item) => Number(item.bitrixUserId))
      : this.envIds('BITRIX_TERM_NOTIFICATION_USER_IDS').map(Number);
  }

  private envIds(key: string) {
    return [...new Set((this.config.get<string>(key) || '').split(',').map((value) => value.trim()).filter(Boolean))];
  }

  private normalize(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  }

  private settingsUsers(items: ReturnType<WorkflowService['mapUsers']>) {
    return items.map((item) => this.settingsUser(item));
  }

  private settingsUser(item: ReturnType<WorkflowService['mapUsers']>[number]) {
    return {
      bitrixUserId: item.bitrixUserId,
      name: item.name,
      active: item.active,
      hasAccess: item.hasAccess,
      role: item.role,
      canOperate: item.canOperate,
      receiveNotifications: item.receiveNotifications
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value));
  }
}
