-- Keep historical slot/session votes readable.  New votes are assignment
-- backed, so a five-referee match must not be constrained by the old enum.
ALTER TABLE "referee_votes" ALTER COLUMN "referee_slot" DROP NOT NULL;
ALTER TABLE "referee_votes" ALTER COLUMN "session_id" DROP NOT NULL;
ALTER TABLE "referee_votes" DROP CONSTRAINT IF EXISTS "referee_votes_scoring_window_id_referee_slot_key";
CREATE UNIQUE INDEX "referee_votes_legacy_window_slot_key"
  ON "referee_votes" ("scoring_window_id", "referee_slot")
  WHERE "assignment_id" IS NULL;
-- The assignment index was introduced by the officials foundation. Recreate
-- defensively so upgraded databases have the exact new-write guard.
CREATE UNIQUE INDEX IF NOT EXISTS "referee_votes_scoring_window_assignment_id_key"
  ON "referee_votes" ("scoring_window_id", "assignment_id")
  WHERE "assignment_id" IS NOT NULL;
