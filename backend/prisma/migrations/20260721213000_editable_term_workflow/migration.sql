CREATE TABLE "app_term_workflow_participants" (
  "id" TEXT NOT NULL,
  "bitrix_user_id" TEXT NOT NULL,
  "can_operate" BOOLEAN NOT NULL DEFAULT false,
  "receive_notifications" BOOLEAN NOT NULL DEFAULT false,
  "updated_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "app_term_workflow_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_term_workflow_participants_bitrix_user_id_key"
ON "app_term_workflow_participants"("bitrix_user_id");

CREATE INDEX "app_term_workflow_participants_can_operate_idx"
ON "app_term_workflow_participants"("can_operate");

CREATE INDEX "app_term_workflow_participants_receive_notifications_idx"
ON "app_term_workflow_participants"("receive_notifications");

CREATE INDEX "app_term_workflow_participants_updated_by_user_id_idx"
ON "app_term_workflow_participants"("updated_by_user_id");

ALTER TABLE "app_term_workflow_participants"
ADD CONSTRAINT "app_term_workflow_participants_updated_by_user_id_fkey"
FOREIGN KEY ("updated_by_user_id") REFERENCES "app_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_term_workflow_participants" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name TEXT;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE "app_term_workflow_participants" FROM %I', role_name);
    END IF;
  END LOOP;
END $$;

INSERT INTO "app_term_workflow_participants"
  ("id", "bitrix_user_id", "can_operate", "receive_notifications", "created_at", "updated_at")
VALUES
  ('workflow-8243', '8243', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workflow-8465', '8465', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workflow-7718', '7718', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('workflow-8137', '8137', false, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("bitrix_user_id") DO NOTHING;
