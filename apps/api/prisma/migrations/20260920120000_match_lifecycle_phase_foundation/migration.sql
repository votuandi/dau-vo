-- MatchStatus is retained physically because it is the established round-phase
-- column. API contracts expose it as `phase`; renaming the PostgreSQL column
-- would add deployment risk without changing its authority.
ALTER TYPE "match_status" ADD VALUE IF NOT EXISTS 'AWAITING_RESULT_SAVE';

CREATE TYPE "match_lifecycle" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'SUSPENDED',
  'COMPLETED'
);

ALTER TABLE "matches"
  ADD COLUMN "lifecycle" "match_lifecycle",
  ADD COLUMN "suspended_at" TIMESTAMPTZ(3);

UPDATE "matches"
SET "lifecycle" = CASE
  WHEN "status" = 'WAITING' THEN 'NOT_STARTED'::"match_lifecycle"
  WHEN "status" = 'FINISHED' THEN 'COMPLETED'::"match_lifecycle"
  ELSE 'IN_PROGRESS'::"match_lifecycle"
END;

ALTER TABLE "matches"
  ALTER COLUMN "lifecycle" SET DEFAULT 'NOT_STARTED',
  ALTER COLUMN "lifecycle" SET NOT NULL,
  ADD CONSTRAINT "matches_completed_lifecycle_check" CHECK (
    "lifecycle" <> 'COMPLETED'
    OR ("status" = 'FINISHED' AND "finished_at" IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT "matches_not_started_lifecycle_check" CHECK (
    "lifecycle" <> 'NOT_STARTED'
    OR ("status" = 'WAITING' AND "started_at" IS NULL AND "current_round" IS NULL)
  ) NOT VALID,
  ADD CONSTRAINT "matches_suspended_timestamp_check" CHECK (
    ("lifecycle" = 'SUSPENDED') = ("suspended_at" IS NOT NULL)
  ) NOT VALID;

CREATE INDEX "matches_lifecycle_idx" ON "matches"("lifecycle");

-- The no-active-assignment invariant for SUSPENDED cannot be expressed as a
-- row CHECK because it spans match_official_assignments. The later exit
-- transition must release assignments under the existing match-first lock
-- order before setting SUSPENDED.
