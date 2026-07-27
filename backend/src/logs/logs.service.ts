import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async activity() {
    const [auditEvents, requests, signatures, errors] = await Promise.all([
      this.prisma.auditEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 40,
        include: { actor: { select: { name: true } } }
      }),
      this.prisma.sendRequest.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 40,
        include: {
          requestedBy: { select: { name: true } },
          employee: { select: { nome: true } }
        }
      }),
      this.prisma.signature.findMany({
        where: { signedAt: { not: null } },
        orderBy: { signedAt: 'desc' },
        take: 30,
        include: { employee: { select: { nome: true } } }
      }),
      this.prisma.integrationLog.findMany({
        where: { error: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    ]);

    const activity = [
      ...auditEvents.map((event) => ({
        id: `audit:${event.id}`,
        actor: event.actor?.name || 'Sistema',
        action: this.auditAction(event.action, event.entityType),
        context: this.auditContext(event.metadata),
        status: 'SUCCESS' as const,
        createdAt: event.createdAt
      })),
      ...requests.map((request) => ({
        id: `request:${request.id}`,
        actor: request.requestedBy?.name || 'Sistema',
        action: request.failureReason
          ? `encontrou uma falha no termo de ${request.employee.nome}`
          : request.sentAt
            ? `enviou um termo para ${request.employee.nome}`
            : `criou um rascunho para ${request.employee.nome}`,
        context: request.failureReason || request.documentFileName || undefined,
        status: request.failureReason ? 'ERROR' as const : 'SUCCESS' as const,
        createdAt: request.sentAt || request.requestedAt
      })),
      ...signatures.map((signature) => ({
        id: `signature:${signature.id}`,
        actor: signature.employee.nome,
        action: 'assinou o termo de responsabilidade',
        context: 'Assinatura do colaborador concluída',
        status: 'SUCCESS' as const,
        createdAt: signature.signedAt!
      })),
      ...errors.map((log) => ({
        id: `error:${log.id}`,
        actor: 'Sistema',
        action: `registrou uma falha em ${log.source}`,
        context: log.error || log.endpoint || undefined,
        status: 'ERROR' as const,
        createdAt: log.createdAt
      }))
    ];

    return activity
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 60);
  }

  create(data: {
    type: string;
    source: string;
    endpoint?: string;
    method?: string;
    httpStatus?: number;
    durationMs?: number;
    correlationId?: string;
    payload?: unknown;
    response?: unknown;
    error?: string;
  }) {
    return this.prisma.integrationLog.create({
      data: {
        ...data,
        payload: this.toJson(this.redact(data.payload)),
        response: this.toJson(this.redact(data.response)),
        error: typeof data.error === 'string'
          ? String(this.redact(data.error))
          : data.error
      }
    });
  }

  private redact(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
    }
    if (typeof value === 'string') {
      return value.replace(
        /((?:params(?:%5B|\[)signing(?:%5D|\])|launchCode|access_token|refresh_token|application_token)=)[A-Za-z0-9._~-]{16,}/gi,
        '$1[REDACTED]'
      );
    }
    if (!value || typeof value !== 'object') {
      return value;
    }
    const sensitive = /token|secret|password|authorization|filecontent|base64|file_url|signedurl/i;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sensitive.test(key) ? '[REDACTED]' : this.redact(item)
      ])
    );
  }

  private toJson(value: unknown) {
    if (value === undefined) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value));
  }

  private auditAction(action: string, entityType: string) {
    const actions: Record<string, string> = {
      REPLACE_ASSIGNMENTS: 'atualizou operadores e notificações',
      UPLOAD: 'adicionou uma nova versão de template',
      SET_DEFAULT: 'definiu o template padrão',
      ACTIVATE: 'ativou uma versão de template',
      DEACTIVATE: 'desativou uma versão de template'
    };
    return actions[action] || `alterou ${entityType.toLocaleLowerCase('pt-BR').replace(/_/g, ' ')}`;
  }

  private auditContext(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
    const values = metadata as Record<string, unknown>;
    const candidate = values.name || values.version || values.fileName;
    return typeof candidate === 'string' ? candidate : undefined;
  }
}
