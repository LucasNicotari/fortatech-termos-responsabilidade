# Fluxo Bitrix24

## Instalacao e autenticacao

O aplicativo usa OAuth de aplicacao local. Tokens de acesso e renovacao sao cifrados no banco; a abertura pelo menu gera um codigo de uso unico, com validade de dois minutos, trocado por uma sessao de uma hora. Na primeira abertura, o backend registra os eventos e a pagina chama `BX24.installFinish()`. O evento `OnAppInstall` completa a instalacao armazenando o hash do `application_token`; os demais eventos so sao aceitos depois dessa etapa.

O instalador e cadastrado como `ADMIN`. Outros usuarios Bitrix precisam ser autorizados localmente como `ADMIN`, `RH` ou `TI`.

Antes do primeiro envio, o administrador precisa informar a empresa CRM, provedor, representante, responsavel e confirmar que as permissoes do Cofre da empresa foram concedidas no Bitrix24.

## Documento e envio

O envio e manual e individual. A versao padrao do DOCX fica versionada no Supabase por caminho e SHA-256. Depois da previa, o PDF e congelado e enviado por `sign.b2e.document.send` com:

Na homologacao, a versao padrao e `0.9-hml` e possui marca visivel de ausencia de validade. A
versao `1.0` so deve ser criada depois da aprovacao formal registrada no checklist juridico.

- empresa do CRM;
- colaborador com papel `signer`;
- representante fixo com papel `assignee`;
- responsavel pelo documento;
- provedor de assinatura;
- tipo regional, padrao `12.999`;
- `externalId` igual ao ID interno da solicitacao.

O campo legado `bitrix_template_id` e o metodo `sign.document.create` nao sao mais usados.

## Eventos e sincronizacao

Na instalacao sao registrados:

- `OnSignB2eDocumentStatusChanged`;
- `OnSignB2eMemberStatusChanged`;
- `OnAppUninstall`.

Eventos sao validados pelo `member_id` e pelo hash do `application_token`, deduplicados e armazenados em `app_webhook_events`. O codigo original fica em `raw_status_code` e o aplicativo normaliza os estados operacionais.

## Backup

Quando a assinatura termina, o backend confirma o documento com `sign.b2e.document.get`, procura o nome exclusivo em `sign.b2e.mysafe.tail`, valida o cabecalho `%PDF`, calcula SHA-256 e envia o arquivo ao Supabase. Falha de backup nao reverte a assinatura e pode ser retentada.
