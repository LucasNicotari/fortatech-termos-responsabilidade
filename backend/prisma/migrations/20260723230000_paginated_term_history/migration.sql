-- Keep the visible history query bounded and ordered as the table grows.
CREATE INDEX "app_send_requests_removed_at_created_at_id_idx"
ON "app_send_requests"("removed_at", "created_at", "id");
