ALTER TABLE "app_send_requests"
  ADD COLUMN "removed_at" TIMESTAMP(3),
  ADD COLUMN "removed_by_user_id" TEXT;

ALTER TABLE "app_send_requests"
  ADD CONSTRAINT "app_send_requests_removed_by_user_id_fkey"
  FOREIGN KEY ("removed_by_user_id")
  REFERENCES "app_users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "app_send_requests_removed_at_idx"
  ON "app_send_requests"("removed_at");

CREATE INDEX "app_send_requests_removed_by_user_id_idx"
  ON "app_send_requests"("removed_by_user_id");

UPDATE "app_send_requests" AS request
SET "status" = 'COMPLETED'::"app_send_request_status"
WHERE EXISTS (
  SELECT 1
  FROM "app_signatures" AS signature
  WHERE signature."send_request_id" = request."id"
    AND signature."status" IN ('SIGNED', 'FINISHED')
);
