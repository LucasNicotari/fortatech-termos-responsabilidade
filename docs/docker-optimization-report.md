# Relatorio de otimizacao Docker

Data da validacao: 22/07/2026.

## Resumo executivo

O roteiro recebido e uma boa lista de verificacao, mas as metas de 550 a 700 MB nao sao
compativeis com a arquitetura atual sem retirar o LibreOffice, separar as migrations ou criar
mais um servico. O projeto precisa converter o DOCX oficial com fidelidade e o ambiente Render
atual precisa conseguir aplicar migrations sem depender de uma infraestrutura de CI/CD ainda
nao configurada.

A imagem original observada no Docker Desktop tinha 1,55 GB. A variante agressiva chegou a
973 MB, mas removia manualmente conteudo interno do LibreOffice e usava Node Bookworm sobre
Debian Trixie. Esses dois pontos foram rejeitados na revisao de seguranca. A imagem final segura
tem aproximadamente 1,01 GB no `docker image ls`, preserva integralmente o LibreOffice e inclui
as fontes metricamente compativeis com o modelo.

## Baseline e resultado

| Medida | Baseline | Resultado seguro |
|---|---:|---:|
| Backend no Docker Desktop | 1,55 GB | 1,01 GB |
| Frontend | 74,8 MB | 74,2 MB |
| `node_modules` do backend | 384 MB | 157 MB |
| `/usr/lib/libreoffice` | 197 a 208 MB | 197 MB |
| Camada do sistema, LibreOffice e fontes | 358 MB na base anterior | 370 MB |
| Codigo compilado `dist` | cerca de 2 MB | cerca de 2 MB |
| Contexto no build limpo | variava conforme o cache | backend 8,1 KB; frontend 249 KB |
| Cache apos limpeza | ate 20,25 GB durante as iteracoes | 346 MB ativos e 0 B recuperaveis |

O valor de 370 MB e uma camada completa e inclui bibliotecas do sistema, certificados,
OpenSSL, `tini`, LibreOffice e fontes. Ele nao deve ser comparado diretamente apenas com o
diretorio `/usr/lib/libreoffice`.

## Principais causas do tamanho

1. LibreOffice Writer e bibliotecas necessarias para importar DOCX e exportar PDF.
2. Executavel oficial do Node.js 22, com aproximadamente 125 MB descompactado.
3. Dependencias de producao, Prisma Client e ferramentas de migration, com 174 MB.
4. Debian Slim, bibliotecas criptograficas, fontes e certificados.

O frontend ja usa build multi-stage e entrega somente arquivos estaticos pelo Nginx. Alterar
essa imagem, que tem 74,8 MB, traria pouco ganho e risco desnecessario.

## Julgamento das recomendacoes

| Recomendacao | Julgamento | Decisao |
|---|---|---|
| Multi-stage para dependencias, build e runtime | Segura e necessaria | Aplicada |
| BuildKit cache para `npm ci` | Segura e util para velocidade | Aplicada; nao entra na imagem final |
| `npm ci --omit=dev` separado | Segura | Aplicada |
| Gerar Prisma Client no build | Obrigatoria | Aplicada |
| Remover TypeScript, testes e ferramentas de build do runtime | Segura | Aplicada |
| Remover Prisma CLI do runtime | Valida com ressalvas | Adiada; o Render gratuito ainda aplica migrations na inicializacao |
| Migration em servico separado | Boa quando houver CI/CD | Adiada; criaria outra imagem e duas estrategias de deploy |
| Usar `libreoffice-writer-nogui` | Segura e necessaria | Aplicada |
| Remover arquivos internos de `/usr/lib/libreoffice` | Arriscada | Revertida; a instalacao foi preservada integralmente |
| Trocar LibreOffice por conversor menor | Incompativel | Rejeitada por risco de alterar o PDF |
| Manter somente fontes realmente necessarias | Correta | Aplicada com Liberation, Carlito e Caladea |
| Instalar `fonts-liberation-sans-narrow` | Inaplicavel no Bookworm | Pacote nao existe nessa distribuicao |
| Executar como usuario nao-root | Segura e importante | Aplicada com UID/GID 1000 |
| Usar `tini` e preservar sinais | Segura e importante | Aplicada |
| Perfil LibreOffice exclusivo por conversao | Necessaria para concorrencia | Aplicada e testada |
| Apagar arquivos `LICENSE` de pacotes | Risco de conformidade | Revertida; licencas permanecem |
| Apagar `.d.ts`, source maps e documentacao de pacotes no runtime | Baixo risco | Aplicada; testes de runtime aprovados |
| Alpine no backend | Alto custo para LibreOffice | Rejeitada; a tentativa anterior ficou maior |
| Meta de 550 a 700 MB | Irrealista na arquitetura atual | Nao perseguida em detrimento da qualidade |

## Node e imagem-base

O build usa `node:22-bookworm-slim`. O runtime usa `debian:bookworm-slim` e recebe somente o
executavel `/usr/local/bin/node` da imagem oficial Node. As duas etapas usam a mesma familia
Debian Bookworm, evitando a incompatibilidade de ABI que existia na variante Trixie. A versao
principal do Node foi mantida e validada como v22.23.1.

Usar a imagem Node completa no runtime tambem seria valido, mas recolocaria npm, yarn e outras
camadas que nao sao necessarias para iniciar a API. A copia do executavel oficial sobre a mesma
base Debian e o melhor equilibrio atual entre suporte e tamanho.

## Fontes e fidelidade do documento

Os XMLs internos de `templates/term.docx` declaram Calibri, Segoe UI, Arial Narrow e Times New
Roman. Foram mantidas/adicionadas:

- Carlito, metricamente compativel com Calibri;
- Caladea, metricamente compativel com Cambria e adequada como fallback serifado;
- Liberation Sans e Liberation Serif, compativeis com Arial e Times New Roman.

Segoe UI e Arial Narrow nao possuem pacote oficial equivalente no repositorio Bookworm usado.
Adicionar fontes Microsoft sem revisar licenca e distribuicao da imagem foi rejeitado. O PDF
real gerado manteve quatro paginas A4, 595 x 842 pontos, sem rotacao.

## Prisma e migrations

`prisma generate` ocorre somente no build. O runtime conserva a parte do Prisma CLI necessaria
para `migrate deploy`, pois:

- o deploy atual no Render nao possui um job de migration separado confirmado;
- remover a CLI antes disso poderia publicar codigo antes do schema correspondente;
- um servico Docker de migration criaria outra imagem e nao resolveria sozinho o Render.

Foram removidos do runtime motores de consulta duplicados, runtimes WASM para outros bancos,
o gerador de Prisma Client, TypeScript, fontes TypeScript do pacote Effect, mapas e declaracoes
de tipos. `prisma migrate deploy` e `prisma migrate status` continuaram funcionando.

Quando houver CI/CD privado confiavel, `prisma` pode migrar para `devDependencies` e a migration
pode ser executada antes do deploy. Esse e o proximo ganho seguro, mas nao deve ser feito antes
da infraestrutura existir.

## Seguranca e operacao

- Processo principal executa como `node`, UID/GID 1000.
- PID 1 e `tini`; o processo Node recebe sinais corretamente.
- A imagem possui healthcheck HTTP sem instalar `curl`.
- `.env`, Git, caches, dependencias locais, builds, cobertura, backups e artefatos nao entram no
  contexto Docker.
- Licencas das dependencias permanecem na imagem.
- `npm audit --omit=dev` encontrou zero vulnerabilidades de producao.
- As auditorias atuais dos pacotes raiz, backend e frontend encontraram zero vulnerabilidades nas
  dependencias de producao.

## Conversoes concorrentes

Cada conversao cria seu proprio diretorio temporario e agora passa ao LibreOffice um
`UserInstallation` exclusivo. Isso impede que duas requisicoes disputem o mesmo arquivo de
perfil e evita travamentos intermitentes. O diretorio inteiro e removido no bloco `finally`.

## Validacoes executadas

- 12 suites e 45 testes unitarios aprovados.
- Lint e compilacao Nest aprovados.
- Seis migrations reconhecidas, incluindo a limpeza de estruturas redundantes.
- Banco local atualizado com 16 tabelas `app_*` e RLS habilitado.
- Backend inicializado sem instalacao ou compilacao no startup.
- Duas conversoes DOCX para PDF disparadas em paralelo.
- Fluxo local completo: rascunho, PDF, envio, assinatura, arquivo e SHA-256.
- PDF final valido, com quatro paginas A4 e sem rotacao.
- Reinicio do backend preservou 22 arquivos no volume local.
- Healthcheck retornou HTTP 200 depois do reinicio.
- Container confirmado como UID 1000 com `tini` no PID 1.

## Alternativas futuras

1. Separar `prisma migrate deploy` em CI/CD: ganho estimado relevante, baixo risco somente depois
   que o pipeline estiver disponivel e for obrigatorio antes do deploy.
2. Executar conversao em servico dedicado: reduz a imagem da API, mas nao o armazenamento total;
   adiciona rede, observabilidade, memoria e mais um ponto de falha. Nao recomendado agora.
3. Usar um servico externo de conversao: pode reduzir a imagem, mas envia documentos pessoais a
   outro processador e exige revisao de seguranca/LGPD. Nao recomendado neste momento.
4. Retirar LibreOffice: seria o maior ganho, mas compromete o requisito de fidelidade do DOCX.
   Rejeitado.

Conclusao: a configuracao final prioriza fidelidade, seguranca e capacidade de deploy. Forcar a
meta de 550 a 700 MB agora exigiria uma mudanca arquitetural, nao apenas limpeza de Dockerfile.
