import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const templates = await this.prisma.documentTemplate.findMany({
      orderBy: [{ ativo: 'desc' }, { createdAt: 'desc' }],
      include: {
        versions: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
        }
      }
    });

    return templates.map((template) => this.toLegacyTemplate(template));
  }

  async create(dto: CreateTemplateDto) {
    const template = await this.prisma.documentTemplate.create({
      data: {
        nome: dto.nome,
        descricao: dto.descricao,
        ativo: dto.ativo ?? true,
        versions: {
          create: {
            versao: dto.versao,
            descricao: dto.descricao,
            ativo: dto.ativo ?? true
          }
        }
      },
      include: { versions: true }
    });

    return this.toLegacyTemplate(template);
  }

  async update(id: string, dto: UpdateTemplateDto) {
    const template = await this.ensureExists(id);
    const primaryVersion = template.versions[0];

    const updated = await this.prisma.documentTemplate.update({
      where: { id },
      data: {
        nome: dto.nome,
        descricao: dto.descricao,
        ativo: dto.ativo,
        versions: primaryVersion
          ? {
              update: {
                where: { id: primaryVersion.id },
                data: {
                  versao: dto.versao,
                  descricao: dto.descricao,
                  ativo: dto.ativo
                }
              }
            }
          : dto.versao
            ? {
                create: {
                  versao: dto.versao,
                  descricao: dto.descricao,
                  ativo: dto.ativo ?? true
                }
              }
            : undefined
      },
      include: { versions: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] } }
    });

    return this.toLegacyTemplate(updated);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    return this.prisma.documentTemplate.delete({ where: { id } });
  }

  private async ensureExists(id: string) {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { id },
      include: { versions: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] } }
    });
    if (!template) {
      throw new NotFoundException('Template nao encontrado');
    }
    return template;
  }

  private toLegacyTemplate(template: {
    id: string;
    nome: string;
    descricao: string | null;
    ativo: boolean;
    createdAt: Date;
    updatedAt: Date;
    versions: Array<{
      id: string;
      versao: string;
      isDefault: boolean;
      ativo: boolean;
    }>;
  }) {
    const version = template.versions[0];
    return {
      id: template.id,
      nome: template.nome,
      versao: version?.versao || '1.0',
      descricao: template.descricao || undefined,
      ativo: template.ativo,
      templateVersionId: version?.id,
      isDefault: version?.isDefault || false,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt
    };
  }
}
