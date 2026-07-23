# Runbook de homologacao e implantacao

Este procedimento conecta o FortaDocs ao portal `fortaeqt.bitrix24.com.br`. Use CPF e equipamentos
sinteticos durante a homologacao.

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

Nao use `prisma migrate reset`. Confirme:

- migration `20260723170000_internal_bitrix_signing` aplicada;
- RLS nas duas tabelas novas;
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
```

Depois de incluir `placement`, clique em **Salvar** e **Reinstalar**. A reinstalacao e obrigatoria
porque o token OAuth anterior nao ganha novos escopos automaticamente.

O backend registra `OnAppInstall`, `OnAppUninstall` e o manipulador `REST_APP_URI`.

## 5. Teste controlado

Destino autorizado: `lucas.nicotari@fortatech.com.br`.

1. Abra o FortaDocs pelo menu do Bitrix24 como operador.
2. Selecione Lucas como colaborador.
3. Use CPF sintetico e ao menos dois equipamentos `HML-TESTE`.
4. Escolha livremente as pessoas notificadas.
5. Gere a previa e confira todas as paginas.
6. Clique em **Enviar pelo chat** uma unica vez.
7. Confira a mensagem no chat pessoal de Lucas.
8. Clique no link e confirme que a tela abre dentro do Bitrix24.
9. Teste uma forma de assinatura: digitar, desenhar ou importar imagem.
10. Marque a confirmacao de leitura e finalize.
11. Confira o estado `FINISHED` no painel Termos.
12. Baixe o PDF final e confira a assinatura incorporada.
13. Confirme que todos os selecionados receberam notificacao de conclusao.
14. Confirme `ARCHIVED`, tamanho e SHA-256 no banco.

## 6. Testes negativos

- encaminhar o link a outro usuario deve negar acesso;
- abrir um token alterado deve negar acesso;
- repetir o mesmo codigo de abertura deve falhar;
- concluir duas vezes nao deve criar dois PDFs;
- imagem acima de 1 MB ou arquivo nao PNG/JPG deve ser recusado;
- sessao do signatario nao deve acessar APIs administrativas;
- acesso direto ao frontend sem abertura Bitrix24 nao deve criar sessao.

## 7. Evidencias de liberacao

- commit e deploy identificados;
- `/health` e frontend em HTTP 200;
- sete migrations aplicadas;
- 51 testes automatizados aprovados;
- lint e builds aprovados;
- escopos `im` e `placement` validados;
- envio ao chat e abertura `REST_APP_URI` comprovados;
- PDF final privado, assinado e com hashes;
- notificacoes por termo comprovadas.

## 8. Producao

Antes de liberar dados reais:

- trocar o backend gratuito por instancia que nao suspenda;
- criar Supabase, Render e aplicativo Bitrix separados;
- usar segredos novos;
- aprovar juridicamente o termo;
- documentar retencao, backup, restauracao e resposta a incidente;
- executar novamente este roteiro com grupo controlado.
