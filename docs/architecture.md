# Arquitetura e fluxo do FortaDocs

## Visão geral

O FortaDocs é uma aplicação web de servidor incorporada ao Bitrix24. O Bitrix24 fornece identidade, cadastro corporativo, notificações, assinatura B2E e o Cofre da empresa; o Supabase guarda os dados e cópias privadas dos arquivos. O backend é a única camada autorizada a acessar segredos e recursos privilegiados.

```mermaid
flowchart LR
  subgraph B24[Bitrix24 - fortaeqt.bitrix24.com.br]
    OP[Operador RH ou TI]
    DIR[Usuários, fotos e departamentos]
    NOTIF[Notificações pessoais]
    B2E[e-Signature for HR]
    SAFE[Cofre da empresa]
  end

  subgraph RENDER[Render HTTPS]
    WEB[Frontend React\nfortatech-termos-web-hml]
    API[Backend NestJS\nfortatech-termos-api-hml]
    DOC[Docxtemplater + LibreOffice]
  end

  subgraph SUPA[Supabase HML]
    DB[(PostgreSQL\ntabelas app_*)]
    STORE[(Storage privado\nresponsibility-terms)]
  end

  REP[Representante autorizado]
  COL[Colaborador signatário]

  OP -->|abre no iframe| WEB
  WEB -->|JWT curto e API HTTPS| API
  API <-->|OAuth REST| DIR
  API -->|mensagem pessoal| NOTIF
  API <-->|Prisma pelo pooler| DB
  API <-->|URLs temporárias e arquivos| STORE
  API --> DOC
  DOC -->|PDF revisado| STORE
  API -->|PDF + representante + colaborador| B2E
  B2E -->|aviso no Messenger| REP
  REP -->|revisa e confirma no app móvel| B2E
  B2E -->|libera a assinatura| COL
  COL -->|assina no Bitrix24| B2E
  B2E -->|eventos document/member| API
  B2E --> SAFE
  API -->|recupera PDF concluído| SAFE
  API -->|PDF final + SHA-256| STORE
```

## Sequência ponta a ponta

```mermaid
sequenceDiagram
  autonumber
  actor Operador as Lucas/Osmar
  participant Bitrix as Bitrix24
  participant Web as Frontend Render
  participant API as Backend Render
  participant DB as Supabase PostgreSQL
  participant Storage as Supabase Storage
  participant Sign as Bitrix24 B2E
  actor Representante
  actor Colaborador
  participant Avisados as Nicoly/Marcelo

  Operador->>Bitrix: Abre FortaDocs pelo menu
  Bitrix->>API: POST /integrations/bitrix/launch com OAuth
  API->>Bitrix: user.current
  API->>DB: valida usuário e gera código de uso único (2 min)
  API-->>Bitrix: redireciona para o frontend com launchCode
  Bitrix->>Web: carrega o iframe
  Web->>API: troca launchCode por JWT
  API-->>Web: sessão e permissões
  Web->>API: consulta usuários ativos
  API->>Bitrix: user.get + department.get
  Bitrix-->>API: perfil, foto, e-mail, cargo e departamento
  API-->>Web: lista normalizada e alfabética
  Operador->>Web: seleciona pessoa, informa CPF e equipamentos
  Web->>API: cria rascunho
  API->>DB: snapshot do colaborador e equipamentos
  Operador->>Web: solicita prévia
  Web->>API: POST /send-requests/:id/preview
  API->>API: preenche DOCX e converte para PDF
  API->>Storage: salva unsigned/... com SHA-256
  Storage-->>Web: URL assinada por 5 minutos
  Operador->>Web: revisa e confirma envio
  Web->>API: POST /send-requests/:id/send
  API->>Sign: sign.b2e.document.send
  Note over API,Sign: empresa + provedor + responsável + representante + colaborador + PDF
  Sign-->>Representante: HR bot / item urgente
  API->>Bitrix: notifica envio aos usuários configurados
  Bitrix-->>Avisados: aviso “aguardando representante”
  Representante->>Sign: revisa e clica em Enviar documento
  Representante->>Sign: confirma assinatura no aplicativo móvel
  Sign-->>Colaborador: libera a solicitação de assinatura
  Colaborador->>Sign: revisa e assina no Bitrix24
  Sign->>API: OnSignB2eDocumentStatusChanged
  Sign->>API: OnSignB2eMemberStatusChanged
  API->>Sign: sign.b2e.document.get
  Sign->>Bitrix: arquiva no Cofre da empresa
  API->>Bitrix: consulta sign.b2e.mysafe.tail
  API->>Storage: baixa e arquiva signed/... + SHA-256
  API->>DB: status concluído e trilha de auditoria
  API->>Bitrix: notifica conclusão
  Bitrix-->>Avisados: aviso “termo assinado”
```

## Estados do termo

```mermaid
stateDiagram-v2
  [*] --> DRAFT: operador cria
  DRAFT --> READY: PDF gerado e revisável
  READY --> SENDING: envio reivindicado atomicamente
  SENDING --> SENT: Bitrix24 aceitou
  SENDING --> FAILED: falha técnica
  FAILED --> DRAFT: operador solicita nova tentativa
  SENT --> IN_PROGRESS: representante ou colaborador iniciou
  SENT --> DECLINED: participante recusou
  IN_PROGRESS --> FINISHED: representante e colaborador assinaram
  SENT --> FINISHED: evento final
  FINISHED --> ARCHIVED: PDF validado e SHA-256 salvo
  FINISHED --> ARCHIVE_FAILED: falha no download ou Storage
  ARCHIVE_FAILED --> ARCHIVED: reprocessamento manual
  DECLINED --> [*]
  ARCHIVED --> [*]
```

## Responsabilidades e acesso

| Papel | O que faz | O que não faz |
|---|---|---|
| Administrador | Libera acesso, define perfil, operadores, notificados e templates | Não assina automaticamente pelo colaborador |
| Operador | Cria o rascunho, informa CPF/equipamentos, revisa e envia | Não altera um documento depois do envio |
| Notificado | Recebe avisos de envio e conclusão no Bitrix24 | Não participa da assinatura |
| Representante | Revisa e assina em nome da empresa quando formalmente autorizado | Não pode ter a assinatura inserida automaticamente pelo FortaDocs |
| Colaborador | Recebe a solicitação depois do representante e assina no Bitrix24 | Não acessa o painel interno do FortaDocs |
| Backend | Orquestra OAuth, PDF, assinatura, arquivo e auditoria | Não expõe chaves ao navegador |

Uma pessoa pode acumular perfil administrativo, operação e notificações. **Acessar o FortaDocs**, **Perfil e Setor**, **Gerenciar Termos** e **Receber Notificações** são controles independentes.

## Fronteiras de segurança

- O iframe aceita somente `https://fortaeqt.bitrix24.com.br`.
- O código de abertura é de uso único, armazenado como hash e expira em dois minutos.
- Tokens OAuth do Bitrix24 são cifrados com `BITRIX_TOKEN_ENCRYPTION_KEY`.
- O Bitrix24 recebe o PDF e os identificadores dos participantes por OAuth com escopos `crm` e `sign.b2e`.
- Eventos B2E são validados pelo `application_token` do aplicativo e deduplicados.
- `anon` e `authenticated` não possuem DML nas tabelas `app_*`; o Prisma acessa PostgreSQL no servidor.
- O bucket é privado; URLs de download expiram em cinco minutos.
- O PDF final é validado pelo cabeçalho, limitado em tamanho e registrado com SHA-256.
- CPF, tokens e conteúdo do documento não devem aparecer nos logs.

## Implantação

Cada push na branch `main` aciona o Blueprint do Render. O backend executa `prisma migrate deploy`, seed idempotente e inicia a API. O frontend é compilado com a URL pública da API. A configuração interativa do aplicativo local no Bitrix24 deve apontar para as URLs permanentes descritas no [runbook](homologation-runbook.md).
