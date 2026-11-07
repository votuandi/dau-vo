-- Standalone matches can be soft-deleted by their tournament admin. The row and
-- its scoring history stay for audit; every list and entry point filters on
-- deleted_at IS NULL.
ALTER TABLE "matches" ADD COLUMN "deleted_at" TIMESTAMPTZ(3);

CREATE INDEX "matches_tournament_id_deleted_at_idx" ON "matches"("tournament_id", "deleted_at");

ALTER TYPE "audit_event_type" ADD VALUE 'MATCH_DELETED';
