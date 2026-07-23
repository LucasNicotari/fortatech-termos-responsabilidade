# Desenvolvimento totalmente local

Este modo permite testar o aplicativo no navegador da propria maquina, sem abrir o Bitrix24,
sem Cloudflare Tunnel e sem reinstalar o aplicativo local.

## Iniciar

Com o Docker Desktop aberto, execute na raiz do projeto:

```powershell
npm.cmd run dev:local
```

Quando a validacao terminar, abra:

- Aplicacao: `http://localhost:5173`
- Documentacao da API: `http://localhost:3000/docs`

O comando inicia PostgreSQL, backend e frontend com Docker Compose, aguarda os servicos
responderem e testa automaticamente o login, os colaboradores e o simulador de assinatura.

O comando diario apenas inicia as imagens existentes, evitando acumular varios gigabytes de
cache. Quando houver alteracao no codigo, reconstrua uma vez com `npm.cmd run dev:local:build`.

## O que e simulado

- O login acontece automaticamente como administrador local.
- O Bitrix24 e substituido por usuarios e departamentos sinteticos ativos.
- As notificacoes sao aceitas localmente, mas nao sao entregues a ninguem.
- O chat e a assinatura do Bitrix24 sao substituidos por um provedor local; nenhuma mensagem ou
  e-mail real e enviado.
- Os PDFs ficam no volume local do Docker, e nao no Supabase.

Essas simulacoes sao ativadas apenas pelas variaveis do arquivo `docker-compose.local.yml`.
O modo real continua separado e nao foi removido.

## Testar um termo completo

1. Abra **Novo termo** e selecione um colaborador de teste.
2. Informe um CPF sintetico valido e adicione pelo menos um equipamento.
3. Salve o rascunho e gere a previa em PDF.
4. Clique para enviar. O envio sera registrado, mas nenhum e-mail sairá da maquina.
5. Use o link **Abrir simulacao do colaborador** exibido no proprio formulario (ele tambem fica em
   **Termos**).
6. Revise o PDF e escolha a mesma experiencia da producao: desenhar, digitar ou importar uma
   imagem PNG/JPG.
7. O sistema aplicara o autografo ao PDF, arquivara a copia local e liberara o download.

## Comandos uteis

```powershell
npm.cmd run test:local
npm.cmd run local:status
npm.cmd run local:logs
npm.cmd run local:down
npm.cmd run local:disk
npm.cmd run local:clean-cache
```

`test:local` tambem sobe o ambiente e executa automaticamente um termo sintetico completo:
rascunho, previa PDF, envio, assinatura, arquivamento, download e comparacao SHA-256.
`local:down` encerra os containers, mas preserva o banco e os arquivos locais para o proximo uso.
`local:clean-cache` remove somente caches de compilacao e imagens soltas do Docker; os volumes
com banco e documentos nao sao removidos.

O Cloudflare Tunnel e a instalacao no Bitrix24 passam a ser necessarios somente quando o
objetivo for testar a integracao real, e nao durante o desenvolvimento diario.

## Uso de disco e memoria

A imagem final do backend usa Debian minimo, apenas o executavel do Node.js 22 e o
LibreOffice Writer sem interface grafica. Dependencias de compilacao, motores duplicados do
Prisma, suporte WASM para outros bancos, TypeScript, mapas de codigo e documentacao de pacotes
nao sao copiados para a imagem de producao.

O LibreOffice permanece porque ele preserva o layout do DOCX oficial durante a conversao para
PDF. Troca-lo por um conversor menor reduziria a imagem, mas poderia alterar tabelas, fontes,
quebras de pagina e posicionamento dos campos.

Depois de reconstruir imagens, execute `npm.cmd run local:clean-cache`. O comando mantem os
containers, o PostgreSQL e os PDFs e remove apenas camadas de compilacao e imagens sem uso.
