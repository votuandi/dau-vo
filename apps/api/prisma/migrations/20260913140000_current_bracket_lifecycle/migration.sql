-- A confirmed bracket remains current after completion.  Only an explicitly
-- cancelled bracket is historical, so there can be one ACTIVE or COMPLETED row.
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'BRACKET_CANCELLED';

DROP INDEX IF EXISTS "tournament_brackets_one_active_per_weight_class_key";
CREATE UNIQUE INDEX "tournament_brackets_one_current_per_weight_class_key"
  ON "tournament_brackets"("tournament_id", "weight_class_id")
  WHERE "status" IN ('ACTIVE', 'COMPLETED');
