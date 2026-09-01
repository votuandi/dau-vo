ALTER TYPE "audit_event_type" ADD VALUE 'ROUND_STARTED';
ALTER TYPE "audit_event_type" ADD VALUE 'ROUND_ENDED';
ALTER TYPE "audit_event_type" ADD VALUE 'MATCH_FINISHED';

CREATE INDEX "matches_status_idx" ON "matches"("status");
CREATE INDEX "rounds_ended_at_ends_at_idx" ON "rounds"("ended_at", "ends_at");
