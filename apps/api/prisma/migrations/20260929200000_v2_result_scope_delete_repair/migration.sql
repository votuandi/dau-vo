-- Forward-only repair for the role-rename migration. That migration may have
-- reached an environment, so retain its checksum and restore the trigger's
-- explicit DELETE path here.
CREATE OR REPLACE FUNCTION "validate_v2_match_result_scope"() RETURNS trigger AS $$
DECLARE row_match_id UUID; row_color "athlete_color"; row_stage "round_stage"; row_attempt SMALLINT; actor_role "tournament_official_role";
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'faults' THEN
    SELECT "match_id", "stage", "attempt_number" INTO row_match_id, row_stage, row_attempt FROM "rounds" WHERE "id" = NEW."round_id";
    IF row_match_id IS DISTINCT FROM NEW."match_id" OR NOT FOUND THEN RAISE EXCEPTION 'Fault round must belong to match' USING ERRCODE='23514'; END IF;
    SELECT "match_id" INTO row_match_id FROM "match_athletes" WHERE "id" = NEW."athlete_id";
    IF row_match_id IS DISTINCT FROM NEW."match_id" OR NOT FOUND THEN RAISE EXCEPTION 'Fault athlete must belong to match' USING ERRCODE='23514'; END IF;
    IF NEW."recording_supervisor_assignment_id" IS NOT NULL THEN
      SELECT "match_id", "role" INTO row_match_id, actor_role FROM "match_official_assignments" WHERE "id"=NEW."recording_supervisor_assignment_id";
      IF row_match_id IS DISTINCT FROM NEW."match_id" OR actor_role <> 'SUPERVISOR' OR NOT FOUND THEN RAISE EXCEPTION 'Fault assignment must be this match supervisor' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT "match_id", "role" INTO row_match_id, actor_role FROM "match_sessions" WHERE "id"=NEW."recording_supervisor_session_id";
      IF row_match_id IS DISTINCT FROM NEW."match_id" OR actor_role <> 'SUPERVISOR' OR NOT FOUND THEN RAISE EXCEPTION 'Fault session must be this match supervisor' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'round_athlete_results' THEN
    SELECT "match_id" INTO row_match_id FROM "rounds" WHERE "id"=NEW."round_id";
    IF row_match_id IS DISTINCT FROM NEW."match_id" OR NOT FOUND THEN RAISE EXCEPTION 'Round result round must belong to match' USING ERRCODE='23514'; END IF;
    SELECT "match_id" INTO row_match_id FROM "match_athletes" WHERE "id"=NEW."athlete_id";
    IF row_match_id IS DISTINCT FROM NEW."match_id" OR NOT FOUND THEN RAISE EXCEPTION 'Round result athlete must belong to match' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'match_appeals' THEN
    SELECT "match_id", "stage", "attempt_number" INTO row_match_id, row_stage, row_attempt FROM "rounds" WHERE "id"=NEW."source_round_id";
    IF row_match_id IS DISTINCT FROM NEW."match_id" OR NOT FOUND OR (NEW."scope"='REGULATION' AND (row_stage <> 'REGULATION' OR row_attempt <> 0)) OR (NEW."scope"='OVERTIME' AND (row_stage <> 'OVERTIME' OR row_attempt <> NEW."attempt_number")) THEN RAISE EXCEPTION 'Appeal source descriptor must match its scope' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'match_appeal_adjustments' THEN
    SELECT a."match_id" INTO row_match_id FROM "match_appeals" a WHERE a."id"=NEW."appeal_id";
    IF NOT FOUND THEN RAISE EXCEPTION 'Appeal missing' USING ERRCODE='23514'; END IF;
    IF (SELECT "match_id" FROM "match_athletes" WHERE "id"=NEW."athlete_id") IS DISTINCT FROM row_match_id THEN RAISE EXCEPTION 'Appeal adjustment athlete must belong to appeal match' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'match_outcomes' THEN
    SELECT "match_id", "color" INTO row_match_id, row_color FROM "match_athletes" WHERE "id"=NEW."winner_athlete_id";
    IF row_match_id IS DISTINCT FROM NEW."match_id" OR row_color IS DISTINCT FROM NEW."winner_color" OR NOT FOUND THEN RAISE EXCEPTION 'Outcome winner must belong to match and match color' USING ERRCODE='23514'; END IF;
    IF NEW."source_appeal_id" IS NOT NULL AND (SELECT "match_id" FROM "match_appeals" WHERE "id"=NEW."source_appeal_id") IS DISTINCT FROM NEW."match_id" THEN RAISE EXCEPTION 'Outcome appeal must belong to match' USING ERRCODE='23514'; END IF;
    IF NEW."source_overtime_round_id" IS NOT NULL THEN SELECT "match_id", "stage" INTO row_match_id, row_stage FROM "rounds" WHERE "id"=NEW."source_overtime_round_id"; IF row_match_id IS DISTINCT FROM NEW."match_id" OR row_stage <> 'OVERTIME' OR NOT FOUND THEN RAISE EXCEPTION 'Outcome overtime round must belong to match' USING ERRCODE='23514'; END IF; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
