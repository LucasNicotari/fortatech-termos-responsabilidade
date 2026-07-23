# FortaDocs

Aplicativo interno da Forta Tech, incorporado ao Bitrix24, para preparar, revisar, enviar e acompanhar Termos de Responsabilidade.

## Fluxo oficial

1. Um operador autorizado abre o FortaDocs pelo Bitrix24.
2. Seleciona um colaborador ativo; nome, e-mail, cargo, departamento e foto vêm do perfil do Bitrix24.
3. Confere os dados, informa o CPF e registra os equipamentos entregues.
4. O backend preenche o DOCX, converte-o para PDF e disponibiliza uma prévia privada por cinco minutos.
5. Depois da revisão, o backend cria a solicitação no e-Signature for HR do Bitrix24.
6. O representante autorizado da empresa revisa, envia e confirma a assinatura no aplicativo móvel do Bitrix24.
7. O Bitrix24 libera o documento ao colaborador, que assina dentro do fluxo nativo.
8. Os usuários marcados para receber notificações acompanham o envio e a conclusão sem participar da assinatura.
9. O PDF concluído é recuperado do Cofre da empresa, salvo no bucket privado do Supabase e identificado por SHA-256.

Lucas e Osmar podem operar o fluxo inicial. Nicoly e Marcelo recebem notificações. Essas atribuições são editáveis em **Configurações > Usuários e acessos**.

## Componentes

- React, Vite, TypeScript, TanStack Query e Tailwind no frontend.
- NestJS, Prisma e PostgreSQL/Supabase no backend.
- OAuth e REST do Bitrix24 para identidade, pessoas, departamentos e notificações.
- Docxtemplater e LibreOffice headless para DOCX e PDF.
- Bitrix24 e-Signature for HR para envio, assinatura e Cofre da empresa.
- Supabase Storage privado para templates, prévias e documentos concluídos.
- Docker Compose para desenvolvimento e Render para HTTPS público.

## Desenvolvimento local

Na raiz do repositório:

```powershell
npm.cmd run dev:local
```

Abra `http://localhost:5173`. O modo local usa pessoas sintéticas e simula envio, assinatura manuscrita, notificações e arquivamento sem chamar o Bitrix24 ou enviar e-mail.

Teste ponta a ponta:

```powershell
npm.cmd run test:local
```

Encerramento:

```powershell
npm.cmd run local:down
```

## Variáveis privadas

Copie `.env.example` para `.env`. Nunca envie o `.env` ao Git ou ao chat.

- Supabase: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.
- Segurança: `JWT_SECRET`, `BITRIX_TOKEN_ENCRYPTION_KEY`.
- Bitrix24: `BITRIX_CLIENT_ID`, `BITRIX_CLIENT_SECRET`, `BITRIX_PORTAL_ORIGIN`, `BITRIX_SIGN_COMPANY_CRM_ID`.
- URLs: `PUBLIC_BACKEND_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `VITE_API_URL`.

Nenhum segredo pode usar prefixo `VITE_`. As listas de operadores e notificados do ambiente são apenas valores iniciais; depois da instalação, as escolhas persistem no banco.

## Verificação técnica

```powershell
Set-Location backend
npm.cmd test -- --runInBand
npm.cmd run lint
npm.cmd run build
Set-Location ..\frontend
npm.cmd run lint
npm.cmd run build
Set-Location ..
npm.cmd run test:local
```

## Documentação

- [Arquitetura e diagramas do fluxo](docs/architecture.md)
- [Runbook de homologação e implantação](docs/homologation-runbook.md)
- [Desenvolvimento local](docs/local-development.md)
- [Testes por Cloudflare Tunnel](docs/local-cloudflare-tests.md)
- [Banco de dados](docs/database.md)
- [Supabase](docs/supabase.md)
- [Assinatura nativa Bitrix24](docs/bitrix-signature.md)
- [Segurança e operação](docs/security-operations.md)
- [Revisão jurídica](docs/legal-review-checklist.md)
- [Otimização das imagens Docker](docs/docker-optimization-report.md)

O ambiente atual é de homologação. O documento operacional preserva o Word original, não exibe faixa de homologação e centraliza os dois títulos principais. Produção ainda exige aprovação jurídica, segredos e projetos separados e hospedagem de backend que não suspenda por inatividade.
