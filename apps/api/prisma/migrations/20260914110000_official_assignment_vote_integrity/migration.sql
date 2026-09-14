-- Corrective, forward-only integrity migration.  The preceding officials
-- migrations may already be deployed, so this migration never rewrites their
-- history or removes the legacy MatchSession/MatchAccessCode compatibility
-- path.

-- Every persisted bracket is confirmed.  Only active brackets can still
-- prepare a fixture, and the rules registry currently supports the one
-- ONE_ON_ONE_COMBAT sport group.  Deliberately fail closed if an active
-- bracket belongs to an unsupported group instead of silently inventing a
-- staffing policy for it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "tournament_brackets" b
    JOIN "tournaments" t ON t."id" = b."tournament_id"
    JOIN "sports" s ON s."id" = t."sport_id"
    JOIN "sport_groups" sg ON sg."id" = s."sport_group_id"
    WHERE b."status" = 'ACTIVE' AND sg."code" <> 'ONE_ON_ONE_COMBAT'
  ) THEN
    RAISE EXCEPTION 'Cannot backfill staffing for an unsupported active sport group';
  END IF;
END $$;

-- This is deterministic (rounds are generated from the stored round_count)
-- and safe to run again on an upgraded database.
INSERT INTO "bracket_round_staffing" (
  "bracket_id", "round_number", "required_referee_count"
)
SELECT b."id", rounds."round_number", 3
FROM "tournament_brackets" b
JOIN "tournaments" t ON t."id" = b."tournament_id"
JOIN "sports" s ON s."id" = t."sport_id"
JOIN "sport_groups" sg ON sg."id" = s."sport_group_id"
CROSS JOIN LATERAL generate_series(1, b."round_count") AS rounds("round_number")
WHERE b."status" = 'ACTIVE'
  AND sg."code" = 'ONE_ON_ONE_COMBAT'
ON CONFLICT ("bracket_id", "round_number") DO NOTHING;

-- A vote is either the retained legacy credential form or the new assignment
-- form, never a mixture.  Assignment votes cannot be silently orphaned:
-- historical assignments are retained, so RESTRICT is the appropriate action.
ALTER TABLE "referee_votes"
  DROP CONSTRAINT IF EXISTS "referee_votes_assignment_id_fkey";
ALTER TABLE "referee_votes"
  ADD CONSTRAINT "referee_votes_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "match_official_assignments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referee_votes"
  ADD CONSTRAINT "referee_votes_authorization_provenance_check"
  CHECK (
    ("assignment_id" IS NOT NULL AND "session_id" IS NULL AND "referee_slot" IS NULL)
    OR
    ("assignment_id" IS NULL AND "session_id" IS NOT NULL AND "referee_slot" IS NOT NULL)
  );

-- Retain the two partial uniqueness guards explicitly.  The legacy guard is
-- intentionally by slot; assignment-backed voting supports arbitrary odd
-- referee counts and is unique by assignment.
CREATE UNIQUE INDEX IF NOT EXISTS "referee_votes_legacy_window_slot_key"
  ON "referee_votes" ("scoring_window_id", "referee_slot")
  WHERE "assignment_id" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "referee_votes_scoring_window_assignment_id_key"
  ON "referee_votes" ("scoring_window_id", "assignment_id")
  WHERE "assignment_id" IS NOT NULL;

-- Assignment role/membership checks in the foundation migration establish the
-- official itself.  This replacement additionally binds a referee assignment
-- to the currently active inspector assignment that authorized it, in the same
-- match and tournament.  Inspector self-claims remain valid with no author.
CREATE OR REPLACE FUNCTION "validate_match_official_assignment"() RETURNS trigger AS $$
DECLARE
  official_record "tournament_officials"%ROWTYPE;
  inspector_assignment "match_official_assignments"%ROWTYPE;
BEGIN
  SELECT * INTO official_record FROM "tournament_officials" WHERE "id" = NEW."official_id";
  IF NOT FOUND
     OR official_record."tournament_id" IS DISTINCT FROM NEW."tournament_id"
     OR official_record."role" IS DISTINCT FROM NEW."role" THEN
    RAISE EXCEPTION 'Official role or tournament mismatch' USING ERRCODE = '23514';
  END IF;

  IF NEW."role" = 'INSPECTOR' THEN
    IF NEW."assigned_by_inspector_id" IS NOT NULL THEN
      RAISE EXCEPTION 'Inspector assignments cannot be inspector-authorized' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW."assigned_by_inspector_id" IS NULL THEN
      RAISE EXCEPTION 'Referee assignments require an active inspector authorizer' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO inspector_assignment
    FROM "match_official_assignments"
    WHERE "match_id" = NEW."match_id"
      AND "tournament_id" = NEW."tournament_id"
      AND "official_id" = NEW."assigned_by_inspector_id"
      AND "role" = 'INSPECTOR'
      AND "released_at" IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assigning inspector must actively own this match' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A foreign key alone cannot prove that a vote's session/assignment is for
-- this match or that it is a referee.  This trigger gives both provenance
-- forms the same database boundary, including raw SQL callers.
CREATE OR REPLACE FUNCTION "validate_referee_vote_authorization"() RETURNS trigger AS $$
DECLARE assignment_record "match_official_assignments"%ROWTYPE;
DECLARE session_record "match_sessions"%ROWTYPE;
BEGIN
  IF NEW."assignment_id" IS NOT NULL THEN
    SELECT * INTO assignment_record FROM "match_official_assignments" WHERE "id" = NEW."assignment_id";
    IF NOT FOUND
       OR assignment_record."match_id" IS DISTINCT FROM NEW."match_id"
       OR assignment_record."role" <> 'REFEREE' THEN
      RAISE EXCEPTION 'Assignment vote must be authorized by a referee assignment for this match' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO session_record FROM "match_sessions" WHERE "id" = NEW."session_id";
    IF NOT FOUND
       OR session_record."match_id" IS DISTINCT FROM NEW."match_id"
       OR session_record."role" <> 'REFEREE'
       OR session_record."referee_slot" IS DISTINCT FROM NEW."referee_slot" THEN
      RAISE EXCEPTION 'Legacy vote must be authorized by its referee session for this match' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "referee_votes_validate_authorization_trigger" ON "referee_votes";
CREATE TRIGGER "referee_votes_validate_authorization_trigger"
  BEFORE INSERT OR UPDATE ON "referee_votes"
  FOR EACH ROW EXECUTE FUNCTION "validate_referee_vote_authorization"();
