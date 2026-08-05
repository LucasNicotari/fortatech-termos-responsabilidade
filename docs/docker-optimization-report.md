# Relatorio de otimizacao Docker

Data da revisão: 27/07/2026.

## Resumo executivo

O roteiro recebido e uma boa lista de verificacao, mas as metas de 550 a 700 MB nao sao
compativeis com a arquitetura atual sem retirar o LibreOffice, separar as migrations ou criar
mais um servico. O projeto precisa converter o DOCX oficial com fidelidade e o ambiente Render
atual precisa conseguir aplicar migrations sem depender de uma infraestrutura de CI/CD ainda
nao configurada.

A imagem original observada no Docker Desktop tinha 1,55 GB. A variante agressiva chegou a
973 MB, mas removia manualmente conteúdo interno do LibreOffice e misturava famílias Debian.
Esses pontos foram rejeitados. Depois de retirar artefatos WASM não usados, compartilhar por
link simbólico o engine Prisma já presente e remover símbolos do executável Node em uma etapa de
build isolada, a imagem segura ficou em 958 MB no `docker image ls`, preservando o LibreOffice e
as fontes necessárias ao documento oficial.

Tamanho da imagem, cache de build e memória em execução são medidas diferentes. Na auditoria
final, os três containers consumiram aproximadamente 117 MiB ociosos no total; a API ficou em
aproximadamente 65 MiB. Portanto, 958 MB de imagem não significam 958 MB de RAM.

## Baseline e resultado

| Medida | Baseline | Resultado seguro |
|---|---:|---:|
| Backend no Docker Desktop | 1,55 GB | 958 MB; conteúdo transferível 252 MB |
| Frontend | 74,8 MB | 74,3 MB |
| PostgreSQL 16 Alpine | — | aproximadamente 420 MB em disco |
| RAM ociosa da API | não medida | aproximadamente 65 MiB |
| RAM ociosa dos três containers | não medida | aproximadamente 117 MiB |
| `node_modules` do backend | 384 MB | aproximadamente 135 MB |
| `/usr/lib/libreoffice` | 197 a 208 MB | 197 MB |
| Camada do sistema, LibreOffice e fontes | 358 MB na base anterior | 370 MB |
| Codigo compilado `dist` | cerca de 2 MB | cerca de 2 MB |
| Contexto no build limpo | variava conforme o cache | backend 8,1 KB; frontend 249 KB |
| Cache de build na auditoria | — | 5,705 GB; 1,746 GB recuperáveis naquele momento |

O valor de 370 MB e uma camada completa e inclui bibliotecas do sistema, certificados,
OpenSSL, `tini`, LibreOffice e fontes. Ele nao deve ser comparado diretamente apenas com o
diretorio `/usr/lib/libreoffice`. Os valores de cache são voláteis e não fazem parte da imagem
publicada nem da RAM do container.

## Principais causas do tamanho

1. LibreOffice Writer e bibliotecas necessarias para importar DOCX e exportar PDF.
2. Executavel oficial do Node.js 22, com aproximadamente 125 MB descompactado.
3. Dependências de produção, Prisma Client e ferramentas de migration, com aproximadamente
   164 MB na medição atual.
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
| Apagar `.d.ts`, source maps e documentação de pacotes no runtime | Baixo risco | Aplicada; testes de runtime aprovados |
| Apagar o engine Prisma usado no startup | Contraproducente | Revertida; `migrate deploy` o baixava novamente |
| Rotação de logs e limite de PIDs | Segura | Aplicada no Compose |
| Limite rígido de memória sem teste de carga | Arriscada | Adiada até medir pico de DOCX/PDF |
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

Runtimes WASM de outros bancos, o gerador de Prisma Client, TypeScript, fontes TypeScript do
pacote Effect, mapas e declarações de tipos não entram no runtime. O engine necessário ao Prisma
foi preservado na imagem: quando ele era apagado, `prisma migrate deploy` recriava cerca de 17 MB
em `node_modules` e outra cópia no cache do usuário, aumentando a camada gravável do container.
Preservá-lo torna o startup determinístico e evita rede/download oculto.

Quando houver CI/CD privado confiavel, `prisma` pode migrar para `devDependencies` e a migration
pode ser executada antes do deploy. Esse e o proximo ganho seguro, mas nao deve ser feito antes
da infraestrutura existir.

## Seguranca e operacao

- Processo principal executa como `node`, UID/GID 1000.
- PID 1 e `tini`; o processo Node recebe sinais corretamente.
- A imagem possui healthcheck HTTP sem instalar `curl`.
- Portas locais são publicadas apenas em `127.0.0.1`.
- Logs `json-file` giram em arquivos limitados e cada serviço possui `pids_limit`.
- `.env`, Git, caches, dependencias locais, builds, cobertura, backups e artefatos nao entram no
  contexto Docker.
- Licencas das dependencias permanecem na imagem.
- `npm audit --omit=dev` encontrou zero vulnerabilidades de producao.
- As auditorias atuais dos pacotes raiz, backend e frontend encontraram zero vulnerabilidades nas
  dependencias de producao.

## Conversoes concorrentes

Cada conversão cria diretório temporário e `UserInstallation` exclusivo. Além disso, uma fila
impede que prévias simultâneas criem processos LibreOffice sem limite:

- `PDF_CONVERSION_CONCURRENCY=1`;
- `PDF_CONVERSION_QUEUE_LIMIT=20`;
- `PDF_CONVERSION_QUEUE_TIMEOUT_MS=30000`.

Os valores podem ser ajustados dentro dos limites validados, mas devem ser alterados somente após
teste de carga e observação do pico de memória.

## Limpeza segura do cache

```powershell
npm.cmd run local:clean-cache
```

O modo padrão remove cache de build com mais de 24 horas e imagens intermediárias soltas. Ele
preserva imagens ainda referenciadas, containers, volumes, banco e PDFs.

```powershell
npm.cmd run local:clean-cache:all
```

O modo `:all` executa limpeza global de todo cache e de imagens sem uso. Ele pode afetar o cache
de outros projetos da máquina e, por isso, deve ser usado conscientemente. Nenhum dos comandos
remove volumes.

## Validacoes executadas

- Baseline desta revisão: 14 suítes e 77 testes unitários aprovados.
- Lint e compilacao Nest aprovados.
- Treze migrations reconhecidas.
- Banco com 18 tabelas `app_*` e RLS habilitado.
- Backend inicializado sem instalacao ou compilacao no startup.
- Duas conversões DOCX para PDF solicitadas em paralelo e serializadas pelo limite padrão.
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
5. Adotar outbox/fila distribuída antes da escala horizontal: necessária para coordenar
   conversão, envio, expiração, sincronização e Drive entre réplicas.

Conclusao: a configuracao final prioriza fidelidade, seguranca e capacidade de deploy. Forcar a
meta de 550 a 700 MB agora exigiria uma mudanca arquitetural, nao apenas limpeza de Dockerfile.

## Auditoria complementar de arquivos - 05/08/2026

Esta revisao separa tres medidas que costumam ser confundidas: espaco em disco na maquina de
desenvolvimento, tamanho das imagens publicadas e memoria RAM usada pelos processos. Excluir um
arquivo local pode liberar disco sem alterar a RAM do backend no Render ou no Docker.

### Medicoes atuais

| Item | Tamanho aproximado | Natureza | Decisao recomendada |
|---|---:|---|---|
| Cache de build do Docker | 3,352 GB | Regeneravel e compartilhado entre projetos | Limpar com o comando seguro depois de 24 h; usar `:all` apenas quando precisar recuperar espaco imediatamente |
| `node_modules` do backend | 480,6 MB | Dependencias locais de desenvolvimento | Manter durante o desenvolvimento; pode ser recriado com `npm ci` |
| `node_modules` da raiz | 165,6 MB | Wrangler usado pelo tunel HTTPS de teste | Manter se o teste remoto for utilizado; pode ser recriado com `npm ci` |
| `node_modules` do frontend | 128,4 MB | Dependencias locais de desenvolvimento | Manter durante o desenvolvimento; pode ser recriado com `npm ci` |
| `.artifacts` | 127,6 MB | Capturas, perfis e evidencias de testes | Pode ser removido depois que as evidencias nao forem mais necessarias |
| `backend/dist` | 1,15 MB | Build regeneravel | Pode ser removido e recriado por `npm run build` |
| `frontend/dist` | 0,46 MB | Build regeneravel | Pode ser removido e recriado por `npm run build` |
| Volumes Docker | 75 MB | Banco e arquivos persistentes | Preservar; nao sao cache |

Os maiores grupos dentro de `.artifacts` sao `pdfinspect` (70,2 MB), `ui-review` (25,1 MB),
`ui-review-final` (19,1 MB), `chrome-html-profile` (5,4 MB) e `chrome-profile` (5,4 MB).
Eles nao entram nas imagens porque estao cobertos pelo `.dockerignore`.

Uma limpeza apenas de artefatos e builds locais recuperaria cerca de 129 MB. Incluindo as tres
pastas `node_modules`, o total local recuperavel seria de aproximadamente 904 MB, ao custo de
reinstalar dependencias. Somado ao cache atual do Docker, o potencial chega a cerca de 4,25 GB.
Esse ganho e de disco local, nao de memoria RAM em producao.

### Arquivos e componentes que devem permanecer

- `templates/term.docx` e `templates/original/term-original.docx`: o primeiro e usado na geracao;
  o segundo e a fonte juridica imutavel para auditoria e reproducao.
- `backend/prisma/migrations`, schema e Prisma CLI: o startup atual do Render executa migrations
  e seed antes da API; retirar isso agora pode impedir um deploy seguro.
- LibreOffice Writer e fontes do container: necessarios para preservar o layout do documento.
- Volumes Docker: guardam dados reais e nao participam do cache de build.
- Integracao legada ZapSign: ainda atende simulacao local, sincronizacao e historico; sua retirada
  exige uma migracao funcional, nao uma simples limpeza de arquivos.
- Documentacao de arquitetura, operacao e homologacao: ocupa pouco espaco e reduz risco operacional.
- Wrangler na raiz: mantem o comando `test:tunnel` reproduzivel; e opcional apenas se esse fluxo
  de teste for formalmente abandonado.

### Otimizacoes aprovadas e proximos limites

- O frontend publicado como site estatico nao mantem um processo Node nem consome a RAM de uma
  instancia de servidor no Render.
- A API ja limita a conversao para um processo LibreOffice por vez, que e a protecao mais
  importante contra pico de memoria no plano atual.
- Nao foi aplicado limite artificial de heap do Node. Um valor baixo poderia fazer a API encerrar
  durante a conversao; essa mudanca depende de teste de carga medindo o pico real.
- A imagem do backend so tera uma reducao material adicional quando migrations puderem ser
  executadas por um pipeline anterior ao startup, permitindo retirar o Prisma CLI do runtime.
- A lista de termos ja carrega paginas de 30 registros e as telas sao divididas em chunks. Reduzir
  o cache do navegador agora traria ganho pequeno e pioraria a navegacao de retorno.

Nenhum arquivo persistente foi excluido nesta auditoria. A recomendacao e executar primeiro
`npm.cmd run local:clean-cache` e remover `.artifacts` somente depois da confirmacao de que as
evidencias visuais e os PDFs de teste nao serao mais usados.
