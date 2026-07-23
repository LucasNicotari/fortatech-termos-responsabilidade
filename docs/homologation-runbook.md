# Runbook de homologação e implantação

Este procedimento publica o ambiente de testes permanente e o conecta ao aplicativo local do portal `fortaeqt.bitrix24.com.br`. Não use dados de colaboradores reais, exceto o endereço autorizado para o teste controlado. O CPF, os patrimônios e o conteúdo do teste devem ser sintéticos.

## 1. Portão técnico local

```powershell
docker info
npm.cmd run test:local

Set-Location backend
npm.cmd test -- --runInBand
npm.cmd run lint
npm.cmd run build

Set-Location ..\frontend
npm.cmd run lint
npm.cmd run build

Set-Location ..
git diff --check
powershell -ExecutionPolicy Bypass -File scripts/check-homologation.ps1 -Mode local
```

Critérios: testes sem falhas, backend e frontend compilados, PDF sintético assinado e arquivado, `.env` ignorado e template marcado como homologação.

## 2. Supabase HML

O Render precisa receber, como segredos e sem aspas adicionais:

```text
DATABASE_URL
DIRECT_URL
SUPABASE_URL
SUPABASE_SECRET_KEY
```

O entrypoint do backend aplica migrations sem reset e executa o seed idempotente. Depois do deploy, confirme:

- `prisma migrate status` sem pendências;
- 16 tabelas `app_*` com RLS;
- bucket privado `responsibility-terms`, 20 MB, PDF/DOCX;
- nenhum DML de `anon` ou `authenticated`;
- advisors do Supabase sem alerta crítico relacionado às tabelas da aplicação.

## 3. Render HML

O Blueprint `render.yaml` mantém:

```text
Backend:  https://fortatech-termos-api-hml.onrender.com
Frontend: https://fortatech-termos-web-hml.onrender.com
Health:   https://fortatech-termos-api-hml.onrender.com/health
```

Segredos obrigatórios do backend:

```text
DATABASE_URL
DIRECT_URL
SUPABASE_URL
SUPABASE_SECRET_KEY
BITRIX_CLIENT_ID
BITRIX_CLIENT_SECRET
```

O Blueprint gera `JWT_SECRET` e `BITRIX_TOKEN_ENCRYPTION_KEY`. Em serviço já criado, uma nova variável marcada como `sync: false` precisa ser preenchida manualmente no painel do Render; o Blueprint não inventa nem copia o segredo.

O plano gratuito é adequado apenas para homologação: o backend suspende após inatividade e pode levar cerca de um minuto para acordar. Antes de produção, altere o serviço para uma instância sempre ativa. Não use um monitor artificial para contornar os limites do plano.

## 4. Aplicativo local Bitrix24 definitivo

No Bitrix24, abra **Aplicativos > Recursos para desenvolvedores > Outros > Aplicativo local** e mantenha o tipo **Servidor**.

```text
Seu caminho do manipulador:
https://fortatech-termos-api-hml.onrender.com/integrations/bitrix/launch

Caminho de instalação inicial:
https://fortatech-termos-api-hml.onrender.com/integrations/bitrix/install
```

Permissões necessárias para o fluxo atual:

```text
user_basic
department
im
crm
sign.b2e
```

- `user_basic`: identidade, perfil básico e e-mail dos colaboradores, sem permissão para alterá-los;
- `department`: converte `UF_DEPARTMENT` no nome do departamento;
- `im`: envia notificações pessoais aos usuários selecionados.
- `crm`: identifica a empresa que envia o documento;
- `sign.b2e`: cria, consulta e acompanha a assinatura nativa.

O instalador registra eventos de ciclo de vida e os eventos `OnSignB2eDocumentStatusChanged` e `OnSignB2eMemberStatusChanged`. A tela de configuração também tenta registrar os dois eventos B2E ausentes, portanto não é necessário reinstalar o aplicativo apenas para renovar os handlers quando o token já possui os escopos corretos.

Referências oficiais: [`user.get`](https://apidocs.bitrix24.com/api-reference/user/user-get.html),
[`department.get`](https://apidocs.bitrix24.com/api-reference/departments/department-get.html) e
[`im.notify.personal.add`](https://apidocs.bitrix24.com/api-reference/chats/notifications/im-notify-personal-add.html),
[`sign.b2e.document.send`](https://apidocs.bitrix24.com/api-reference/sign/sign-b2e-document-send.html) e
[`sign.b2e.company.provider.list`](https://apidocs.bitrix24.com/api-reference/sign/sign-b2e-company-provider-list.html).

Procedimento:

1. confira se `BITRIX_CLIENT_ID` e `BITRIX_CLIENT_SECRET` do aplicativo estão no Render;
2. salve as duas URLs permanentes e as permissões;
3. clique em **Reinstalar**;
4. aguarde a página concluir com `BX24.installFinish()`;
5. clique em **Abrir aplicativo** pelo Bitrix24;
6. confirme que o Dashboard carrega e que acesso direto à URL não concede sessão.

A instalação precisa ser feita pela sessão administrativa do portal; ela não pode ser automatizada pelo servidor porque é o Bitrix24 que emite e entrega o OAuth inicial.

## 5. Assinatura Bitrix24

1. abra **Configurações > Usuários e acessos**;
2. em **Assinatura Bitrix24**, selecione o representante formalmente autorizado;
3. confirme a empresa `FORTA TECH · CRM 67539`;
4. confira se o provedor foi localizado;
5. clique em **Salvar**.

Se o provedor não aparecer, confira se o instalador possui permissão para criar documentos B2E e se os escopos `crm` e `sign.b2e` foram concedidos. Alterar escopos exige salvar e reinstalar o aplicativo local para o Bitrix24 emitir um novo OAuth.

## 6. Teste final autorizado

Destino: `lucas.nicotari@fortatech.com.br`.

1. abra o FortaDocs pelo menu do Bitrix24 com Lucas ou Osmar;
2. escolha o usuário Bitrix de Lucas e confirme o e-mail acima;
3. use CPF sintético válido e claramente registre patrimônios como `HML-TESTE`;
4. inclua ao menos dois equipamentos fictícios;
5. gere a prévia e confirme os títulos centralizados, nome, CPF e itens;
6. envie uma única vez;
7. confirme que o representante recebeu a mensagem do HR bot;
8. o representante revisa o documento e confirma a assinatura no aplicativo móvel do Bitrix24;
9. confirme que a solicitação foi liberada ao colaborador e conclua a assinatura de teste no Bitrix24;
10. confirme o estado concluído no FortaDocs;
11. valide que notificados receberam aviso no Bitrix24;
12. confira `ARCHIVED`, tamanho, caminho privado e SHA-256 do PDF final;
13. confira que reentrega do evento não cria duplicação.

## 7. Evidências de liberação

- commit e deploy identificados;
- `/health` em 200;
- migrations sem pendência;
- instalação Bitrix ativa no Supabase;
- empresa, provedor e representante Bitrix24 configurados;
- ID do termo de teste e horários de envio/assinatura;
- assinaturas do representante e do colaborador concluídas no Bitrix24;
- PDF final privado e hash correspondente;
- logs sem CPF, chaves ou conteúdo do documento.

## 8. Produção

Produção exige projeto Supabase separado, serviço Render sempre ativo, aplicativo Bitrix separado, credenciais novas, domínio próprio, template juridicamente aprovado e sem a marca de homologação, retenção/backup definidos e teste controlado adicional.
