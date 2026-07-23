# Assinatura nativa do Bitrix24

## Decisão

Novos termos usam o **Bitrix24 e-Signature for HR**. A integração pública disponível para aplicativos locais é a API B2E (`sign.b2e`). A integração antiga da ZapSign permanece no código somente para consultar registros históricos e para a simulação local sem envio real.

O FortaDocs não grava nem reutiliza uma imagem da assinatura do representante. A API cria a solicitação, mas a assinatura continua sendo uma ação pessoal e auditável no Bitrix24.

## Configuração única

O aplicativo local precisa dos escopos:

```text
user_basic
department
im
crm
sign.b2e
```

Em **Configurações > Usuários e acessos > Assinatura Bitrix24**:

1. confirme a empresa `FORTA TECH` (`CRM 67539`);
2. confira o provedor localizado automaticamente pelo Bitrix24;
3. escolha o representante formalmente autorizado;
4. clique em **Salvar**.

Ao salvar, o backend registra, se ainda faltarem:

- `OnSignB2eDocumentStatusChanged`;
- `OnSignB2eMemberStatusChanged`.

O operador que clicar em **Enviar pelo Bitrix24** é informado como responsável pelo documento. O representante permanece fixo até que um administrador altere a configuração.

## Uso diário

1. Lucas, Osmar ou outro operador autorizado cria e revisa o termo no FortaDocs.
2. O botão **Enviar pelo Bitrix24** chama `sign.b2e.document.send`.
3. O representante recebe uma mensagem do HR bot e vê o documento em **e-Signature for HR > Meus documentos > Urgente**.
4. O representante revisa, clica em **Enviar documento** e confirma no aplicativo móvel.
5. O Bitrix24 libera a assinatura ao colaborador.
6. Depois das assinaturas, os eventos atualizam o FortaDocs.
7. O backend recupera o PDF do Cofre da empresa, valida o arquivo, calcula SHA-256 e arquiva uma cópia no Storage privado.

O botão **Abrir Bitrix24 para assinar** é apenas um atalho para o portal. A ação pendente também chega pelo Messenger do Bitrix24.

## Por que não existe “assinar automaticamente”

`sign.b2e.document.send` cria e envia o processo, mas a API pública não oferece um método para executar a assinatura em nome de um usuário. O Bitrix24 exige a confirmação pessoal do representante no aplicativo móvel. Automatizar essa confirmação fora do mecanismo oficial eliminaria a evidência de autoria e não é suportado.

Referências oficiais:

- [Enviar documento com `sign.b2e.document.send`](https://apidocs.bitrix24.com/api-reference/sign/sign-b2e-document-send.html)
- [Listar provedores da empresa](https://apidocs.bitrix24.com/api-reference/sign/sign-b2e-company-provider-list.html)
- [Assinar em nome da empresa](https://helpdesk.bitrix24.com/open/20687898/)
