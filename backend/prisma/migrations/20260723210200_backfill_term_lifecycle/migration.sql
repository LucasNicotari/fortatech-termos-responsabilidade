UPDATE "app_send_requests" AS request
SET "status" = 'VIEWED'::"app_send_request_status"
WHERE EXISTS (
  SELECT 1
  FROM "app_signatures" AS signature
  WHERE signature."send_request_id" = request."id"
    AND signature."status" = 'VIEWED'::"app_signature_status"
);

UPDATE "app_send_requests" AS request
SET "status" = 'SIGNED'::"app_send_request_status"
WHERE EXISTS (
  SELECT 1
  FROM "app_signatures" AS signature
  WHERE signature."send_request_id" = request."id"
    AND signature."status" = 'SIGNED'::"app_signature_status"
);

UPDATE "app_send_requests" AS request
SET "status" = 'COMPLETED'::"app_send_request_status"
WHERE EXISTS (
  SELECT 1
  FROM "app_signatures" AS signature
  WHERE signature."send_request_id" = request."id"
    AND signature."status" = 'FINISHED'::"app_signature_status"
    AND signature."archive_status" = 'ARCHIVED'::"app_archive_status"
);
