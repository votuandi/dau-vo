-- Supervisor ("TT") votes for referee-command scoring. Additive only: every existing
-- round, match and vote keeps the previous behaviour (feature off, judge-cast votes).

ALTER TABLE "bracket_round_staffing"
  ADD COLUMN "supervisor_scoring_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "matches"
  ADD COLUMN "supervisor_scoring_enabled" BOOLEAN NOT NULL DEFAULT false;

-- The supervisor can only vote in referee-command scoring.
ALTER TABLE "bracket_round_staffing"
  ADD CONSTRAINT "bracket_round_staffing_supervisor_scoring_method_check"
  CHECK (NOT "supervisor_scoring_enabled" OR "scoring_method" = 'REFEREE_COMMAND');
ALTER TABLE "matches"
  ADD CONSTRAINT "matches_supervisor_scoring_method_check"
  CHECK (NOT "supervisor_scoring_enabled" OR "scoring_method" = 'REFEREE_COMMAND');

ALTER TABLE "judge_votes"
  ADD COLUMN "cast_by_supervisor" BOOLEAN NOT NULL DEFAULT false;

-- Provenance: an assignment vote is unchanged. A legacy (match session) vote carries a
-- judge slot when cast by a judge and none when cast by the supervisor.
ALTER TABLE "judge_votes" DROP CONSTRAINT "judge_votes_authorization_provenance_check";
ALTER TABLE "judge_votes"
  ADD CONSTRAINT "judge_votes_authorization_provenance_check"
  CHECK (
    ("assignment_id" IS NOT NULL AND "session_id" IS NULL AND "judge_slot" IS NULL)
    OR
    ("assignment_id" IS NULL AND "session_id" IS NOT NULL
      AND ("judge_slot" IS NULL) = "cast_by_supervisor")
  );

-- At most one supervisor vote per scoring window (changes update it in place).
CREATE UNIQUE INDEX "judge_votes_scoring_window_supervisor_key"
  ON "judge_votes" ("scoring_window_id")
  WHERE "cast_by_supervisor";

-- A judge vote must come from a judge; a supervisor vote from the match supervisor.
CREATE OR REPLACE FUNCTION "validate_judge_vote_authorization"() RETURNS trigger AS $$
DECLARE assignment_record "match_official_assignments"%ROWTYPE;
DECLARE session_record "match_sessions"%ROWTYPE;
DECLARE expected_role TEXT := CASE WHEN NEW."cast_by_supervisor" THEN 'SUPERVISOR' ELSE 'JUDGE' END;
BEGIN
  IF NEW."assignment_id" IS NOT NULL THEN
    SELECT * INTO assignment_record FROM "match_official_assignments" WHERE "id" = NEW."assignment_id";
    IF NOT FOUND OR assignment_record."match_id" IS DISTINCT FROM NEW."match_id"
       OR assignment_record."role"::TEXT <> expected_role THEN
      RAISE EXCEPTION 'Assignment vote must be authorized by a % assignment for this match', expected_role
        USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO session_record FROM "match_sessions" WHERE "id" = NEW."session_id";
    IF NOT FOUND OR session_record."match_id" IS DISTINCT FROM NEW."match_id"
       OR session_record."role"::TEXT <> expected_role
       OR session_record."judge_slot" IS DISTINCT FROM NEW."judge_slot" THEN
      RAISE EXCEPTION 'Legacy vote must be authorized by its % session for this match', expected_role
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
