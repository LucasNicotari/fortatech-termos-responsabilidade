# Implantacao permanente com Docker e Traefik

## Arquitetura

Esta implantacao adapta o modelo recebido para o FortaDocs sem alterar seu fluxo:

```text
Internet / Bitrix24
        |
        v
Traefik existente :80/:443 + Let's Encrypt
        |
        +-- https://FORTADOCS_DOMAIN/       -> frontend Nginx
        |
        +-- https://FORTADOCS_DOMAIN/api/*  -> backend NestJS
                                            |
                                            +-- PostgreSQL/Supabase
                                            +-- Supabase Storage
                                            +-- Bitrix24 REST/Drive
```

O middleware `StripPrefix` remove somente `/api` antes de encaminhar a chamada ao Nest. Assim,
as rotas internas continuam iguais e o frontend, o convite de assinatura e o OAuth preservam o
comportamento atual.

O Compose nao inicia outro Traefik nem publica portas diretamente. Ele entra na rede externa
`fortatech-proxy` que ja aparece no ambiente informado. Isso evita conflito nas portas 80/443 e
mantem o proxy central como unico responsavel por DNS, HTTPS e certificados.

O dashboard existente continua usando `APP_DOMAIN`. O FortaDocs usa `FORTADOCS_DOMAIN` para nao
sobrescrever esse endereco. A configuracao tambem reaproveita os middlewares ja declarados no
Traefik: `redirect-to-https@file`, `secure-headers@file` e `compression@file`.

## Pre-requisitos do servidor

- Linux com Docker Engine e Docker Compose v2;
- Traefik em execucao, com entrypoints `web` e `websecure`;
- certificate resolver do Traefik chamado `letsencrypt`;
- rede Docker externa `fortatech-proxy`;
- portas publicas 80 e 443 liberadas;
- registro DNS `A` ou `AAAA` de `FORTADOCS_DOMAIN` apontando para o servidor;
- projeto Supabase acessivel a partir do servidor.

Confirme antes de implantar:

```bash
docker version
docker compose version
docker network inspect fortatech-proxy
docker ps --filter name=fortatech-traefik
```

O desafio HTTP do Let's Encrypt exige que o dominio alcance a porta 80 publica. Nao inicie outro
Traefik se o servidor ja possui o `fortatech-traefik`.

## Preparacao

No servidor:

```bash
git clone URL_DO_REPOSITORIO fortadocs
cd fortadocs
cp .env.production.example .env.production
chmod 600 .env.production
```

Preencha todos os valores `CHANGE_ME` e `PROJECT_REF`. Gere segredos independentes:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Use o primeiro em `JWT_SECRET` e o segundo em `BITRIX_TOKEN_ENCRYPTION_KEY`. Nunca use uma
variavel com prefixo `VITE_` para segredos.

Para preservar os registros existentes, use no novo container o mesmo projeto PostgreSQL e
Storage do ambiente atual. Antes do corte, gere um backup do banco e confirme que o bucket
`responsibility-terms` e privado.

## Conexao do banco

O backend e persistente. Prefira a conexao direta do Supabase quando o host possuir IPv6 ou o
Supavisor em modo de sessao quando precisar de IPv4. Nao use transaction pooler com prepared
statements sem a configuracao correspondente do Prisma.

`DIRECT_URL` deve permitir migrations. Valide a conectividade antes de trocar o Bitrix:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -f docker-compose.production.yml build --pull
```

Use a URL fornecida pelo painel do Supabase e aplique URL encoding aos caracteres especiais da
senha antes de grava-la no endereco PostgreSQL.

## Subida

```bash
export APP_REVISION="$(git rev-parse --short HEAD)"
docker compose --env-file .env.production -f docker-compose.production.yml up -d --wait
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=100 backend frontend
```

O backend executa `prisma migrate deploy` antes de iniciar. O seed e idempotente e conserva as
configuracoes existentes. Os dois servicos usam `restart: unless-stopped`, limites de recursos,
logs rotativos e health checks. Banco e PDFs permanecem fora dos containers.

Valide publicamente:

```bash
curl -fsS "https://FORTADOCS_DOMAIN/api/health/live"
curl -fsS "https://FORTADOCS_DOMAIN/api/health/ready"
curl -fsSI "https://FORTADOCS_DOMAIN/"
```

O primeiro endpoint comprova que o processo esta vivo. O segundo tambem confirma acesso ao banco.
Swagger deve retornar 404 em producao:

```bash
curl -o /dev/null -s -w "%{http_code}\n" "https://FORTADOCS_DOMAIN/api/docs"
```

O teste remoto do repositorio pode ser executado assim:

```bash
FORTADOCS_BACKEND_URL=https://FORTADOCS_DOMAIN/api \
FORTADOCS_FRONTEND_URL=https://FORTADOCS_DOMAIN \
npm run test:remote
```

## Configuracao no Bitrix24

No aplicativo local do portal `fortaeqt.bitrix24.com.br`, mantenha o tipo **Servidor** e configure:

```text
Seu caminho do manipulador:
https://FORTADOCS_DOMAIN/api/integrations/bitrix/launch

Caminho de instalacao inicial:
https://FORTADOCS_DOMAIN/api/integrations/bitrix/install
```

Escopos:

```text
basic
user
user_basic
department
im
placement
disk
```

Depois de mudar os enderecos, salve e reinstale o aplicativo. A reinstalacao grava os tokens no
mesmo banco, registra os eventos e atualiza `REST_APP_URI`. Teste com um operador e colaborador
controlados antes de desativar o ambiente Render.

## Corte e retorno

1. Reduza o TTL do DNS com antecedencia.
2. Suba e teste o novo dominio sem desligar o Render.
3. Atualize os dois caminhos no aplicativo local Bitrix24.
4. Reinstale o aplicativo e conclua um termo controlado.
5. Confirme chat, assinatura, hash, Storage e Drive.
6. Mantenha o Render disponivel durante a janela de observacao.

Para voltar, restaure no Bitrix os dois enderecos anteriores e reinstale o aplicativo. Nao execute
`prisma migrate reset` e nao apague volumes durante rollback.

## Operacao

Atualizacao:

```bash
git pull --ff-only
export APP_REVISION="$(git rev-parse --short HEAD)"
docker compose --env-file .env.production -f docker-compose.production.yml build --pull
docker compose --env-file .env.production -f docker-compose.production.yml up -d --wait
```

Observacao:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs -f --tail=200
```

Configure um monitor externo para `/api/health/ready`, alerta de indisponibilidade e backup
testado do Supabase. Um container permanente elimina a suspensao por inatividade do Render, mas
nao cria alta disponibilidade: energia, rede, disco, DNS, Traefik, Supabase e o proprio host ainda
precisam de monitoramento.

O Traefik informado monta o socket Docker como somente leitura. Isso e funcional, mas o socket
continua sendo uma superficie privilegiada; em uma etapa posterior, avalie um socket proxy com
permissoes minimas.

## Referencias oficiais

- Traefik com Docker: <https://doc.traefik.io/traefik/v3.3/providers/docker/>
- Traefik e Let's Encrypt por HTTP challenge:
  <https://doc.traefik.io/traefik/v3.3/user-guides/docker-compose/acme-http/>
- Conexoes PostgreSQL no Supabase:
  <https://supabase.com/docs/guides/database/connecting-to-postgres>
- Prisma no Supabase: <https://supabase.com/docs/guides/database/prisma>
