-- Forward-only semantic rename. PostgreSQL enum VALUE renames preserve every
-- stored value in place: REFEREE is now JUDGE and INSPECTOR is now SUPERVISOR.
-- This migration is intentionally not idempotent: Prisma records a migration
-- only after its transaction commits, and a partially applied schema must be
-- investigated rather than silently treated as current.

ALTER TYPE "match_role" RENAME VALUE 'REFEREE' TO 'JUDGE';
ALTER TYPE "match_role" RENAME VALUE 'INSPECTOR' TO 'SUPERVISOR';
ALTER TYPE "tournament_official_role" RENAME VALUE 'REFEREE' TO 'JUDGE';
ALTER TYPE "tournament_official_role" RENAME VALUE 'INSPECTOR' TO 'SUPERVISOR';
ALTER TYPE "match_access_role" RENAME VALUE 'REFEREE_1' TO 'JUDGE_1';
ALTER TYPE "match_access_role" RENAME VALUE 'REFEREE_2' TO 'JUDGE_2';
ALTER TYPE "match_access_role" RENAME VALUE 'REFEREE_3' TO 'JUDGE_3';
ALTER TYPE "match_access_role" RENAME VALUE 'INSPECTOR' TO 'SUPERVISOR';
ALTER TYPE "referee_slot" RENAME VALUE 'REFEREE_1' TO 'JUDGE_1';
ALTER TYPE "referee_slot" RENAME VALUE 'REFEREE_2' TO 'JUDGE_2';
ALTER TYPE "referee_slot" RENAME VALUE 'REFEREE_3' TO 'JUDGE_3';
ALTER TYPE "score_event_type" RENAME VALUE 'REFEREE_POINT' TO 'JUDGE_POINT';
ALTER TYPE "match_official_assignment_release_reason"
  RENAME VALUE 'INSPECTOR_RELEASED' TO 'SUPERVISOR_RELEASED';
ALTER TYPE "audit_event_type"
  RENAME VALUE 'MATCH_INSPECTOR_CLAIMED' TO 'MATCH_SUPERVISOR_CLAIMED';

-- Type/table/column renames preserve OIDs, rows, keys and foreign keys.
ALTER TYPE "referee_slot" RENAME TO "judge_slot";
ALTER TABLE "referee_votes" RENAME TO "judge_votes";
ALTER TABLE "matches" RENAME COLUMN "required_referee_count" TO "required_judge_count";
ALTER TABLE "bracket_round_staffing" RENAME COLUMN "required_referee_count" TO "required_judge_count";
ALTER TABLE "match_sessions" RENAME COLUMN "referee_slot" TO "judge_slot";
ALTER TABLE "match_official_assignments" RENAME COLUMN "referee_position" TO "judge_position";
ALTER TABLE "match_official_assignments" RENAME COLUMN "assigned_by_inspector_id" TO "assigned_by_supervisor_id";
ALTER TABLE "judge_votes" RENAME COLUMN "referee_slot" TO "judge_slot";
ALTER TABLE "faults" RENAME COLUMN "recording_inspector_assignment_id" TO "recording_supervisor_assignment_id";
ALTER TABLE "faults" RENAME COLUMN "recording_inspector_session_id" TO "recording_supervisor_session_id";
ALTER TABLE "match_appeals" RENAME COLUMN "completed_inspector_assignment_id" TO "completed_supervisor_assignment_id";
ALTER TABLE "match_appeals" RENAME COLUMN "completed_inspector_session_id" TO "completed_supervisor_session_id";
ALTER TABLE "match_outcomes" RENAME COLUMN "published_inspector_assignment_id" TO "published_supervisor_assignment_id";
ALTER TABLE "match_outcomes" RENAME COLUMN "published_inspector_session_id" TO "published_supervisor_session_id";
ALTER TABLE "match_result_decisions" RENAME COLUMN "selected_inspector_assignment_id" TO "selected_supervisor_assignment_id";
ALTER TABLE "match_result_decisions" RENAME COLUMN "selected_inspector_session_id" TO "selected_supervisor_session_id";
ALTER TABLE "round_athlete_results" RENAME COLUMN "referee_points" TO "judge_points";
ALTER TABLE "match_appeal_adjustments" RENAME COLUMN "base_referee_score" TO "base_judge_score";

-- Make surviving database object names describe their canonical role.
ALTER TABLE "matches" RENAME CONSTRAINT "matches_required_referee_count_positive_check" TO "matches_required_judge_count_positive_check";
ALTER TABLE "bracket_round_staffing" RENAME CONSTRAINT "bracket_round_staffing_required_referee_count_positive_check" TO "bracket_round_staffing_required_judge_count_positive_check";
ALTER INDEX "match_official_assignments_one_active_inspector_per_match_key" RENAME TO "match_official_assignments_one_active_supervisor_per_match_key";
ALTER INDEX "match_official_assignments_one_active_referee_position_per_match_key" RENAME TO "match_official_assignments_one_active_judge_position_per_match_key";
ALTER TABLE "match_official_assignments" RENAME CONSTRAINT "match_official_assignments_assigned_by_inspector_id_fkey" TO "match_official_assignments_assigned_by_supervisor_id_fkey";
ALTER TABLE "judge_votes" RENAME CONSTRAINT "referee_votes_pkey" TO "judge_votes_pkey";
ALTER INDEX "referee_votes_scoring_window_id_idx" RENAME TO "judge_votes_scoring_window_id_idx";
ALTER INDEX "referee_votes_match_id_idx" RENAME TO "judge_votes_match_id_idx";
ALTER INDEX "referee_votes_session_id_idx" RENAME TO "judge_votes_session_id_idx";
ALTER INDEX "referee_votes_assignment_id_idx" RENAME TO "judge_votes_assignment_id_idx";
ALTER INDEX "referee_votes_legacy_window_slot_key" RENAME TO "judge_votes_legacy_window_slot_key";
ALTER INDEX "referee_votes_scoring_window_assignment_id_key" RENAME TO "judge_votes_scoring_window_assignment_id_key";
DO $$
BEGIN
  IF to_regclass('public.referee_votes_invalidated_by_audit_id_idx') IS NOT NULL THEN
    ALTER INDEX "referee_votes_invalidated_by_audit_id_idx" RENAME TO "judge_votes_invalidated_by_audit_id_idx";
  END IF;
END $$;
ALTER TABLE "judge_votes" RENAME CONSTRAINT "referee_votes_scoring_window_id_fkey" TO "judge_votes_scoring_window_id_fkey";
ALTER TABLE "judge_votes" RENAME CONSTRAINT "referee_votes_match_id_fkey" TO "judge_votes_match_id_fkey";
ALTER TABLE "judge_votes" RENAME CONSTRAINT "referee_votes_session_id_fkey" TO "judge_votes_session_id_fkey";
ALTER TABLE "judge_votes" RENAME CONSTRAINT "referee_votes_assignment_id_fkey" TO "judge_votes_assignment_id_fkey";
ALTER TABLE "judge_votes" RENAME CONSTRAINT "referee_votes_authorization_provenance_check" TO "judge_votes_authorization_provenance_check";
ALTER TABLE "faults" RENAME CONSTRAINT "faults_recording_inspector_assignment_id_fkey" TO "faults_recording_supervisor_assignment_id_fkey";
ALTER TABLE "faults" RENAME CONSTRAINT "faults_recording_inspector_session_id_fkey" TO "faults_recording_supervisor_session_id_fkey";
ALTER TABLE "faults" RENAME CONSTRAINT "faults_actor_provenance_check" TO "faults_supervisor_actor_provenance_check";
ALTER TABLE "match_appeals" RENAME CONSTRAINT "match_appeals_completed_inspector_assignment_id_fkey" TO "match_appeals_completed_supervisor_assignment_id_fkey";
ALTER TABLE "match_appeals" RENAME CONSTRAINT "match_appeals_completed_inspector_session_id_fkey" TO "match_appeals_completed_supervisor_session_id_fkey";
ALTER TABLE "match_appeals" RENAME CONSTRAINT "match_appeals_actor_provenance_check" TO "match_appeals_supervisor_actor_provenance_check";
ALTER TABLE "match_outcomes" RENAME CONSTRAINT "match_outcomes_published_inspector_assignment_id_fkey" TO "match_outcomes_published_supervisor_assignment_id_fkey";
ALTER TABLE "match_outcomes" RENAME CONSTRAINT "match_outcomes_published_inspector_session_id_fkey" TO "match_outcomes_published_supervisor_session_id_fkey";
ALTER TABLE "match_outcomes" RENAME CONSTRAINT "match_outcomes_actor_provenance_check" TO "match_outcomes_supervisor_actor_provenance_check";

-- Replace trigger bodies because their SQL text and references are not changed
-- by ALTER ... RENAME. The trigger itself remains attached to its table.
CREATE OR REPLACE FUNCTION "validate_match_official_assignment"() RETURNS trigger AS $$
DECLARE
  official_record "tournament_officials"%ROWTYPE;
  supervisor_assignment "match_official_assignments"%ROWTYPE;
BEGIN
  SELECT * INTO official_record FROM "tournament_officials" WHERE "id" = NEW."official_id";
  IF NOT FOUND OR official_record."tournament_id" IS DISTINCT FROM NEW."tournament_id"
     OR official_record."role" IS DISTINCT FROM NEW."role" THEN
    RAISE EXCEPTION 'Official role or tournament mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW."role" = 'SUPERVISOR' THEN
    IF NEW."assigned_by_supervisor_id" IS NOT NULL THEN
      RAISE EXCEPTION 'Supervisor assignments cannot be supervisor-authorized' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW."assigned_by_supervisor_id" IS NULL THEN
      RAISE EXCEPTION 'Judge assignments require an active supervisor authorizer' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO supervisor_assignment FROM "match_official_assignments"
    WHERE "match_id" = NEW."match_id" AND "tournament_id" = NEW."tournament_id"
      AND "official_id" = NEW."assigned_by_supervisor_id" AND "role" = 'SUPERVISOR'
      AND "released_at" IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Assigning supervisor must actively own this match' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER FUNCTION "validate_referee_vote_authorization"() RENAME TO "validate_judge_vote_authorization";
CREATE OR REPLACE FUNCTION "validate_judge_vote_authorization"() RETURNS trigger AS $$
DECLARE assignment_record "match_official_assignments"%ROWTYPE;
DECLARE session_record "match_sessions"%ROWTYPE;
BEGIN
  IF NEW."assignment_id" IS NOT NULL THEN
    SELECT * INTO assignment_record FROM "match_official_assignments" WHERE "id" = NEW."assignment_id";
    IF NOT FOUND OR assignment_record."match_id" IS DISTINCT FROM NEW."match_id"
       OR assignment_record."role" <> 'JUDGE' THEN
      RAISE EXCEPTION 'Assignment vote must be authorized by a judge assignment for this match' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO session_record FROM "match_sessions" WHERE "id" = NEW."session_id";
    IF NOT FOUND OR session_record."match_id" IS DISTINCT FROM NEW."match_id"
       OR session_record."role" <> 'JUDGE'
       OR session_record."judge_slot" IS DISTINCT FROM NEW."judge_slot" THEN
      RAISE EXCEPTION 'Legacy vote must be authorized by its judge session for this match' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
ALTER TRIGGER "referee_votes_validate_authorization_trigger" ON "judge_votes"
  RENAME TO "judge_votes_validate_authorization_trigger";

-- The V2 scope trigger refers to supervisor provenance columns and must be
-- replaced after those columns move. Existing trigger bindings are retained.
CREATE OR REPLACE FUNCTION "validate_v2_match_result_scope"() RETURNS trigger AS $$
DECLARE row_match_id UUID; row_color "athlete_color"; row_stage "round_stage"; row_attempt SMALLINT; actor_role "tournament_official_role";
BEGIN
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

-- Audit metadata is the only known role-bearing JSONB shape: services write
-- `role`, nested `before.role`, and nested `after.role`. Transform only those
-- keys and the enum values, leaving prose and all other user JSON untouched.
CREATE OR REPLACE FUNCTION "rename_official_role_metadata"(value JSONB) RETURNS JSONB AS $$
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    RETURN (
      SELECT jsonb_object_agg(
        entry.key,
        CASE WHEN entry.key = 'role' AND entry.value = '"REFEREE"'::jsonb THEN '"JUDGE"'::jsonb
             WHEN entry.key = 'role' AND entry.value = '"INSPECTOR"'::jsonb THEN '"SUPERVISOR"'::jsonb
             ELSE "rename_official_role_metadata"(entry.value) END
      ) FROM jsonb_each(value) AS entry
    );
  ELSIF jsonb_typeof(value) = 'array' THEN
    RETURN (SELECT jsonb_agg("rename_official_role_metadata"(item)) FROM jsonb_array_elements(value) AS item);
  END IF;
  RETURN value;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
UPDATE "audit_logs" SET "metadata" = "rename_official_role_metadata"("metadata")
WHERE "metadata" IS NOT NULL
  AND ("metadata" @> '{"role":"REFEREE"}'::jsonb OR "metadata" @> '{"role":"INSPECTOR"}'::jsonb
       OR "metadata" @> '{"before":{"role":"REFEREE"}}'::jsonb OR "metadata" @> '{"before":{"role":"INSPECTOR"}}'::jsonb
       OR "metadata" @> '{"after":{"role":"REFEREE"}}'::jsonb OR "metadata" @> '{"after":{"role":"INSPECTOR"}}'::jsonb);
DROP FUNCTION "rename_official_role_metadata"(JSONB);
