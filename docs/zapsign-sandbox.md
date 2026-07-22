# ZapSign Sandbox

O Sandbox é o provedor de assinatura da homologação. Ele envia o e-mail ao único signatário, autentica por token e permite a assinatura desenhada. Documentos desse ambiente não têm validade de produção.

## Credenciais

1. acesse `https://sandbox.app.zapsign.com.br/acesso/entrar`;
2. abra **Configurações > Integrações > API ZapSign**;
3. copie o API Token diretamente para `ZAPSIGN_API_TOKEN` no Render;
4. gere um valor aleatório forte, com ao menos 32 caracteres, para `ZAPSIGN_WEBHOOK_SECRET`.

```dotenv
SIGNATURE_PROVIDER="zapsign"
ZAPSIGN_API_URL="https://sandbox.api.zapsign.com.br/api/v1"
ZAPSIGN_API_TOKEN="segredo-do-painel"
ZAPSIGN_WEBHOOK_SECRET="segredo-aleatorio-forte"
```

Aspas são aceitas por leitores `.env`, mas no painel Render insira apenas o valor. Nunca envie os segredos ao chat, Git, frontend ou logs.

## Webhook permanente

Configure dois eventos no painel da ZapSign:

```text
URL: https://fortatech-termos-api-hml.onrender.com/integrations/zapsign/events
Eventos: doc_signed e doc_refused
Header: Authorization
Valor: Bearer <mesmo ZAPSIGN_WEBHOOK_SECRET>
```

O endpoint rejeita requisições sem o Bearer correto. Cada evento recebe uma chave idempotente; uma repetição retorna sucesso sem repetir arquivamento ou notificação.

## Dados enviados

Ao confirmar o envio, o backend envia:

- PDF revisado;
- nome, e-mail e CPF do colaborador selecionado;
- exatamente um signatário;
- `auth_mode=assinaturaTela-tokenEmail`;
- nome e e-mail bloqueados para edição;
- e-mail automático habilitado;
- observadores configurados, limitados a 20;
- identificador interno do termo para correlação.

O colaborador recebe o link, confirma o token do e-mail e desenha a assinatura. Operadores e notificados não assinam o documento.

## Conclusão

No evento `doc_signed`, o backend:

1. consulta novamente o documento na API;
2. baixa o link temporário do PDF concluído;
3. verifica se o arquivo é PDF e respeita o limite de tamanho;
4. calcula SHA-256;
5. salva em `signed/<ano>/<bitrix-id>/<request-id>-<sha256>.pdf`;
6. marca o arquivo como `ARCHIVED`;
7. notifica os usuários selecionados no Bitrix24.

Se o webhook falhar, a tela de termos oferece sincronização/reprocessamento. A ZapSign também permite reenviar webhooks pelo painel.

## Produção

Trocar o endpoint Sandbox pelo endpoint de produção não é suficiente. Produção requer conta/plano aprovado, novo token, novo segredo de webhook, template sem a marca de homologação, aprovação jurídica e teste controlado separado.
