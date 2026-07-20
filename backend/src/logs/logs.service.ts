import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.integrationLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async findOne(id: string) {
    const log = await this.prisma.integrationLog.findUnique({ where: { id } });
    if (!log) {
      throw new NotFoundException('Log não encontrado');
    }
    return log;
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
        response: this.toJson(this.redact(data.response))
      }
    });
  }

  private redact(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redact(item));
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
}
