-- Internal FortaDocs signing inside Bitrix24, with scoped invitations and
-- per-request notification recipients. Existing terms and launch codes remain valid.
SET lock_timeout = '10s';

ALTER TYPE "app_signature_provider" ADD VALUE IF NOT EXISTS 'FORTADOCS';

DO $$
BEGIN
  CREATE TYPE "app_signature_method" AS ENUM ('TYPED', 'DRAWN', 'UPLOADED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "app_send_request_notification_recipients" (
  "id" TEXT NOT NULL,
  "send_request_id" TEXT NOT NULL,
  "bitrix_user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_send_request_notification_recipients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "app_send_request_notification_recipients_send_request_id_fkey"
    FOREIGN KEY ("send_request_id") REFERENCES "app_send_requests"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_send_request_notification_recipients_send_request_id_bitrix_user_id_key"
  ON "app_send_request_notification_recipients"("send_request_id", "bitrix_user_id");
CREATE INDEX IF NOT EXISTS "app_send_request_notification_recipients_send_request_id_idx"
  ON "app_send_request_notification_recipients"("send_request_id");
CREATE INDEX IF NOT EXISTS "app_send_request_notification_recipients_bitrix_user_id_idx"
  ON "app_send_request_notification_recipients"("bitrix_user_id");

CREATE TABLE IF NOT EXISTS "app_signing_invitations" (
  "id" TEXT NOT NULL,
  "signature_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "bitrix_user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "opened_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "signature_method" "app_signature_method",
  "signature_image_sha256" TEXT,
  "chat_message_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_signing_invitations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "app_signing_invitations_signature_id_fkey"
    FOREIGN KEY ("signature_id") REFERENCES "app_signatures"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_signing_invitations_signature_id_key"
  ON "app_signing_invitations"("signature_id");
CREATE UNIQUE INDEX IF NOT EXISTS "app_signing_invitations_token_hash_key"
  ON "app_signing_invitations"("token_hash");
CREATE INDEX IF NOT EXISTS "app_signing_invitations_bitrix_user_id_idx"
  ON "app_signing_invitations"("bitrix_user_id");
CREATE INDEX IF NOT EXISTS "app_signing_invitations_expires_at_idx"
  ON "app_signing_invitations"("expires_at");
CREATE INDEX IF NOT EXISTS "app_signing_invitations_completed_at_idx"
  ON "app_signing_invitations"("completed_at");

ALTER TABLE "app_bitrix_launch_codes"
  ALTER COLUMN "user_id" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "signing_invitation_id" TEXT;

ALTER TABLE "app_bitrix_launch_codes"
  ADD CONSTRAINT "app_bitrix_launch_codes_signing_invitation_id_fkey"
  FOREIGN KEY ("signing_invitation_id") REFERENCES "app_signing_invitations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "app_bitrix_launch_codes_signing_invitation_id_idx"
  ON "app_bitrix_launch_codes"("signing_invitation_id");

ALTER TABLE "app_bitrix_launch_codes"
  ADD CONSTRAINT "app_bitrix_launch_codes_single_subject_check"
  CHECK (
    ("user_id" IS NOT NULL AND "signing_invitation_id" IS NULL)
    OR ("user_id" IS NULL AND "signing_invitation_id" IS NOT NULL)
  );

ALTER TABLE "app_send_request_notification_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_signing_invitations" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "app_send_request_notification_recipients" FROM anon, authenticated;
REVOKE ALL ON TABLE "app_signing_invitations" FROM anon, authenticated;
