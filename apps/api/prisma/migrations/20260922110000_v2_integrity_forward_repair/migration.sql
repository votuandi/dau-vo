-- Forward-only repair for the additive V2 release.  Do not edit the deployed
-- persistence migration: databases may already have recorded it.
ALTER TABLE "match_appeal_adjustments"
  ADD CONSTRAINT "match_appeal_adjustments_points_range_check"
  CHECK (
    "bonus_points" >= 0 AND "bonus_points" <= 100 AND
    "penalty_points" >= 0 AND "penalty_points" <= 100 AND
    "base_referee_score" >= 0 AND "final_score" >= 0
  );

-- Replaces the original trigger function.  Session role is match_role, not
-- tournament_official_role; compare it as text instead of selecting it into
-- an incompatible enum variable.  DELETE is intentionally a no-op validation
-- path and returns OLD, which makes trigger behavior explicit for all ops.
CREATE OR REPLACE FUNCTION "validate_v2_match_result_scope"() RETURNS trigger AS $$
DECLARE row_match_id UUID; row_color "athlete_color"; row_stage "round_stage"; row_attempt SMALLINT; assignment_role "tournament_official_role"; session_role TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_TABLE_NAME = 'faults' THEN
    SELECT "match_id" INTO row_match_id FROM "rounds" WHERE "id"=NEW."round_id";
    IF NOT FOUND OR row_match_id IS DISTINCT FROM NEW."match_id" THEN RAISE EXCEPTION 'Fault round must belong to match' USING ERRCODE='23514'; END IF;
    SELECT "match_id" INTO row_match_id FROM "match_athletes" WHERE "id"=NEW."athlete_id";
    IF NOT FOUND OR row_match_id IS DISTINCT FROM NEW."match_id" THEN RAISE EXCEPTION 'Fault athlete must belong to match' USING ERRCODE='23514'; END IF;
    IF NEW."recording_inspector_assignment_id" IS NOT NULL THEN
      SELECT "match_id", "role" INTO row_match_id, assignment_role FROM "match_official_assignments" WHERE "id"=NEW."recording_inspector_assignment_id";
      IF NOT FOUND OR row_match_id IS DISTINCT FROM NEW."match_id" OR assignment_role <> 'INSPECTOR' THEN RAISE EXCEPTION 'Fault assignment must be this match inspector' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT "match_id", "role"::text INTO row_match_id, session_role FROM "match_sessions" WHERE "id"=NEW."recording_inspector_session_id";
      IF NOT FOUND OR row_match_id IS DISTINCT FROM NEW."match_id" OR session_role <> 'INSPECTOR' THEN RAISE EXCEPTION 'Fault session must be this match inspector' USING ERRCODE='23514'; END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'round_athlete_results' THEN
    SELECT "match_id" INTO row_match_id FROM "rounds" WHERE "id"=NEW."round_id"; IF NOT FOUND OR row_match_id IS DISTINCT FROM NEW."match_id" THEN RAISE EXCEPTION 'Round result round must belong to match' USING ERRCODE='23514'; END IF;
    SELECT "match_id" INTO row_match_id FROM "match_athletes" WHERE "id"=NEW."athlete_id"; IF NOT FOUND OR row_match_id IS DISTINCT FROM NEW."match_id" THEN RAISE EXCEPTION 'Round result athlete must belong to match' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'match_appeals' THEN
    SELECT "match_id", "stage", "attempt_number" INTO row_match_id,row_stage,row_attempt FROM "rounds" WHERE "id"=NEW."source_round_id";
    IF NOT FOUND OR row_match_id IS DISTINCT FROM NEW."match_id" OR (NEW."scope"='REGULATION' AND (row_stage <> 'REGULATION' OR row_attempt <> 0)) OR (NEW."scope"='OVERTIME' AND (row_stage <> 'OVERTIME' OR row_attempt <> NEW."attempt_number")) THEN RAISE EXCEPTION 'Appeal source descriptor must match its scope' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'match_appeal_adjustments' THEN
    SELECT "match_id" INTO row_match_id FROM "match_appeals" WHERE "id"=NEW."appeal_id"; IF NOT FOUND THEN RAISE EXCEPTION 'Appeal missing' USING ERRCODE='23514'; END IF;
    SELECT "match_id" INTO row_match_id FROM "match_athletes" WHERE "id"=NEW."athlete_id"; IF NOT FOUND OR row_match_id IS DISTINCT FROM (SELECT "match_id" FROM "match_appeals" WHERE "id"=NEW."appeal_id") THEN RAISE EXCEPTION 'Appeal adjustment athlete must belong to appeal match' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME = 'match_outcomes' THEN
    SELECT "match_id", "color" INTO row_match_id,row_color FROM "match_athletes" WHERE "id"=NEW."winner_athlete_id"; IF NOT FOUND OR row_match_id IS DISTINCT FROM NEW."match_id" OR row_color IS DISTINCT FROM NEW."winner_color" THEN RAISE EXCEPTION 'Outcome winner must belong to match and match color' USING ERRCODE='23514'; END IF;
    IF NEW."source_appeal_id" IS NOT NULL AND (SELECT "match_id" FROM "match_appeals" WHERE "id"=NEW."source_appeal_id") IS DISTINCT FROM NEW."match_id" THEN RAISE EXCEPTION 'Outcome appeal must belong to match' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "faults_validate_scope_trigger" ON "faults";
DROP TRIGGER IF EXISTS "round_athlete_results_validate_scope_trigger" ON "round_athlete_results";
DROP TRIGGER IF EXISTS "match_appeals_validate_scope_trigger" ON "match_appeals";
DROP TRIGGER IF EXISTS "match_appeal_adjustments_validate_scope_trigger" ON "match_appeal_adjustments";
DROP TRIGGER IF EXISTS "match_outcomes_validate_scope_trigger" ON "match_outcomes";
CREATE TRIGGER "faults_validate_scope_trigger" BEFORE INSERT OR UPDATE OR DELETE ON "faults" FOR EACH ROW EXECUTE FUNCTION "validate_v2_match_result_scope"();
CREATE TRIGGER "round_athlete_results_validate_scope_trigger" BEFORE INSERT OR UPDATE OR DELETE ON "round_athlete_results" FOR EACH ROW EXECUTE FUNCTION "validate_v2_match_result_scope"();
CREATE TRIGGER "match_appeals_validate_scope_trigger" BEFORE INSERT OR UPDATE OR DELETE ON "match_appeals" FOR EACH ROW EXECUTE FUNCTION "validate_v2_match_result_scope"();
CREATE TRIGGER "match_appeal_adjustments_validate_scope_trigger" BEFORE INSERT OR UPDATE OR DELETE ON "match_appeal_adjustments" FOR EACH ROW EXECUTE FUNCTION "validate_v2_match_result_scope"();
CREATE TRIGGER "match_outcomes_validate_scope_trigger" BEFORE INSERT OR UPDATE OR DELETE ON "match_outcomes" FOR EACH ROW EXECUTE FUNCTION "validate_v2_match_result_scope"();

-- Query shapes used by match-state projections and invalidation scans.
CREATE INDEX IF NOT EXISTS "round_athlete_results_round_id_valid_idx" ON "round_athlete_results"("round_id") WHERE "invalidated_at" IS NULL;
CREATE INDEX IF NOT EXISTS "faults_match_round_valid_idx" ON "faults"("match_id", "round_id") WHERE "invalidated_at" IS NULL;
