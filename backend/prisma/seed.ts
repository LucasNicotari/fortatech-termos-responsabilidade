import { PrismaClient } from '@prisma/client';

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

  await prisma.documentTemplateVersion.updateMany({
    where: { templateId: template.id, isDefault: true },
    data: { isDefault: false }
  });

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
      descricao: 'Documento candidato, parametrizado e marcado para homologacao.',
      isDefault: true,
      ativo: true
    },
    create: {
      templateId: template.id,
      versao: '0.9-hml',
      descricao: 'Documento candidato, parametrizado e marcado para homologacao.',
      isDefault: true,
      ativo: true
    }
  });
}

main()
  .finally(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
