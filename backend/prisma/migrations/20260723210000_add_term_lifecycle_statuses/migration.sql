-- The enum values are committed separately from statements that use them.
-- PostgreSQL only allows a newly added enum value to be referenced after commit.
ALTER TYPE "app_send_request_status" ADD VALUE IF NOT EXISTS 'VIEWED';
ALTER TYPE "app_send_request_status" ADD VALUE IF NOT EXISTS 'SIGNED';
