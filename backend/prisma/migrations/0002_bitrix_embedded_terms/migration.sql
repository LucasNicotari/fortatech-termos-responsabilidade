ALTER TYPE "app_send_request_status" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "app_send_request_status" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "app_send_request_status" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "app_send_request_status" ADD VALUE IF NOT EXISTS 'DECLINED';

ALTER TYPE "app_signature_status" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
ALTER TYPE "app_signature_status" ADD VALUE IF NOT EXISTS 'DECLINED';

CREATE TYPE "app_archive_status" AS ENUM ('NOT_REQUIRED', 'PENDING', 'ARCHIVED', 'FAILED');

ALTER TABLE "app_users"
  ALTER COLUMN "password_hash" DROP NOT NULL,
  ADD COLUMN "bitrix_user_id" TEXT;

ALTER TABLE "app_document_template_versions"
  ADD COLUMN "source_storage_path" TEXT,
  ADD COLUMN "source_sha256" TEXT;

ALTER TABLE "app_send_requests"
  ADD COLUMN "document_data" JSONB,
  ADD COLUMN "document_file_name" TEXT,
  ADD COLUMN "unsigned_storage_path" TEXT,
  ADD COLUMN "unsigned_sha256" TEXT,
  ADD COLUMN "employee_snapshot" JSONB,
  ADD COLUMN "company_signer_bitrix_id" TEXT,
  ADD COLUMN "responsible_bitrix_id" TEXT,
  ADD COLUMN "locked_at" TIMESTAMP(3);

ALTER TABLE "app_signatures"
  ADD COLUMN "bitrix_document_uid" TEXT,
  ADD COLUMN "signer_member_uid" TEXT,
  ADD COLUMN "assignee_member_uid" TEXT,
  ADD COLUMN "raw_status_code" TEXT,
  ADD COLUMN "archive_status" "app_archive_status" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "archive_error" TEXT,
  ADD COLUMN "signed_storage_path" TEXT,
  ADD COLUMN "signed_sha256" TEXT,
  ADD COLUMN "signed_file_size" INTEGER,
  ADD COLUMN "bitrix_safe_document_id" TEXT,
  ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE TABLE "app_send_request_equipment" (
  "id" TEXT NOT NULL,
  "send_request_id" TEXT NOT NULL,
  "item_number" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "serial_number" TEXT,
  "asset_tag" TEXT,
  "accessories" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_send_request_equipment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "app_send_request_equipment_send_request_id_fkey"
    FOREIGN KEY ("send_request_id") REFERENCES "app_send_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "app_send_request_equipment_quantity_check" CHECK ("quantity" > 0)
);

CREATE TABLE "app_bitrix_installations" (
  "id" TEXT NOT NULL,
  "member_id" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "client_endpoint" TEXT NOT NULL,
  "server_endpoint" TEXT NOT NULL,
  "access_token_encrypted" TEXT NOT NULL,
  "refresh_token_encrypted" TEXT NOT NULL,
  "application_token_hash" TEXT,
  "scope" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_bitrix_installations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_bitrix_launch_codes" (
  "id" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_bitrix_launch_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "app_bitrix_launch_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "app_users_bitrix_user_id_key" ON "app_users"("bitrix_user_id");
CREATE UNIQUE INDEX "app_signatures_bitrix_document_uid_key" ON "app_signatures"("bitrix_document_uid");
CREATE INDEX "app_signatures_archive_status_idx" ON "app_signatures"("archive_status");
CREATE UNIQUE INDEX "app_send_request_equipment_send_request_id_item_number_key"
  ON "app_send_request_equipment"("send_request_id", "item_number");
CREATE INDEX "app_send_request_equipment_send_request_id_idx" ON "app_send_request_equipment"("send_request_id");
CREATE UNIQUE INDEX "app_bitrix_installations_member_id_key" ON "app_bitrix_installations"("member_id");
CREATE INDEX "app_bitrix_installations_domain_idx" ON "app_bitrix_installations"("domain");
CREATE UNIQUE INDEX "app_bitrix_launch_codes_code_hash_key" ON "app_bitrix_launch_codes"("code_hash");
CREATE INDEX "app_bitrix_launch_codes_user_id_idx" ON "app_bitrix_launch_codes"("user_id");
CREATE INDEX "app_bitrix_launch_codes_expires_at_idx" ON "app_bitrix_launch_codes"("expires_at");
CREATE UNIQUE INDEX "app_webhook_events_source_external_event_id_key"
  ON "app_webhook_events"("source", "external_event_id");

ALTER TABLE "app_send_request_equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_bitrix_installations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_bitrix_launch_codes" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE
          "app_users", "app_employees", "app_document_templates", "app_document_template_versions",
          "app_send_batches", "app_send_requests", "app_send_attempts", "app_signatures",
          "app_signature_events", "app_webhook_events", "app_integration_logs", "app_audit_events",
          "app_settings", "app_send_request_equipment", "app_bitrix_installations", "app_bitrix_launch_codes"
        FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END $$;
