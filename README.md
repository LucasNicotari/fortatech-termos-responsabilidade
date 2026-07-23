# FortaDocs

Aplicativo interno da Forta Tech, incorporado ao Bitrix24, para preparar, revisar, enviar e acompanhar Termos de Responsabilidade.

## Fluxo oficial

1. Um operador autorizado abre o FortaDocs pelo Bitrix24.
2. Seleciona um colaborador ativo; nome, e-mail, cargo, departamento e foto vêm do perfil do Bitrix24.
3. Confere os dados, informa o CPF e registra os equipamentos entregues.
4. O backend preenche o DOCX, converte-o para PDF e disponibiliza uma prévia privada por cinco minutos.
5. Depois da revisão, o backend envia ao chat do colaborador um convite pessoal válido por sete dias.
6. Ao abrir o convite, o Bitrix24 confirma a identidade e o termo passa para **Visualizado**.
7. O colaborador digita, desenha ou importa a assinatura dentro do Bitrix24; o PDF passa para **Assinado**.
8. Os usuários escolhidos são notificados sem participar da assinatura.
9. O PDF assinado é preservado no bucket privado do Supabase e enviado ao Drive do Bitrix24.
10. Somente após a confirmação na pasta `Termo de Responsabilidade` o termo passa para **Concluído**.

Lucas e Osmar podem operar o fluxo inicial. Nicoly e Marcelo recebem notificações. Essas atribuições são editáveis em **Configurações > Usuários e acessos**.

## Componentes

- React, Vite, TypeScript, TanStack Query e Tailwind no frontend.
- NestJS, Prisma e PostgreSQL/Supabase no backend.
- OAuth e REST do Bitrix24 para identidade, pessoas, departamentos e notificações.
- Docxtemplater e LibreOffice headless para DOCX e PDF.
- Chat, OAuth, `REST_APP_URI` e Drive do Bitrix24 para convite, identidade, assinatura e arquivo final.
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
- Bitrix24: `BITRIX_CLIENT_ID`, `BITRIX_CLIENT_SECRET`, `BITRIX_PORTAL_ORIGIN`, `BITRIX_DRIVE_OWNER_USER_ID`, `BITRIX_DRIVE_FOLDER_NAME`.
- URLs: `PUBLIC_BACKEND_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `VITE_API_URL`.

Nenhum segredo pode usar prefixo `VITE_`. As listas de operadores e notificados do ambiente são apenas valores iniciais; depois da instalação, as escolhas persistem no banco.
O aplicativo local precisa dos escopos `basic`, `user`, `crm`, `im` e `disk`; qualquer alteração
de escopo exige salvar e reinstalar o aplicativo no portal.

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
- [Fluxo detalhado da assinatura interna](docs/internal-signing-flow.md)
- [Runbook de homologação e implantação](docs/homologation-runbook.md)
- [Desenvolvimento local](docs/local-development.md)
- [Testes por Cloudflare Tunnel](docs/local-cloudflare-tests.md)
- [Banco de dados](docs/database.md)
- [Supabase](docs/supabase.md)
- [Assinatura interna no Bitrix24](docs/bitrix-signature.md)
- [Segurança e operação](docs/security-operations.md)
- [Revisão jurídica](docs/legal-review-checklist.md)
- [Otimização das imagens Docker](docs/docker-optimization-report.md)

O ambiente atual é de homologação. O documento operacional preserva o Word original, não exibe faixa de homologação e centraliza os dois títulos principais. Produção ainda exige aprovação jurídica, segredos e projetos separados e hospedagem de backend que não suspenda por inatividade.
