-- Preserve all existing matches while removing the redundant pre-start lifecycle.
ALTER TYPE "match_lifecycle" RENAME VALUE 'NOT_STARTED' TO 'READY';

-- A previously claimed match is already being operated by its supervisor/team.
UPDATE "matches" AS m
SET "lifecycle" = 'IN_PROGRESS'
WHERE m."lifecycle" = 'READY'
  AND EXISTS (
    SELECT 1 FROM "match_official_assignments" AS a
    WHERE a."match_id" = m."id"
      AND a."role" = 'SUPERVISOR'
      AND a."released_at" IS NULL
  );
