CREATE TYPE "app_signature_provider" AS ENUM ('BITRIX', 'ZAPSIGN');

ALTER TABLE "app_signatures"
ADD COLUMN "provider" "app_signature_provider" NOT NULL DEFAULT 'BITRIX',
ADD COLUMN "provider_document_id" TEXT;

CREATE UNIQUE INDEX "app_signatures_provider_document_id_key"
ON "app_signatures"("provider_document_id");

CREATE INDEX "app_signatures_provider_status_idx"
ON "app_signatures"("provider", "status");
