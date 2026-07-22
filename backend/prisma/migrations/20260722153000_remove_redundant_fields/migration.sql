-- Remove fields and structures superseded by Bitrix identity and the current
-- one-at-a-time term workflow. Business documents and their history remain intact.
SET lock_timeout = '10s';

ALTER TABLE "app_users"
  DROP COLUMN IF EXISTS "password_hash";

ALTER TABLE "app_employees"
  DROP COLUMN IF EXISTS "empresa",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "invitation_status",
  DROP COLUMN IF EXISTS "accepted_at";

DROP TYPE IF EXISTS "app_employee_status";
DROP TYPE IF EXISTS "app_invitation_status";

ALTER TABLE "app_document_template_versions"
  DROP COLUMN IF EXISTS "bitrix_template_id";

ALTER TABLE "app_send_requests"
  DROP COLUMN IF EXISTS "batch_id",
  DROP COLUMN IF EXISTS "scheduled_at",
  DROP COLUMN IF EXISTS "company_signer_bitrix_id",
  DROP COLUMN IF EXISTS "responsible_bitrix_id";

DROP TABLE IF EXISTS "app_send_batches";
DROP TYPE IF EXISTS "app_send_batch_type";

ALTER TABLE "app_send_attempts"
  RENAME COLUMN "bitrix_response" TO "provider_response";

ALTER TABLE "app_webhook_events"
  DROP COLUMN IF EXISTS "processed";
