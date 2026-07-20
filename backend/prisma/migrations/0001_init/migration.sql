CREATE TYPE "app_user_role" AS ENUM ('ADMIN', 'RH', 'TI');
CREATE TYPE "app_employee_status" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING');
CREATE TYPE "app_invitation_status" AS ENUM ('UNKNOWN', 'INVITED', 'ACCEPTED');
CREATE TYPE "app_send_batch_type" AS ENUM ('MANUAL', 'AUTOMATIC');
CREATE TYPE "app_send_trigger_type" AS ENUM ('BITRIX_INVITE_ACCEPTED', 'MANUAL', 'RETRY');
CREATE TYPE "app_send_request_status" AS ENUM ('PENDING', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELED', 'SKIPPED');
CREATE TYPE "app_send_attempt_status" AS ENUM ('SENDING', 'SUCCESS', 'FAILED');
CREATE TYPE "app_signature_status" AS ENUM ('PENDING', 'SENT', 'VIEWED', 'SIGNED', 'FINISHED', 'ERROR', 'CANCELED');
CREATE TYPE "app_webhook_processing_status" AS ENUM ('RECEIVED', 'PROCESSED', 'FAILED', 'IGNORED');

CREATE TABLE "app_users" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "role" "app_user_role" NOT NULL DEFAULT 'ADMIN',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "last_login_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_employees" (
  "id" TEXT NOT NULL,
  "bitrix_id" TEXT,
  "nome" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "cpf" TEXT,
  "empresa" TEXT,
  "cargo" TEXT,
  "departamento" TEXT,
  "status" "app_employee_status" NOT NULL DEFAULT 'ACTIVE',
  "invitation_status" "app_invitation_status" NOT NULL DEFAULT 'UNKNOWN',
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_document_templates" (
  "id" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "descricao" TEXT,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_document_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_document_template_versions" (
  "id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "versao" TEXT NOT NULL,
  "descricao" TEXT,
  "bitrix_template_id" TEXT,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_document_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_send_batches" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "app_send_batch_type" NOT NULL DEFAULT 'MANUAL',
  "requested_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_send_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_send_requests" (
  "id" TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "template_version_id" TEXT NOT NULL,
  "batch_id" TEXT,
  "trigger_type" "app_send_trigger_type" NOT NULL,
  "status" "app_send_request_status" NOT NULL DEFAULT 'PENDING',
  "scheduled_at" TIMESTAMP(3),
  "requested_by_user_id" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "failure_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_send_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_send_attempts" (
  "id" TEXT NOT NULL,
  "send_request_id" TEXT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "status" "app_send_attempt_status" NOT NULL DEFAULT 'SENDING',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "bitrix_response" JSONB,
  "error" TEXT,
  CONSTRAINT "app_send_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_signatures" (
  "id" TEXT NOT NULL,
  "send_request_id" TEXT,
  "employee_id" TEXT NOT NULL,
  "template_version_id" TEXT,
  "bitrix_document_id" TEXT,
  "bitrix_sign_id" TEXT,
  "status" "app_signature_status" NOT NULL DEFAULT 'PENDING',
  "bitrix_stage" TEXT,
  "sent_at" TIMESTAMP(3),
  "viewed_at" TIMESTAMP(3),
  "signed_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "last_synced_at" TIMESTAMP(3),
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_signatures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_signature_events" (
  "id" TEXT NOT NULL,
  "signature_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "status" "app_signature_status",
  "bitrix_stage" TEXT,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_signature_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_webhook_events" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "event_type" TEXT,
  "external_event_id" TEXT,
  "payload" JSONB NOT NULL,
  "processing_status" "app_webhook_processing_status" NOT NULL DEFAULT 'RECEIVED',
  "processed" BOOLEAN NOT NULL DEFAULT false,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "app_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_integration_logs" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "endpoint" TEXT,
  "method" TEXT,
  "http_status" INTEGER,
  "duration_ms" INTEGER,
  "correlation_id" TEXT,
  "payload" JSONB,
  "response" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_integration_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_audit_events" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "description" TEXT,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_users_email_key" ON "app_users"("email");
CREATE UNIQUE INDEX "app_employees_bitrix_id_key" ON "app_employees"("bitrix_id");
CREATE UNIQUE INDEX "app_employees_email_key" ON "app_employees"("email");
CREATE UNIQUE INDEX "app_employees_cpf_key" ON "app_employees"("cpf");
CREATE INDEX "app_employees_status_idx" ON "app_employees"("status");
CREATE INDEX "app_employees_invitation_status_idx" ON "app_employees"("invitation_status");
CREATE UNIQUE INDEX "app_document_template_versions_template_id_versao_key" ON "app_document_template_versions"("template_id", "versao");
CREATE INDEX "app_document_template_versions_bitrix_template_id_idx" ON "app_document_template_versions"("bitrix_template_id");
CREATE INDEX "app_document_template_versions_is_default_ativo_idx" ON "app_document_template_versions"("is_default", "ativo");
CREATE UNIQUE INDEX "app_document_template_versions_single_default_idx" ON "app_document_template_versions"("is_default") WHERE "is_default" = true AND "ativo" = true;
CREATE INDEX "app_send_batches_type_idx" ON "app_send_batches"("type");
CREATE INDEX "app_send_batches_requested_by_user_id_idx" ON "app_send_batches"("requested_by_user_id");
CREATE INDEX "app_send_requests_employee_id_idx" ON "app_send_requests"("employee_id");
CREATE INDEX "app_send_requests_template_version_id_idx" ON "app_send_requests"("template_version_id");
CREATE INDEX "app_send_requests_batch_id_idx" ON "app_send_requests"("batch_id");
CREATE INDEX "app_send_requests_trigger_type_idx" ON "app_send_requests"("trigger_type");
CREATE INDEX "app_send_requests_status_idx" ON "app_send_requests"("status");
CREATE INDEX "app_send_requests_scheduled_at_idx" ON "app_send_requests"("scheduled_at");
CREATE UNIQUE INDEX "app_send_attempts_send_request_id_attempt_number_key" ON "app_send_attempts"("send_request_id", "attempt_number");
CREATE INDEX "app_send_attempts_status_idx" ON "app_send_attempts"("status");
CREATE UNIQUE INDEX "app_signatures_bitrix_sign_id_key" ON "app_signatures"("bitrix_sign_id");
CREATE INDEX "app_signatures_send_request_id_idx" ON "app_signatures"("send_request_id");
CREATE INDEX "app_signatures_employee_id_idx" ON "app_signatures"("employee_id");
CREATE INDEX "app_signatures_template_version_id_idx" ON "app_signatures"("template_version_id");
CREATE INDEX "app_signatures_status_idx" ON "app_signatures"("status");
CREATE INDEX "app_signatures_bitrix_stage_idx" ON "app_signatures"("bitrix_stage");
CREATE INDEX "app_signature_events_signature_id_idx" ON "app_signature_events"("signature_id");
CREATE INDEX "app_signature_events_event_type_idx" ON "app_signature_events"("event_type");
CREATE INDEX "app_signature_events_created_at_idx" ON "app_signature_events"("created_at");
CREATE INDEX "app_webhook_events_source_event_type_idx" ON "app_webhook_events"("source", "event_type");
CREATE INDEX "app_webhook_events_external_event_id_idx" ON "app_webhook_events"("external_event_id");
CREATE INDEX "app_webhook_events_processing_status_idx" ON "app_webhook_events"("processing_status");
CREATE INDEX "app_webhook_events_created_at_idx" ON "app_webhook_events"("created_at");
CREATE INDEX "app_integration_logs_source_idx" ON "app_integration_logs"("source");
CREATE INDEX "app_integration_logs_type_idx" ON "app_integration_logs"("type");
CREATE INDEX "app_integration_logs_created_at_idx" ON "app_integration_logs"("created_at");
CREATE INDEX "app_integration_logs_correlation_id_idx" ON "app_integration_logs"("correlation_id");
CREATE INDEX "app_audit_events_actor_user_id_idx" ON "app_audit_events"("actor_user_id");
CREATE INDEX "app_audit_events_entity_type_entity_id_idx" ON "app_audit_events"("entity_type", "entity_id");
CREATE INDEX "app_audit_events_created_at_idx" ON "app_audit_events"("created_at");
CREATE UNIQUE INDEX "app_settings_key_key" ON "app_settings"("key");
CREATE INDEX "app_settings_updated_by_user_id_idx" ON "app_settings"("updated_by_user_id");

ALTER TABLE "app_document_template_versions" ADD CONSTRAINT "app_document_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "app_document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_send_batches" ADD CONSTRAINT "app_send_batches_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_send_requests" ADD CONSTRAINT "app_send_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "app_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_send_requests" ADD CONSTRAINT "app_send_requests_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "app_document_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_send_requests" ADD CONSTRAINT "app_send_requests_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "app_send_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_send_requests" ADD CONSTRAINT "app_send_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_send_attempts" ADD CONSTRAINT "app_send_attempts_send_request_id_fkey" FOREIGN KEY ("send_request_id") REFERENCES "app_send_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_signatures" ADD CONSTRAINT "app_signatures_send_request_id_fkey" FOREIGN KEY ("send_request_id") REFERENCES "app_send_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_signatures" ADD CONSTRAINT "app_signatures_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "app_employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_signatures" ADD CONSTRAINT "app_signatures_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "app_document_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_signature_events" ADD CONSTRAINT "app_signature_events_signature_id_fkey" FOREIGN KEY ("signature_id") REFERENCES "app_signatures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_audit_events" ADD CONSTRAINT "app_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_document_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_document_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_send_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_send_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_send_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_signatures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_signature_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_integration_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;
