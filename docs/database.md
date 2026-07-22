# Banco de dados

O schema funcional fica em `public` e contém 16 tabelas com prefixo `app_`. Os schemas internos do Supabase não são modificados.

## Relacionamentos principais

```mermaid
erDiagram
  app_users ||--o{ app_send_requests : solicita
  app_users ||--o{ app_audit_events : executa
  app_users ||--o{ app_bitrix_launch_codes : recebe
  app_users ||--o{ app_term_workflow_participants : atualiza
  app_employees ||--o{ app_send_requests : recebe
  app_employees ||--o{ app_signatures : assina
  app_document_templates ||--o{ app_document_template_versions : possui
  app_document_template_versions ||--o{ app_send_requests : gera
  app_document_template_versions ||--o{ app_signatures : referencia
  app_send_requests ||--o{ app_send_request_equipment : contém
  app_send_requests ||--o{ app_send_attempts : tenta
  app_send_requests ||--o{ app_signatures : inicia
  app_signatures ||--o{ app_signature_events : registra
```

## Tabelas

| Tabela | Responsabilidade |
|---|---|
| `app_users` | Identidade interna vinculada ao ID Bitrix, perfil e estado de acesso |
| `app_term_workflow_participants` | Operadores e destinatários de notificações editáveis |
| `app_employees` | Snapshot mínimo do colaborador usado nos termos |
| `app_document_templates` | Tipo lógico do documento |
| `app_document_template_versions` | Versões imutáveis do DOCX e hash da origem |
| `app_send_requests` | Agregado central do termo, estado e PDF não assinado |
| `app_send_request_equipment` | Equipamentos imutáveis do termo |
| `app_send_attempts` | Tentativas técnicas de envio ao provedor |
| `app_signatures` | Estado normalizado da assinatura e do arquivamento |
| `app_signature_events` | Linha do tempo e deduplicação de avisos |
| `app_webhook_events` | Eventos externos sanitizados e idempotentes |
| `app_bitrix_installations` | Instalação e tokens OAuth cifrados |
| `app_bitrix_launch_codes` | Códigos de login de uso único e curta duração |
| `app_integration_logs` | Diagnóstico técnico sem CPF, documento ou tokens |
| `app_audit_events` | Auditoria de configurações e templates |
| `app_settings` | Configurações operacionais não secretas |

Estruturas antigas de lote, senha local, empresa, convite e participantes duplicados foram removidas pela migration `20260722153000_remove_redundant_fields`.

## Regras

- O snapshot de pessoa e equipamentos preserva o conteúdo usado no momento do envio.
- Depois de enviado, o termo fica bloqueado para edição.
- Apenas uma tentativa pode reivindicar um termo `READY`; a atualização atômica impede envio duplo.
- O token externo da assinatura é único e o evento externo possui chave idempotente.
- O PDF concluído só fica `ARCHIVED` depois de upload privado e cálculo de SHA-256.
- RLS está habilitado em todas as tabelas `app_*` e `anon`/`authenticated` não possuem DML.

## Migrations

- Migrations já aplicadas nunca são editadas; toda mudança recebe uma nova pasta versionada.
- `DIRECT_URL` é usada para `prisma migrate deploy`.
- `DATABASE_URL` com pooler é usada no runtime.
- `prisma migrate reset` é proibido no projeto remoto.
- Exclusão ou alteração destrutiva exige auditoria de dados, backup e janela controlada.
