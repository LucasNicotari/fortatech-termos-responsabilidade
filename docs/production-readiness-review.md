# Revisao completa de produto e producao

## Objetivo

Este processo mantem o FortaDocs como uma aplicacao incorporada ao Bitrix24 e revisa cinco
dimensoes antes de cada liberacao:

1. disponibilidade e recuperacao de falhas;
2. desempenho do backend, banco, conversao e frontend;
3. seguranca, identidade e evidencia documental;
4. ergonomia dos fluxos de operador e signatario;
5. capacidade de evolucao sem misturar o termo com um futuro inventario.

O baseline de 30/07/2026 possui 16 suites e 82 testes aprovados, lint e builds de backend e
frontend aprovados. As melhorias desta revisao adicionaram testes de sessao e health check.

## Referencias de produto

Foram comparados fluxos atuais de plataformas de assinatura:

- PandaDoc concentra status, destinatario, lembrete e atividade em uma pagina de resumo:
  <https://support.pandadoc.com/en/articles/14838327-document-summary-page>
- PandaDoc expoe uma trilha cronologica de mudancas do documento:
  <https://support.pandadoc.com/en/articles/15030616-review-audit-trail-for-sent-documents-classic-experience>
- Dropbox Sign oferece lembrete para solicitacoes pendentes:
  <https://faq.hellosign.com/hc/en-gb/articles/212038267-How-to-send-a-reminder-or-fresh-signature-link>
- Dropbox Sign entrega PDF e trilha de auditoria ao concluir:
  <https://faq.hellosign.com/hc/en-us/articles/206521067-Can-I-use-Dropbox-Sign-for-free>

O FortaDocs ja possui os fundamentos corretos: criacao orientada por etapas, previa, status
explicitos, detalhes do termo, eventos, hashes, arquivo privado e Drive. A evolucao de produto
deve priorizar lembretes, expiracao operacional, resumo pos-envio e exportacao da trilha, sem
recriar um editor documental generico.

## Processo de revisao

### 1. Disponibilidade

- Verificar `/health/live` sem depender de servicos externos.
- Verificar `/health/ready` com conexao real ao banco.
- Confirmar encerramento por `SIGTERM` e desconexao do Prisma.
- Medir tempo de abertura fria e quente pelo Bitrix24.
- Confirmar renovacao OAuth e recuperacao de JWT expirado.
- Simular indisponibilidade do Bitrix, Supabase Storage e Drive separadamente.
- Manter migrations fora do startup quando houver pre-deploy confiavel.

### 2. Desempenho

- Medir p50, p95 e p99 de abertura, listagem, previa, assinatura e arquivamento.
- Acompanhar conexoes do Prisma/Supavisor e consultas lentas.
- Validar tamanho dos bundles e cache imutavel dos assets com hash.
- Testar a fila do LibreOffice nos limites configurados.
- Evitar refetch por foco do iframe e repetir apenas GETs com falha transitoria.
- Paginar qualquer listagem que possa crescer.

### 3. Seguranca e evidencia

- Revalidar o usuario ativo ao restaurar uma sessao administrativa.
- Nunca dar acesso administrativo a um JWT de signatario.
- Manter Swagger desligado em producao, salvo liberacao explicita.
- Preservar PDF, SHA-256, eventos e vinculo ao ID Bitrix24.
- Testar encaminhamento de convite, token alterado, codigo repetido e assinatura dupla.
- Revisar acessos, retencao, backup e restauracao antes de producao.

### 4. Experiencia incorporada

- Toda entrada administrativa deve acontecer pelo menu do Bitrix24.
- Uma sessao expirada deve oferecer reconexao pelo Bitrix, sem pedir outra senha.
- Operacoes longas precisam de estado de progresso e mensagem acionavel.
- A lista de termos deve continuar densa, filtravel e utilizavel em telas pequenas.
- A tela do signatario deve permanecer isolada e focada em ler, concordar e assinar.

### 5. Liberacao

Executar testes, lint, builds, fluxo local ponta a ponta, teste controlado no Bitrix24,
verificacao do Drive e observacao de logs. Uma liberacao falha se health, migracao, assinatura,
hash ou arquivamento nao forem confirmados.

## Melhorias aplicadas nesta revisao

- timeout global de 25 segundos no cliente HTTP;
- retry limitado a consultas com falha de rede ou servidor;
- refetch por foco do iframe desativado;
- sessao administrativa restaurada somente depois de revalidar `/auth/me`;
- reconexao pelo manipulador OAuth do Bitrix24 quando a sessao expira;
- desligamento gracioso do Nest e do Prisma;
- health checks separados para liveness e readiness;
- Swagger desativado por padrao em producao;
- cache anual para assets versionados e gzip no Nginx;
- endpoint geral `/bitrix/employees`, mantendo o endereco antigo compativel;
- health check de deploy apontado para `/health/ready`.

## Auditoria de dependencias

`npm audit --omit=dev` encontrou zero vulnerabilidades conhecidas no backend e na raiz. As
dependencias compativeis do frontend foram atualizadas. O audit do frontend ainda classifica o
React Router 7.18.2 por um advisory restrito a RSC/Server Actions. O FortaDocs usa somente
`BrowserRouter` em um SPA estatico, sem SSR, RSC, loaders ou actions de servidor; por isso o
vetor descrito nao esta exposto nesta arquitetura. Migrar para uma versao principal apenas para
silenciar o scanner foi rejeitado ate existir uma versao estavel e compativel.

As ocorrencias restantes do audit completo pertencem ao ESLint e suas dependencias de
desenvolvimento. Elas nao entram no bundle publicado nem processam entrada de usuario em
producao. Ambos os grupos devem ser reavaliados em cada atualizacao de dependencias.

## Limite de infraestrutura

O backend de homologacao permanece no plano gratuito do Render. Esse plano suspende o servico
apos inatividade e a proxima abertura pode levar cerca de um minuto. Nenhuma mudanca no React ou
Nest elimina esse comportamento. Para uso diario sem espera, o backend precisa de uma instancia
que nao suspenda; a mudanca de plano deve ser aprovada porque gera custo.

Referencias:

- <https://render.com/docs/free>
- <https://render.com/docs/health-checks>
- <https://render.com/docs/deploys>

Para o backend persistente, revisar se `DATABASE_URL` usa conexao direta ou Supavisor em modo de
sessao, deixando transaction mode para ambientes efemeros. Nao trocar a URL sem validar a
conectividade IPv4/IPv6 do ambiente:

- <https://supabase.com/docs/guides/database/connecting-to-postgres>
- <https://supabase.com/docs/guides/database/prisma>

## Abertura futura para inventario

O contrato compartilhado passa a ser o diretorio `/bitrix/employees`, sem nomenclatura presa ao
termo. Um futuro modulo de inventario devera reutilizar:

- autenticacao e ID do usuario Bitrix24;
- diretorio de colaboradores e departamentos;
- autorizacao, auditoria, Storage e Drive;
- componentes de busca e selecao de colaborador.

O inventario nao devera usar `app_send_request_equipment` como cadastro mestre. Essa tabela
continua sendo a fotografia imutavel do documento. Ativos, custodias e movimentacoes terao tabelas
proprias e poderao fornecer os itens que o termo fotografa. O ponto de entrada futuro no perfil
sera `USER_PROFILE_TOOLBAR`, ativado somente quando existir uma tela protegida e funcional.

## Backlog recomendado

### Prioridade operacional

- aprovar uma instancia do backend que nao suspenda;
- configurar monitor externo para frontend e `/health/ready`;
- configurar alertas para OAuth, falha de envio e falha de Drive;
- separar migrations do startup quando houver pre-deploy pago ou CI/CD confiavel;
- definir backup, restauracao e conta tecnica do Drive.

### Evolucao do produto

- lembrete manual e automatico para termos pendentes;
- expiracao visivel e job idempotente de reconciliacao;
- pagina de resumo do termo com linha do tempo completa;
- exportacao de trilha de auditoria;
- indicadores de tempo medio ate visualizacao e assinatura;
- testes de interface automatizados em desktop e mobile.

## Evidencias desta execucao

- 16 suites e 82 testes aprovados;
- lint e build Nest aprovados;
- lint e build Vite aprovados;
- imagens Docker reconstruidas;
- fluxo local completo aprovado;
- duas conversoes solicitadas em paralelo e serializadas;
- PDF final com 72.835 bytes e SHA-256 confirmado;
- remocao logica preservando o documento assinado.
