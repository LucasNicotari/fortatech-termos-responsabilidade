# Assinatura interna do FortaDocs no Bitrix24

## Decisao atual

Novos Termos de Responsabilidade nao usam mais o processo B2E com assinatura de representante.
O FortaDocs cria o PDF, envia um link pessoal ao chat do colaborador e abre a experiencia de
assinatura dentro do proprio Bitrix24.

Somente o colaborador escolhido assina. Operadores e pessoas notificadas acompanham o processo,
mas nao adicionam assinatura ao documento.

## Escopos do aplicativo local

Mantenha estes escopos:

```text
basic
user
user_basic
department
im
placement
disk
```

- `im` permite enviar a mensagem ao chat pessoal com `im.message.add`.
- `placement` permite registrar `REST_APP_URI`, usado para abrir o link em um slider do portal.
- `disk` permite confirmar o PDF final no Drive configurado.
- `user`, `user_basic` e `department` identificam o colaborador e completam os dados do termo.

Os escopos `crm` e `sign.b2e` nao sao necessarios para novos documentos. Eles podem permanecer
temporariamente enquanto registros antigos do B2E ainda precisarem ser consultados, mas não
devem ser descritos como parte do fluxo atual.

Depois de alterar os escopos, salve e reinstale o aplicativo local para o Bitrix24 emitir um novo
OAuth. Os caminhos continuam:

```text
Manipulador:
https://fortatech-termos-api-hml.onrender.com/integrations/bitrix/launch

Instalacao inicial:
https://fortatech-termos-api-hml.onrender.com/integrations/bitrix/install
```

## Fluxo de envio

1. Um operador cria o termo e escolhe o colaborador.
2. O operador escolhe as pessoas a notificar. A API possui um teto técnico de 5.000 IDs por
   termo para impedir payloads ilimitados; no uso normal a lista deve permanecer pequena.
3. A API gera o PDF, grava-o no bucket privado e cria um convite aleatorio valido por sete dias.
4. Apenas o SHA-256 do token do convite fica no banco.
   Textos técnicos de log mascaram automaticamente qualquer `params[signing]`.
5. A API registra o manipulador `REST_APP_URI`, se ainda nao estiver registrado.
6. `im.message.add` envia ao chat do colaborador um link no formato:

   ```text
   /marketplace/view/CLIENT_ID/?params[signing]=TOKEN
   ```

7. `im.notify.personal.add` cria também um alerta clicável no sino do Bitrix24. A falha desse
   alerta secundário não invalida a mensagem já entregue no chat.
8. O Bitrix24 abre o link dentro do portal e envia `PLACEMENT_OPTIONS` ao backend.
   Se essa primeira chamada vier apenas com `DOMAIN/APP_SID`, uma ponte HTML obtém OAuth pelo SDK
   `BX24` e repete a abertura uma única vez; contexto incompleto nunca é exibido como JSON bruto.
9. O backend consulta `user.current` e confere:

   - token valido;
   - convite ativo e nao expirado;
   - ID do usuario conectado igual ao ID do colaborador;
   - colaborador da solicitacao igual ao usuario conectado.

10. Uma sessao restrita de uma hora e emitida. Essa sessao acessa somente `/signing/*` e nao abre
   Dashboard, Termos, Configuracoes ou APIs administrativas.

Quando o operador envia um termo para o próprio usuário, a resposta autenticada também apresenta
**Abrir minha assinatura** com o mesmo convite recebido no chat. O convite nunca é devolvido ao
operador quando o colaborador escolhido é outra pessoa.

## Formas de assinatura

O colaborador pode:

- desenhar com mouse, touchpad ou toque;
- digitar o nome, convertido em imagem de assinatura;
- importar PNG ou JPG de ate 1 MB, convertido para PNG antes do envio.

Antes de finalizar, a confirmacao de leitura e autoria e obrigatoria. A imagem e incorporada ao
PDF; o FortaDocs registra metodo, horario, ID Bitrix24, SHA-256 da imagem e SHA-256 do PDF final.
A imagem isolada nao e mantida como arquivo reutilizavel.

## Notificacoes

A lista e propria de cada termo. A configuracao global de usuarios serve apenas como selecao
inicial; no passo de revisao o operador pode remover ou adicionar qualquer usuario ativo,
inclusive a si mesmo.

Os selecionados recebem notificacao no envio e na conclusao. A consulta à trilha reduz
duplicações em uma única instância, mas ainda não existe restrição `UNIQUE` nem outbox que garanta
idempotência forte sob concorrência entre réplicas.

Quem criou o termo tambem recebe automaticamente a notificacao de conclusao, mesmo que nao tenha
sido marcado manualmente. Ao reabrir um convite concluido, o colaborador ve que a assinatura ja
foi finalizada e que nao existe nova acao pendente.

A imagem final e recortada para remover margens vazias e aplicada sobre a linha de assinatura
localizada dinamicamente na ultima pagina. Isso acompanha a mudanca de altura do conteudo sem
depender de uma coordenada fixa.

O colaborador recebe dois sinais complementares: a mensagem persistente no chat e o alerta pessoal
do Bitrix24. O envio não depende de e-mail.

A saudação da mensagem usa o nome consultado diretamente pelo ID do usuário no Bitrix24. O texto
informa a origem FortaTech, orienta a revisão, destaca o botão de assinatura e registra que o
convite é pessoal, intransferível e válido por sete dias.

## Arquivamento e conclusão

Depois da assinatura, o PDF final permanece no bucket privado e é enviado ao Drive pessoal
indicado por `BITRIX_DRIVE_OWNER_USER_ID`, na pasta `BITRIX_DRIVE_FOLDER_NAME`. Na homologação,
os valores atuais são `8465` e `Termo de Responsabilidade`; ambos permanecem parametrizados. Os
estados exibidos são:

- **Enviado** quando o chat aceita o convite;
- **Visualizado** na primeira abertura autenticada;
- **Assinado** quando a assinatura é incorporada e os hashes são persistidos;
- **Concluído** somente quando o Drive confirma o arquivo.

Se o Drive falhar, o termo continua **Assinado**, com arquivamento `FAILED`, e um operador pode
tentar novamente. Ele não pode ser removido da visão operacional enquanto essa pendência existir.

## Alternativas desativadas

Bitrix Sign B2E exigia fluxo próprio, escopos `crm`/`sign.b2e` e participação de representante.
ZapSign usava e-mail e webhook externos. Ambos são legado/alternativa desativada; novos termos
não dependem deles e somente o colaborador assina no FortaDocs.

## Compatibilidade

Registros historicos com provedor `BITRIX` ou `ZAPSIGN` continuam legiveis. Novos registros usam
`FORTADOCS` no ambiente real. O simulador local reutiliza o adaptador/enum `ZAPSIGN`, sem acesso
à API externa. Nenhum documento historico e convertido ou apagado pela migration.

## Referencias oficiais

- [Mensagem em chat com `im.message.add`](https://apidocs.bitrix24.com/api-reference/chats/messages/im-message-add.html)
- [Notificação pessoal com `im.notify.personal.add`](https://apidocs.bitrix24.com/api-reference/chats/notifications/im-notify-personal-add.html)
- [Link interno com `REST_APP_URI`](https://apidocs.bitrix24.com/api-reference/widgets/universal/app-url.html)
- [Registro do manipulador com `placement.bind`](https://apidocs.bitrix24.com/api-reference/widgets/placement-bind.html)
