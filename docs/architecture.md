# Arquitetura e fluxo do FortaDocs

## Visão geral

O FortaDocs é uma aplicação web de servidor incorporada ao Bitrix24. O Bitrix24 fornece identidade, cadastro corporativo e notificações; a ZapSign executa a assinatura do colaborador; o Supabase guarda os dados e arquivos privados. O backend é a única camada autorizada a acessar segredos e recursos privilegiados.

```mermaid
flowchart LR
  subgraph B24[Bitrix24 - fortaeqt.bitrix24.com.br]
    OP[Operador RH ou TI]
    DIR[Usuários, fotos e departamentos]
    NOTIF[Notificações pessoais]
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

  subgraph SIGN[ZapSign Sandbox]
    ZAPI[API de documentos]
    MAIL[E-mail e token]
    HOOK[Webhook assinado/recusado]
  end

  COL[Colaborador signatário]

  OP -->|abre no iframe| WEB
  WEB -->|JWT curto e API HTTPS| API
  API <-->|OAuth REST| DIR
  API -->|mensagem pessoal| NOTIF
  API <-->|Prisma pelo pooler| DB
  API <-->|URLs temporárias e arquivos| STORE
  API --> DOC
  DOC -->|PDF revisado| STORE
  API -->|PDF + 1 signatário| ZAPI
  ZAPI --> MAIL --> COL
  COL -->|token + assinatura desenhada| ZAPI
  HOOK -->|Bearer compartilhado| API
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
  participant Zap as ZapSign Sandbox
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
  API->>Zap: cria documento, 1 signatário e e-mail automático
  Zap-->>Colaborador: e-mail com link e token
  API->>Bitrix: notifica envio aos usuários configurados
  Bitrix-->>Avisados: aviso “aguardando assinatura”
  Colaborador->>Zap: revisa, informa token e desenha assinatura
  Zap->>API: POST /integrations/zapsign/events
  API->>Zap: consulta o estado final
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
  SENDING --> SENT: ZapSign aceitou
  SENDING --> FAILED: falha técnica
  FAILED --> DRAFT: operador solicita nova tentativa
  SENT --> VIEWED: colaborador abriu
  SENT --> DECLINED: colaborador recusou
  VIEWED --> FINISHED: colaborador assinou
  SENT --> FINISHED: webhook final
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
| Colaborador | Recebe o e-mail, autentica e desenha a própria assinatura | Não acessa o painel interno |
| Backend | Orquestra OAuth, PDF, assinatura, arquivo e auditoria | Não expõe chaves ao navegador |

Uma pessoa pode acumular perfil administrativo, operação e notificações. **Acessar o FortaDocs**, **Perfil e Setor**, **Gerenciar Termos** e **Receber Notificações** são controles independentes.

## Fronteiras de segurança

- O iframe aceita somente `https://fortaeqt.bitrix24.com.br`.
- O código de abertura é de uso único, armazenado como hash e expira em dois minutos.
- Tokens OAuth do Bitrix24 são cifrados com `BITRIX_TOKEN_ENCRYPTION_KEY`.
- A ZapSign recebe apenas o PDF e os dados necessários do único signatário.
- Webhooks ZapSign exigem `Authorization: Bearer <segredo>` e são deduplicados.
- `anon` e `authenticated` não possuem DML nas tabelas `app_*`; o Prisma acessa PostgreSQL no servidor.
- O bucket é privado; URLs de download expiram em cinco minutos.
- O PDF final é validado pelo cabeçalho, limitado em tamanho e registrado com SHA-256.
- CPF, tokens e conteúdo do documento não devem aparecer nos logs.

## Implantação

Cada push na branch `main` aciona o Blueprint do Render. O backend executa `prisma migrate deploy`, seed idempotente e inicia a API. O frontend é compilado com a URL pública da API. A configuração interativa do aplicativo local no Bitrix24 deve apontar para as URLs permanentes descritas no [runbook](homologation-runbook.md).
