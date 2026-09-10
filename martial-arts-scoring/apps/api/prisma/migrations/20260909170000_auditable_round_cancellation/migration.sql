ALTER TYPE "audit_event_type" ADD VALUE 'ROUND_RESULT_CANCELLED' AFTER 'ROUND_RESUMED';
ALTER TYPE "audit_event_type" ADD VALUE 'MATCH_RESULT_RESET' AFTER 'ROUND_RESULT_CANCELLED';

ALTER TABLE "rounds" ADD COLUMN "invalidated_at" TIMESTAMPTZ(3), ADD COLUMN "invalidated_by_audit_id" UUID;
ALTER TABLE "scoring_windows" ADD COLUMN "invalidated_at" TIMESTAMPTZ(3), ADD COLUMN "invalidated_by_audit_id" UUID;
ALTER TABLE "referee_votes" ADD COLUMN "invalidated_at" TIMESTAMPTZ(3), ADD COLUMN "invalidated_by_audit_id" UUID;
ALTER TABLE "score_events" ADD COLUMN "reverted_at" TIMESTAMPTZ(3), ADD COLUMN "reverted_by_audit_id" UUID;
ALTER TABLE "penalties" ADD COLUMN "reverted_at" TIMESTAMPTZ(3), ADD COLUMN "reverted_by_audit_id" UUID;

DROP INDEX "rounds_match_id_round_number_key";
CREATE INDEX "rounds_match_id_round_number_idx" ON "rounds"("match_id", "round_number");
CREATE UNIQUE INDEX "rounds_one_effective_attempt_per_number_key"
ON "rounds"("match_id", "round_number") WHERE "invalidated_at" IS NULL;

CREATE INDEX "rounds_invalidated_by_audit_id_idx" ON "rounds"("invalidated_by_audit_id");
CREATE INDEX "scoring_windows_invalidated_by_audit_id_idx" ON "scoring_windows"("invalidated_by_audit_id");
CREATE INDEX "referee_votes_invalidated_by_audit_id_idx" ON "referee_votes"("invalidated_by_audit_id");
CREATE INDEX "score_events_reverted_by_audit_id_idx" ON "score_events"("reverted_by_audit_id");
CREATE INDEX "penalties_reverted_by_audit_id_idx" ON "penalties"("reverted_by_audit_id");
