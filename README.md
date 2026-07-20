# Fortatech Termos

Aplicativo local embutido no Bitrix24 para preparar, revisar, enviar e acompanhar Termos de Responsabilidade. A assinatura ocorre no Bitrix24 Sign B2E e uma copia privada do PDF concluido e arquivada no Supabase Storage.

## Fluxo

1. O administrador instala o aplicativo local com os escopos `basic`, `user`, `crm` e `sign.b2e`.
2. RH/TI seleciona um colaborador, informa CPF e equipamentos e salva um rascunho.
3. O backend parametriza o DOCX aprovado, converte para PDF e cria uma previa privada.
4. Depois da revisao, `sign.b2e.document.send` envia o PDF ao representante e ao colaborador.
5. Eventos oficiais atualizam o status pelo UID do documento.
6. Ao concluir, o PDF do cofre da empresa e copiado para o bucket privado `responsibility-terms` com SHA-256.

O aplicativo gera o PDF, mas nao cria assinatura propria nem substitui o Bitrix24.

## Stack

- Backend: NestJS, Prisma, PostgreSQL/Supabase, OAuth Bitrix24 e Swagger.
- Frontend: React, Vite, TypeScript, TanStack Query e Tailwind.
- Documento: Docxtemplater e LibreOffice headless.
- Arquivos: Supabase Storage privado.
- Infra: Docker Compose.

## Configuracao

Copie `.env.example` para `.env`. Variaveis principais:

- `DATABASE_URL` e `DIRECT_URL`: conexoes PostgreSQL do Supabase.
- `JWT_SECRET`: assinatura das sessoes curtas do aplicativo.
- `BITRIX_TOKEN_ENCRYPTION_KEY`: chave forte e exclusiva para cifrar tokens OAuth no banco.
- `BITRIX_CLIENT_ID` e `BITRIX_CLIENT_SECRET`: credenciais do aplicativo local.
- `BITRIX_PORTAL_ORIGIN`: origem autorizada a carregar o iframe.
- `PUBLIC_BACKEND_URL`: URL HTTPS que recebe instalacao e eventos.
- `SUPABASE_URL` e `SUPABASE_SECRET_KEY`: acesso server-side ao Storage.
- `RESPONSIBILITY_TEMPLATE_PATH`: caminho do DOCX aprovado.
- `FRONTEND_URL` e `VITE_API_URL`: URLs publicas do frontend e backend.

Segredos reais ficam somente no `.env` e nunca devem usar prefixos publicos no frontend.

## Banco

```bash
cd backend
npm.cmd run prisma:generate
npm.cmd run prisma:deploy
npm.cmd run prisma:seed
```

As tabelas `app_*` usam RLS e revogam acesso de `anon` e `authenticated`. A aplicacao acessa o banco somente pelo backend.

## Desenvolvimento

```bash
cd backend
npm.cmd install
npm.cmd run start:dev
```

```bash
cd frontend
npm.cmd install
npm.cmd run dev
```

Para Docker, copie o DOCX para `templates/term.docx` ou configure `RESPONSIBILITY_TEMPLATE_HOST_PATH`:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

O arquivo adicional usa PostgreSQL e armazenamento assinado locais, permitindo desenvolver sem
um projeto Supabase ativo. Para homologacao/producao, use apenas `docker-compose.yml` e configure
as credenciais reais do Supabase.

O repositório já inclui uma cópia parametrizada do documento recebido, marcada como
`HOMOLOGAÇÃO — SEM VALIDADE`, e preserva o original por SHA-256. Para obter credenciais e concluir
o deploy, siga [o runbook de homologação](docs/homologation-runbook.md). A publicação no Render é
descrita de forma reproduzível em `render.yaml`.

## Aplicativo local Bitrix24

Publique frontend e backend em HTTPS. Em **Aplicativos > Recursos do desenvolvedor > Aplicativo local**, configure:

```text
URL da aplicacao: https://seu-backend.com/integrations/bitrix/launch
Instalacao inicial: https://seu-backend.com/integrations/bitrix/install
Permissoes: basic, user, crm, sign.b2e
```

O instalador vira `ADMIN`. Os demais usuarios precisam ser autorizados em **Configuracoes**. Nessa tela tambem sao definidos empresa CRM, provedor, representante, responsavel e tipo regional.

## Verificacao

```bash
cd backend
npm.cmd test
npm.cmd run build
cd ../frontend
npm.cmd run build
```

Documentacao complementar: [banco](docs/database.md), [Bitrix24](docs/bitrix-flow.md),
[Supabase](docs/supabase.md), [revisão jurídica](docs/legal-review-checklist.md) e
[segurança operacional](docs/security-operations.md).
