# Testes locais com Cloudflare Tunnel

Este fluxo publica temporariamente a aplicacao que esta no Docker local em duas URLs HTTPS
`trycloudflare.com`: uma para o backend e outra para o frontend. Ele serve para validar a
comunicacao externa, CORS, headers de iframe, rotas publicas do Bitrix e protecao das rotas
administrativas antes de apontar o aplicativo local do Bitrix24 para essas URLs.

## Por que Wrangler pelo npm

O projeto usa o `wrangler`, CLI oficial da Cloudflare, como dependencia de desenvolvimento com
versao fixa no `package-lock.json`. O npm instala e executa sempre a mesma versao para todos os
desenvolvedores. Nao usamos o pacote comunitario chamado `cloudflared`; o Wrangler gerencia o
binario oficial necessario para o Quick Tunnel.

Quick Tunnels sao gratuitos, nao exigem dominio nem abertura de portas no roteador. Eles sao
somente para teste: a URL aleatoria muda a cada execucao, nao ha garantia de disponibilidade,
existe limite de requisicoes simultaneas e nao ha suporte a SSE. Nenhum desses limites afeta o
fluxo HTTP e webhook usado neste teste.

## Preparacao unica

Na raiz do repositorio, execute:

```powershell
npm.cmd install
```

Usamos `npm.cmd` no PowerShell porque a politica de execucao do Windows pode bloquear o wrapper
`npm.ps1`. O comando instala apenas ferramentas de desenvolvimento; Wrangler nao entra nas
imagens de producao do backend ou frontend.

Docker Desktop deve estar aberto. Confira com:

```powershell
docker info
npm.cmd run local:status
```

## Teste automatico curto

```powershell
npm.cmd run test:tunnel:check
```

O comando:

1. inicia ou verifica PostgreSQL, backend e frontend locais;
2. cria um tunel HTTPS para `localhost:3000` e outro para `localhost:5173`;
3. recompila o frontend com a URL HTTPS temporaria da API;
4. configura no backend a URL publica usada em callbacks e o CORS para a interface temporaria;
5. testa `/health`, Swagger, interface web, CSP, uma rota protegida sem JWT e uma instalacao
   Bitrix sem payload;
6. grava um relatorio sem segredos em `.artifacts/cloudflare-tunnel.json`;
7. encerra os tuneis e restaura automaticamente as URLs `localhost`.

O retorno `401` da rota protegida e o `400` da instalacao vazia sao resultados esperados: eles
provam que o endpoint esta acessivel pela internet, mas continua rejeitando chamadas sem
autenticacao ou sem o payload assinado pelo Bitrix.

## Manter o tunel aberto para teste manual

```powershell
npm.cmd run test:tunnel
```

Depois das validacoes, o terminal mostra:

```text
Frontend: https://...trycloudflare.com
URL da aplicacao Bitrix: https://...trycloudflare.com/integrations/bitrix/launch
URL de instalacao Bitrix: https://...trycloudflare.com/integrations/bitrix/install
```

Mantenha o terminal aberto. Para encerrar, pressione `Ctrl+C`; o script fecha os tuneis e
reconstroi os containers com `http://localhost:3000` e `http://localhost:5173`.

Se for testar a instalacao pelo Bitrix24, copie as duas URLs exibidas para o cadastro do
aplicativo apenas enquanto esse processo estiver aberto. Como as URLs mudam a cada inicio, nao
as grave no `.env`, no Git nem no Render. O portal deve usar os escopos `user_basic`,
`department` e `im`, e `BITRIX_CLIENT_ID`/`BITRIX_CLIENT_SECRET` precisam
estar preenchidos localmente.

## O que fica publico

Durante a execucao, qualquer pessoa que descubra a URL aleatoria consegue chegar ao frontend,
`/health`, `/docs` e aos callbacks que por natureza precisam ser publicos. As APIs operacionais
continuam exigindo JWT; callbacks Bitrix validam instalacao, dominio, `member_id` e
`application_token`. Ainda assim, use somente CPF, nomes e equipamentos sinteticos e encerre o
tunel logo apos o teste.

O modo local usa PostgreSQL e armazenamento locais por meio de `docker-compose.local.yml`; ele
nao altera dados do Supabase de homologacao. O teste com Supabase e assinatura real pertence ao
passo ponta a ponta posterior.

## Solucao de problemas

- Se o Wrangler pedir para baixar `cloudflared`, confirme; isso ocorre apenas na primeira vez.
- Se uma URL nao abrir imediatamente, aguarde alguns segundos pela propagacao DNS.
- Se o tunel nao conectar, verifique se Cloudflare WARP, VPN ou firewall bloqueia a conexao de
  saida.
- Se o processo for fechado a forca e nao restaurar localhost, execute
  `npm.cmd run local:up`.
- Para acompanhar a aplicacao, abra outro PowerShell e execute `npm.cmd run local:logs`.
