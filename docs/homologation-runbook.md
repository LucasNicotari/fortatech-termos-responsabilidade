# Runbook de homologação

Não envie credenciais pelo chat, não as grave no Git e não use dados reais de colaboradores na
homologação. Preencha segredos diretamente no `.env` local e no painel do Render.

## 1. Validação local

```powershell
docker info
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
Invoke-WebRequest http://localhost:3000/health -UseBasicParsing
Invoke-WebRequest http://localhost:5173 -UseBasicParsing
powershell -ExecutionPolicy Bypass -File scripts/check-homologation.ps1 -Mode local
```

## 2. Supabase `fortatech-termos-hml`

1. Crie um projeto hospedado no Supabase e guarde a senha do banco em um gerenciador.
2. Em **Connect**, copie o transaction pooler para `DATABASE_URL` e o session pooler, porta
   5432, para `DIRECT_URL`.
3. Em **Project Settings > API Keys**, copie a Project URL para `SUPABASE_URL` e a chave
   `sb_secret_...` para `SUPABASE_SECRET_KEY`.
4. Não use `anon`, `publishable`, `service_role`, `NEXT_PUBLIC_*` ou `VITE_*` no backend.
5. Com as quatro variáveis no `.env`, execute:

```powershell
Set-Location backend
npm.cmd run prisma:generate
npm.cmd run prisma:deploy
npm.cmd run prisma:seed
```

6. Faça uma prévia pelo aplicativo para criar idempotentemente o bucket privado
   `responsibility-terms`.
7. No Dashboard, confirme bucket privado, limite de 20 MB e tipos PDF/DOCX.
8. Execute Security e Performance Advisors e confirme que tabelas `app_*` não são acessíveis por
   `anon` ou `authenticated`. A aplicação acessa essas tabelas apenas pelo Prisma.

As mudanças de 2026 sobre exposição automática da Data API não afetam o fluxo do Prisma. Não
conceda acesso público para contornar erros de conexão.

## 3. Repositório privado e Render

1. Crie um repositório Git privado e envie a branch `main`.
2. No Render, crie um Blueprint usando `render.yaml`.
3. Durante a configuração inicial, use o plano `free` da API e o static site gratuito do frontend.
   Antes dos testes de assinatura e webhooks do Bitrix24, altere a API para `starter`, evitando
   suspensão após inatividade e atrasos no recebimento de eventos.
4. Informe no Blueprint as variáveis do Supabase. Para as duas credenciais Bitrix ainda
   indisponíveis, use temporariamente `PENDING_CONFIGURATION` e substitua depois.
5. Se algum nome `onrender.com` já estiver ocupado, atualize no Render e também:
   `PUBLIC_BACKEND_URL`, `FRONTEND_URL` e `VITE_API_URL`.
6. Confirme `GET /health` com resposta `200` antes de criar o aplicativo Bitrix.

## 4. Aplicativo local Bitrix24

No portal administrativo, crie uma aplicação local do tipo servidor com:

```text
URL da aplicação:
https://BACKEND-HML/integrations/bitrix/launch

URL de instalação inicial:
https://BACKEND-HML/integrations/bitrix/install

Escopos:
basic, user, crm, sign.b2e
```

Copie o código e a chave diretamente para `BITRIX_CLIENT_ID` e `BITRIX_CLIENT_SECRET` no Render.
Troque `BITRIX_PORTAL_ORIGIN` pelo domínio HTTPS exato do portal e replique esse domínio no
header `frame-ancestors` do frontend em `render.yaml`. Reimplante os dois serviços e instale o app.

Dentro do aplicativo, selecione empresa CRM, provedor, representante, responsável e confirme o
acesso ao Cofre. Use `12.999` somente na homologação até haver confirmação empresarial.

## 5. Teste ponta a ponta

- Use um usuário Bitrix destinado a teste, CPF sintético e patrimônios fictícios.
- Abra pelo menu do Bitrix e confirme que acesso direto ou usuário não autorizado falha.
- Crie, edite e visualize um rascunho com pelo menos dois equipamentos.
- Confirme a marca `HOMOLOGAÇÃO — SEM VALIDADE` em todas as evidências de teste.
- Envie, assine com os participantes de teste e acompanhe os eventos.
- Verifique o PDF final privado no Supabase, seu SHA-256 e a expiração da URL assinada.
- Reenvie um evento já processado e confirme a deduplicação.

## 6. Portão de produção

Produção exige projetos, aplicativo Bitrix e segredos separados, domínio próprio, documento sem
marca e aprovado formalmente, política de retenção definida, limpeza dos dados de homologação e
novo teste controlado. Consulte também `docs/legal-review-checklist.md` e
`docs/security-operations.md`.
