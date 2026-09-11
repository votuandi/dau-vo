CREATE TYPE "tournament_deletion_reason" AS ENUM ('ADMIN_SUBSCRIPTION_LAPSED');

ALTER TABLE "tournaments"
  ADD COLUMN "soft_deleted_at" TIMESTAMPTZ(3),
  ADD COLUMN "purge_after" TIMESTAMPTZ(3),
  ADD COLUMN "deletion_reason" "tournament_deletion_reason",
  ADD COLUMN "restored_at" TIMESTAMPTZ(3);

CREATE INDEX "tournaments_owner_soft_deleted_at_idx" ON "tournaments"("owner_user_id", "soft_deleted_at");
CREATE INDEX "tournaments_purge_after_idx" ON "tournaments"("purge_after");
CREATE INDEX "admin_entitlements_status_active_until_idx" ON "admin_entitlements"("status", "active_until");
CREATE INDEX "admin_entitlements_admin_access_ended_at_idx" ON "admin_entitlements"("admin_access_ended_at");
