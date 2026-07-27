# Runbook de homologacao e implantacao

Este procedimento conecta o FortaDocs ao portal de homologação. Use conta controlada, CPF
sintético válido e equipamentos fictícios. Não use dados pessoais reais para comprovar o fluxo.

## 1. Verificacoes locais

```powershell
npm.cmd run test:local
cd backend
npm.cmd run lint
npm.cmd test -- --runInBand
npm.cmd run build
cd ..\frontend
npm.cmd run lint
npm.cmd run build
```

## 2. Banco e Storage

No backend:

```powershell
npm.cmd run prisma:deploy
npx.cmd prisma migrate status
```

Não use `prisma migrate reset`. Confirme:

- as 13 migrations aplicadas, incluindo `20260723230000_paginated_term_history`;
- 18 tabelas `app_*` e RLS habilitado em todas;
- nenhum `GRANT` de tabela para `anon` ou `authenticated`;
- bucket `responsibility-terms` privado;
- limite de 20 MB e MIME de PDF/DOCX.

## 3. Render

Backend: `https://fortatech-termos-api-hml.onrender.com`

Frontend: `https://fortatech-termos-web-hml.onrender.com`

Variaveis obrigatorias do backend:

```text
DATABASE_URL
DIRECT_URL
SUPABASE_URL
SUPABASE_SECRET_KEY
JWT_SECRET
BITRIX_TOKEN_ENCRYPTION_KEY
BITRIX_CLIENT_ID
BITRIX_CLIENT_SECRET
BITRIX_PORTAL_ORIGIN
PUBLIC_BACKEND_URL
FRONTEND_URL
CORS_ORIGINS
RESPONSIBILITY_TEMPLATE_PATH
BITRIX_DRIVE_OWNER_USER_ID
BITRIX_DRIVE_FOLDER_NAME
PDF_CONVERSION_CONCURRENCY
PDF_CONVERSION_QUEUE_LIMIT
PDF_CONVERSION_QUEUE_TIMEOUT_MS
```

Os valores ficam no painel, nunca no Git ou em capturas de tela.

## 4. Aplicativo local Bitrix24

Tipo: **Servidor**.

```text
Seu caminho do manipulador:
https://fortatech-termos-api-hml.onrender.com/integrations/bitrix/launch

Caminho de instalacao inicial:
https://fortatech-termos-api-hml.onrender.com/integrations/bitrix/install
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

`crm` e `sign.b2e` não fazem parte do fluxo atual; servem apenas à compatibilidade histórica com
Bitrix Sign B2E. Depois de alterar qualquer escopo, clique em **Salvar** e **Reinstalar**. A reinstalação é obrigatória
porque o token OAuth anterior nao ganha novos escopos automaticamente.

O backend registra `OnAppInstall`, `OnAppUninstall` e o manipulador `REST_APP_URI`.

### Abertura sem contexto OAuth

O Bitrix24 pode chamar o manipulador primeiro somente com `DOMAIN`, `PROTOCOL`, `LANG` e
`APP_SID`. Isso não é uma sessão autenticada. O backend responde com uma ponte HTML que carrega
o SDK `BX24`, solicita a autorização atual e faz um único POST autenticado. Se o portal ainda não
fornecer OAuth, o usuário recebe uma tela amigável para reabrir/reinstalar o aplicativo, nunca o
JSON interno `Contexto de abertura Bitrix24 incompleto`.

## 5. Teste controlado

Use uma conta Bitrix24 controlada que possa receber a mensagem e assinar.

1. Abra o FortaDocs pelo menu do Bitrix24 como operador.
2. Selecione a conta controlada como colaborador.
3. Use CPF sintetico e ao menos dois equipamentos `HML-TESTE`.
4. Escolha livremente as pessoas notificadas.
5. Gere a previa e confira todas as paginas.
6. Clique em **Enviar pelo chat** uma unica vez.
7. Confira a mensagem no chat pessoal da conta selecionada.
8. Confira também o alerta pessoal no sino do Bitrix24.
9. No autoenvio, use **Abrir minha assinatura** ou o mesmo link recebido no chat e confirme que
   a tela abre dentro do Bitrix24.
10. Teste uma forma de assinatura: digitar, desenhar ou importar imagem.
11. Marque a confirmacao de leitura e finalize.
12. Confira a sequência **Enviado → Visualizado → Assinado → Concluído** no painel Termos.
13. Baixe o PDF final e confira a assinatura incorporada.
14. Confirme que todos os selecionados receberam notificacao de conclusao.
15. Confirme `ARCHIVED`, tamanho e SHA-256 no banco.
16. Confirme o PDF na pasta indicada por `BITRIX_DRIVE_FOLDER_NAME`, dentro do Drive pessoal do
    owner configurado.
17. Marque dois rascunhos de teste com as caixas de seleção, use **Selecionar todos**, remova em
    lote e confirme que a lista mudou sem excluir auditoria.

## 6. Testes negativos

- encaminhar o link a outro usuario deve negar acesso;
- abrir um token alterado deve negar acesso;
- repetir o mesmo codigo de abertura deve falhar;
- concluir duas vezes nao deve criar dois PDFs;
- imagem acima de 1 MB ou arquivo nao PNG/JPG deve ser recusado;
- PNG com dimensões acima de 4096×2048 ou mais de quatro milhões de pixels deve ser recusado;
- sessao do signatario nao deve acessar APIs administrativas;
- acesso direto ao frontend sem abertura Bitrix24 nao deve criar sessao.
- termo `SIGNED` com Drive `PENDING` ou `FAILED` não deve aceitar remoção do histórico;
- usuário sem permissão de operador não deve criar, sincronizar ou remover termos.

## 7. Evidencias de liberacao

- commit e deploy identificados;
- `/health` e frontend em HTTP 200;
- 13 migrations aplicadas e 18 tabelas `app_*` conferidas;
- baseline desta revisão: 14 suítes e 77 testes automatizados aprovados;
- lint e builds aprovados;
- escopos `basic`, `user`, `user_basic`, `department`, `im`, `placement` e `disk` validados;
- envio ao chat e abertura `REST_APP_URI` comprovados;
- PDF final privado, assinado e com hashes;
- notificacoes por termo comprovadas;
- paginação por cursor, remoção lógica em lote e bloqueio de arquivamento pendente comprovados.

## 8. Producao

Antes de liberar dados reais:

- trocar o backend gratuito por instancia que nao suspenda;
- criar Supabase, Render e aplicativo Bitrix separados;
- usar segredos novos;
- aprovar juridicamente o termo;
- documentar retencao, backup, restauracao e resposta a incidente;
- substituir processamento em memória por outbox/fila e locks distribuídos antes de escalar
  horizontalmente;
- avaliar Drive empresarial ou conta técnica para eliminar o ponto único do Drive pessoal;
- executar novamente este roteiro com grupo controlado.
