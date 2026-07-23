# Diagrama do fluxo de assinatura

## Fluxo principal

```mermaid
sequenceDiagram
    autonumber
    actor Operador
    participant Web as FortaDocs Admin
    participant API as API FortaDocs
    participant DB as PostgreSQL / Supabase
    participant Storage as Storage privado
    participant Drive as Drive Bitrix24
    participant Chat as Chat Bitrix24
    actor Colaborador
    participant Sign as Tela de assinatura

    Operador->>Web: Seleciona colaborador, equipamentos e notificados
    Web->>API: Cria rascunho e solicita previa
    API->>Storage: Grava PDF sem assinatura
    Storage-->>API: Caminho privado e SHA-256
    API-->>Web: URL temporaria da previa
    Operador->>Web: Confirma envio
    Web->>API: POST /send-requests/:id/send
    API->>DB: Cria assinatura FORTADOCS e convite
    Note over API,DB: Token aleatorio; banco recebe somente o hash
    API->>Chat: im.message.add com link REST_APP_URI
    Chat-->>Colaborador: Mensagem pessoal
    API->>Chat: im.notify.personal.add
    Chat-->>Colaborador: Alerta clicavel
    API->>DB: Registra mensagem, status SENT e evento
    API-->>Web: Envio concluido
    Note over Web,Colaborador: Se operador = colaborador, o Web exibe Abrir minha assinatura

    Colaborador->>Chat: Clica em Abrir e assinar
    Chat->>API: POST launch + OAuth + PLACEMENT_OPTIONS
    API->>Chat: user.current
    Chat-->>API: ID do usuario conectado
    API->>DB: Confere token, prazo, usuario e documento
    API->>DB: Marca VIEWED na primeira abertura autenticada
    API-->>Sign: Codigo de abertura de uso unico
    Sign->>API: Troca codigo por sessao SIGN_DOCUMENT
    API-->>Sign: PDF temporario e dados minimos
    Colaborador->>Sign: Digita, desenha ou importa imagem
    Colaborador->>Sign: Confirma leitura e finaliza
    Sign->>API: PNG normalizado + metodo + concordancia
    API->>Storage: Le PDF original
    API->>API: Incorpora assinatura e calcula hashes
    API->>Storage: Grava PDF assinado
    API->>DB: Conclui convite e marca SIGNED
    API->>Chat: Notifica todas as pessoas selecionadas
    API->>Chat: Notifica automaticamente quem criou o termo
    API->>Drive: Salva PDF em /Termo de Responsabilidade
    Drive-->>API: ID do arquivo e da pasta
    API->>DB: Marca FINISHED / COMPLETED
    API-->>Sign: Confirmacao e link temporario do PDF final
```

## Separacao de acesso

```mermaid
flowchart LR
    A[Link normal do aplicativo] --> B[OAuth Bitrix24]
    B --> C{Usuario ativo do FortaDocs?}
    C -- Sim --> D[Sessao administrativa]
    D --> E[Dashboard]
    D --> F[Novo termo]
    D --> G[Termos e configuracoes]
    C -- Nao --> H[Acesso negado]

    I[Link pessoal do chat] --> J[REST_APP_URI]
    J --> K{Token + ID Bitrix conferem?}
    K -- Sim --> L[Sessao SIGN_DOCUMENT]
    L --> M[Somente tela de assinatura]
    K -- Nao --> N[Convite indisponivel]

    L -. bloqueado .-> E
    L -. bloqueado .-> F
    L -. bloqueado .-> G
```

## Estados do documento

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> READY: previa gerada
    READY --> SENDING: operador confirma
    SENDING --> SENT: mensagem enviada ao chat
    SENT --> VIEWED: colaborador abre no Bitrix24
    VIEWED --> SIGNED: assinatura incorporada ao PDF
    SIGNED --> FINISHED: PDF confirmado no Drive
    SIGNED --> SIGNED: falha no Drive; permite nova tentativa
    SENDING --> FAILED: falha de API ou permissao
    READY --> DRAFT: documento alterado
    FINISHED --> [*]: concluido
```

## Significado operacional dos status

| Status exibido | Condicao registrada |
|---|---|
| Enviado | A mensagem do convite foi aceita pelo chat do Bitrix24 |
| Visualizado | O colaborador abriu o convite dentro do Bitrix24 e teve sua identidade confirmada |
| Assinado | A assinatura foi incorporada ao PDF, o SHA-256 foi salvo e o convite foi encerrado |
| Concluido | O Bitrix24 confirmou o PDF na pasta `Termo de Responsabilidade` do Drive do usuario `8465` |

Falhas de envio usam `FAILED`. Recusa usa `DECLINED`, cancelamento ou expiracao usa `CANCELED`
e falha de processamento usa `ERROR`. Uma falha exclusiva do Drive nao desfaz a assinatura:
o termo continua `SIGNED`, recebe `archive_status=FAILED` e pode ser arquivado novamente pelo
painel administrativo.

## Controles de seguranca

- convite com 256 bits de entropia e validade de sete dias;
- token persistido somente como SHA-256;
- codigo de abertura de uso unico e validade de dois minutos;
- sessao do signatario limitada a uma hora e a endpoints exclusivos;
- validacao do ID atual por `user.current`;
- RLS nas tabelas novas e nenhum privilegio para `anon` ou `authenticated`;
- bucket privado e URLs temporarias;
- limite de 1 MB e validacao de assinatura PNG;
- operacao de conclusao atomica para impedir assinatura dupla;
- convite concluido nao volta a aceitar assinatura e informa que nao existe acao pendente;
- assinatura posicionada pela linha real do PDF, sem coordenada fixa de pagina;
- imagem recortada no navegador e limitada ao espaco entre a data e a linha;
- SHA-256 do desenho e do PDF final na trilha de auditoria.

## Remocao do historico

O `X` da tela Termos faz uma remocao logica e auditada:

- rascunhos somem da visao operacional;
- convites pendentes sao revogados e a assinatura passa para cancelada;
- PDFs ja assinados, hashes e eventos continuam preservados;
- dashboard e lista ignoram itens removidos;
- a auditoria registra usuario, horario, estado anterior e cancelamento do convite.
