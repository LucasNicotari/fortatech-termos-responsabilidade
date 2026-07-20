-- CreateIndex
CREATE INDEX "app_send_requests_requested_by_user_id_idx" ON "app_send_requests"("requested_by_user_id");

-- Application tables are server-only. Revoke existing and future Data API grants
-- while preserving direct PostgreSQL access for the Prisma migration/application role.
DO $$
DECLARE
  role_name TEXT;
BEGIN
  -- Prisma does not create its migration history table inside shadow databases.
  -- Protect it when present without breaking future `prisma migrate dev` runs.
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
  END IF;

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
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

      IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
        EXECUTE format('REVOKE ALL ON TABLE "_prisma_migrations" FROM %I', role_name);
      END IF;

      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
          REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
          REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM %I',
        role_name
      );
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
          REVOKE EXECUTE ON FUNCTIONS FROM %I',
        role_name
      );

      -- PostgreSQL 17 introduced MAINTAIN as a separately grantable table
      -- privilege; PostgreSQL 16 must not parse this statement.
      IF current_setting('server_version_num')::INTEGER >= 170000 THEN
        EXECUTE format(
          'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
            REVOKE MAINTAIN ON TABLES FROM %I',
          role_name
        );
      END IF;
    END IF;
  END LOOP;
END $$;
