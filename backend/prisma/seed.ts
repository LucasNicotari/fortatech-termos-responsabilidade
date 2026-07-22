import { PrismaClient } from '@prisma/client';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(process.cwd(), '../.env') });
loadEnv({ path: resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();

async function main() {
  const template = await prisma.documentTemplate.upsert({
    where: { id: 'default-responsibility-term' },
    update: {
      nome: 'Termo de Responsabilidade',
      descricao: 'Modelo padrao para envio manual e assinatura no Bitrix24.',
      ativo: true
    },
    create: {
      id: 'default-responsibility-term',
      nome: 'Termo de Responsabilidade',
      descricao: 'Modelo padrao para envio manual e assinatura no Bitrix24.',
      ativo: true
    }
  });

  const currentDefault = await prisma.documentTemplateVersion.findFirst({
    where: { isDefault: true, ativo: true }
  });
  const replaceLegacyDefault = !currentDefault
    || (currentDefault.templateId === template.id
      && ['0.9-hml', '1.0', '1.0-operacional'].includes(currentDefault.versao));

  await prisma.documentTemplateVersion.updateMany({
    where: { templateId: template.id, versao: '1.0' },
    data: {
      descricao: 'Versao legada de desenvolvimento; nao usar em homologacao ou producao.',
      isDefault: false,
      ativo: false
    }
  });

  await prisma.documentTemplateVersion.upsert({
    where: { templateId_versao: { templateId: template.id, versao: '0.9-hml' } },
    update: {
      descricao: 'Documento anterior de homologacao, preservado para rastreabilidade.',
      isDefault: false,
      ativo: false
    },
    create: {
      templateId: template.id,
      versao: '0.9-hml',
      descricao: 'Documento anterior de homologacao, preservado para rastreabilidade.',
      isDefault: false,
      ativo: false
    }
  });

  const operational = await prisma.documentTemplateVersion.upsert({
    where: { templateId_versao: { templateId: template.id, versao: '1.0-operacional' } },
    update: {
      descricao: 'Modelo operacional sem faixa de homologacao, com titulos centralizados.',
      ativo: true
    },
    create: {
      templateId: template.id,
      versao: '1.0-operacional',
      descricao: 'Modelo operacional sem faixa de homologacao, com titulos centralizados.',
      isDefault: false,
      ativo: true
    }
  });

  if (replaceLegacyDefault) {
    await prisma.$transaction([
      prisma.documentTemplateVersion.updateMany({ data: { isDefault: false } }),
      prisma.documentTemplateVersion.update({
        where: { id: operational.id },
        data: { isDefault: true, ativo: true }
      })
    ]);
  }
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
