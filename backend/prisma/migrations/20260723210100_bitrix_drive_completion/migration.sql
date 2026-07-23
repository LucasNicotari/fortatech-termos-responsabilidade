ALTER TABLE "app_signatures"
  ADD COLUMN "bitrix_drive_file_id" TEXT,
  ADD COLUMN "bitrix_drive_folder_id" TEXT,
  ADD COLUMN "bitrix_drive_detail_url" TEXT;

CREATE UNIQUE INDEX "app_signatures_bitrix_drive_file_id_key"
  ON "app_signatures"("bitrix_drive_file_id");

-- FortaDocs documents created before Drive archiving existed have a valid
-- signature and a private Supabase backup, but are not yet concluded.
UPDATE "app_signatures"
SET
  "status" = 'SIGNED'::"app_signature_status",
  "archive_status" = 'PENDING'::"app_archive_status",
  "archive_error" = NULL,
  "finished_at" = NULL,
  "archived_at" = NULL,
  "raw_status_code" = 'fortadocs-signed-awaiting-drive',
  "bitrix_stage" = 'Assinado; aguardando arquivamento no Drive do Bitrix24'
WHERE "provider" = 'FORTADOCS'::"app_signature_provider"
  AND "status" = 'FINISHED'::"app_signature_status"
  AND "signed_storage_path" IS NOT NULL;

UPDATE "app_send_requests" AS request
SET "status" = 'SIGNED'::"app_send_request_status"
WHERE EXISTS (
  SELECT 1
  FROM "app_signatures" AS signature
  WHERE signature."send_request_id" = request."id"
    AND signature."provider" = 'FORTADOCS'::"app_signature_provider"
    AND signature."status" = 'SIGNED'::"app_signature_status"
);
