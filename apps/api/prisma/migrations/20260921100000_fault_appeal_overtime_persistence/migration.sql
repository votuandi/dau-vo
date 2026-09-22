-- V2 is additive. Existing matches keep LEGACY_SCORE_PENALTY_V1 so no live or
-- completed match is silently reinterpreted under the new fault/appeal rules.
ALTER TYPE "match_status" ADD VALUE IF NOT EXISTS 'REGULATION_APPEAL';
ALTER TYPE "match_status" ADD VALUE IF NOT EXISTS 'OVERTIME_READY';
ALTER TYPE "match_status" ADD VALUE IF NOT EXISTS 'OVERTIME_RUNNING';
ALTER TYPE "match_status" ADD VALUE IF NOT EXISTS 'OVERTIME_PAUSED';
ALTER TYPE "match_status" ADD VALUE IF NOT EXISTS 'OVERTIME_APPEAL';
ALTER TYPE "match_status" ADD VALUE IF NOT EXISTS 'OVERTIME_TIEBREAK_DECISION';
ALTER TYPE "match_status" ADD VALUE IF NOT EXISTS 'RESULT_PUBLICATION_READY';

CREATE TYPE "round_stage" AS ENUM ('REGULATION', 'OVERTIME');
CREATE TYPE "match_rules_version" AS ENUM ('LEGACY_SCORE_PENALTY_V1', 'FAULT_APPEAL_OVERTIME_V2');
CREATE TYPE "match_appeal_scope" AS ENUM ('REGULATION', 'OVERTIME');
CREATE TYPE "match_appeal_status" AS ENUM ('COMPLETED', 'INVALIDATED');
CREATE TYPE "match_outcome_method" AS ENUM ('REGULATION_SCORE', 'OVERTIME_SCORE', 'MANUAL_AFTER_OVERTIME_TIE');

ALTER TABLE "matches" ADD COLUMN "rules_version" "match_rules_version" NOT NULL DEFAULT 'LEGACY_SCORE_PENALTY_V1';
-- The preceding default backfills safely; only matches created after this
-- migration receive V2 semantics. Existing live matches require the reviewed
-- operational cutover and are never changed by SQL alone.
ALTER TABLE "matches" ALTER COLUMN "rules_version" SET DEFAULT 'FAULT_APPEAL_OVERTIME_V2';

ALTER TABLE "rounds" ADD COLUMN "stage" "round_stage" NOT NULL DEFAULT 'REGULATION';
ALTER TABLE "rounds" ADD COLUMN "attempt_number" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_descriptor_check" CHECK (
  ("stage" = 'REGULATION' AND "attempt_number" = 0 AND "round_number" IN (1, 2)) OR
  ("stage" = 'OVERTIME' AND "attempt_number" >= 1 AND "round_number" = 1)
);
-- Historical cancellation/reset records can share a regulation round number.
-- Retain them, while permitting only one current descriptor. The previous
-- descriptor index cannot stay because regulation round 1 and overtime round
-- 1 are both valid active descriptors for the same match history.
DROP INDEX "rounds_one_effective_attempt_per_number_key";
CREATE UNIQUE INDEX "rounds_match_id_stage_attempt_round_number_key"
ON "rounds"("match_id", "stage", "attempt_number", "round_number")
WHERE "invalidated_at" IS NULL;
CREATE UNIQUE INDEX "rounds_id_match_id_key" ON "rounds"("id", "match_id");

CREATE TABLE "faults" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "match_id" UUID NOT NULL,
  "athlete_id" UUID NOT NULL, "round_id" UUID NOT NULL,
  "recording_inspector_assignment_id" UUID, "recording_inspector_session_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invalidated_at" TIMESTAMPTZ(3), "invalidated_by_audit_id" UUID,
  CONSTRAINT "faults_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "faults_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "faults_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "match_athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "faults_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "faults_recording_inspector_assignment_id_fkey" FOREIGN KEY ("recording_inspector_assignment_id") REFERENCES "match_official_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "faults_recording_inspector_session_id_fkey" FOREIGN KEY ("recording_inspector_session_id") REFERENCES "match_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "faults_invalidated_by_audit_id_fkey" FOREIGN KEY ("invalidated_by_audit_id") REFERENCES "audit_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "faults_actor_provenance_check" CHECK (("recording_inspector_assignment_id" IS NULL) <> ("recording_inspector_session_id" IS NULL)),
  CONSTRAINT "faults_invalidation_audit_check" CHECK (("invalidated_at" IS NULL) = ("invalidated_by_audit_id" IS NULL))
);
CREATE INDEX "faults_match_id_invalidated_at_idx" ON "faults"("match_id", "invalidated_at");
CREATE INDEX "faults_round_id_invalidated_at_idx" ON "faults"("round_id", "invalidated_at");
CREATE INDEX "faults_athlete_id_invalidated_at_idx" ON "faults"("athlete_id", "invalidated_at");

CREATE TABLE "round_athlete_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "match_id" UUID NOT NULL, "round_id" UUID NOT NULL, "athlete_id" UUID NOT NULL,
  "referee_points" INTEGER NOT NULL, "fault_count" INTEGER NOT NULL,
  "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "invalidated_at" TIMESTAMPTZ(3), "invalidated_by_audit_id" UUID,
  CONSTRAINT "round_athlete_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "round_athlete_results_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "round_athlete_results_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "round_athlete_results_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "match_athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "round_athlete_results_invalidated_by_audit_id_fkey" FOREIGN KEY ("invalidated_by_audit_id") REFERENCES "audit_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "round_athlete_results_round_id_athlete_id_key" UNIQUE ("round_id", "athlete_id"),
  CONSTRAINT "round_athlete_results_fault_count_nonnegative_check" CHECK ("fault_count" >= 0),
  CONSTRAINT "round_athlete_results_invalidation_audit_check" CHECK (("invalidated_at" IS NULL) = ("invalidated_by_audit_id" IS NULL))
);
CREATE INDEX "round_athlete_results_match_id_invalidated_at_idx" ON "round_athlete_results"("match_id", "invalidated_at");

CREATE TABLE "match_appeals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "match_id" UUID NOT NULL,
  "scope" "match_appeal_scope" NOT NULL, "attempt_number" SMALLINT NOT NULL DEFAULT 0,
  "status" "match_appeal_status" NOT NULL DEFAULT 'COMPLETED', "source_round_id" UUID NOT NULL,
  "completed_inspector_assignment_id" UUID, "completed_inspector_session_id" UUID,
  "completed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "idempotency_key" VARCHAR(255),
  "invalidated_at" TIMESTAMPTZ(3), "invalidated_by_audit_id" UUID,
  CONSTRAINT "match_appeals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_appeals_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_appeals_source_round_id_fkey" FOREIGN KEY ("source_round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_appeals_completed_inspector_assignment_id_fkey" FOREIGN KEY ("completed_inspector_assignment_id") REFERENCES "match_official_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_appeals_completed_inspector_session_id_fkey" FOREIGN KEY ("completed_inspector_session_id") REFERENCES "match_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_appeals_invalidated_by_audit_id_fkey" FOREIGN KEY ("invalidated_by_audit_id") REFERENCES "audit_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_appeals_scope_attempt_check" CHECK (("scope" = 'REGULATION' AND "attempt_number" = 0) OR ("scope" = 'OVERTIME' AND "attempt_number" >= 1)),
  CONSTRAINT "match_appeals_actor_provenance_check" CHECK (("completed_inspector_assignment_id" IS NULL) <> ("completed_inspector_session_id" IS NULL)),
  CONSTRAINT "match_appeals_invalidation_audit_check" CHECK (("invalidated_at" IS NULL) = ("invalidated_by_audit_id" IS NULL)),
  CONSTRAINT "match_appeals_status_invalidation_check" CHECK (("status" = 'INVALIDATED') = ("invalidated_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "match_appeals_idempotency_key_key" ON "match_appeals"("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE UNIQUE INDEX "match_appeals_one_valid_completed_scope_attempt_key" ON "match_appeals"("match_id", "scope", "attempt_number") WHERE "status" = 'COMPLETED' AND "invalidated_at" IS NULL;
CREATE INDEX "match_appeals_match_scope_attempt_invalidated_idx" ON "match_appeals"("match_id", "scope", "attempt_number", "invalidated_at");

CREATE TABLE "match_appeal_rounds" (
  "appeal_id" UUID NOT NULL, "round_id" UUID NOT NULL,
  CONSTRAINT "match_appeal_rounds_pkey" PRIMARY KEY ("appeal_id", "round_id"),
  CONSTRAINT "match_appeal_rounds_appeal_id_fkey" FOREIGN KEY ("appeal_id") REFERENCES "match_appeals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_appeal_rounds_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "match_appeal_rounds_round_id_idx" ON "match_appeal_rounds"("round_id");

CREATE TABLE "match_appeal_adjustments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "appeal_id" UUID NOT NULL, "athlete_id" UUID NOT NULL,
  "base_referee_score" INTEGER NOT NULL, "bonus_points" INTEGER NOT NULL DEFAULT 0,
  "penalty_points" INTEGER NOT NULL DEFAULT 0, "final_score" INTEGER NOT NULL,
  CONSTRAINT "match_appeal_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_appeal_adjustments_appeal_id_fkey" FOREIGN KEY ("appeal_id") REFERENCES "match_appeals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_appeal_adjustments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "match_athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_appeal_adjustments_appeal_id_athlete_id_key" UNIQUE ("appeal_id", "athlete_id"),
  CONSTRAINT "match_appeal_adjustments_final_score_check" CHECK ("final_score" = "base_referee_score" + "bonus_points" - "penalty_points")
);

CREATE TABLE "match_outcomes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "match_id" UUID NOT NULL, "winner_athlete_id" UUID NOT NULL,
  "winner_color" "athlete_color" NOT NULL, "method" "match_outcome_method" NOT NULL,
  "source_appeal_id" UUID, "source_overtime_round_id" UUID,
  "published_inspector_assignment_id" UUID, "published_inspector_session_id" UUID,
  "published_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "snapshot" JSONB NOT NULL,
  CONSTRAINT "match_outcomes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_outcomes_match_id_key" UNIQUE ("match_id"),
  CONSTRAINT "match_outcomes_source_appeal_id_key" UNIQUE ("source_appeal_id"),
  CONSTRAINT "match_outcomes_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_outcomes_winner_athlete_id_fkey" FOREIGN KEY ("winner_athlete_id") REFERENCES "match_athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_outcomes_source_appeal_id_fkey" FOREIGN KEY ("source_appeal_id") REFERENCES "match_appeals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_outcomes_source_overtime_round_id_fkey" FOREIGN KEY ("source_overtime_round_id") REFERENCES "rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_outcomes_published_inspector_assignment_id_fkey" FOREIGN KEY ("published_inspector_assignment_id") REFERENCES "match_official_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_outcomes_published_inspector_session_id_fkey" FOREIGN KEY ("published_inspector_session_id") REFERENCES "match_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_outcomes_actor_provenance_check" CHECK (("published_inspector_assignment_id" IS NULL) <> ("published_inspector_session_id" IS NULL)),
  CONSTRAINT "match_outcomes_method_source_check" CHECK (
    ("method" = 'REGULATION_SCORE' AND "source_appeal_id" IS NOT NULL AND "source_overtime_round_id" IS NULL) OR
    ("method" = 'OVERTIME_SCORE' AND "source_appeal_id" IS NOT NULL AND "source_overtime_round_id" IS NOT NULL) OR
    ("method" = 'MANUAL_AFTER_OVERTIME_TIE' AND "source_overtime_round_id" IS NOT NULL)
  )
);

-- PostgreSQL FKs cannot prove that independently referenced IDs belong to the
-- same match. These triggers enforce that boundary for all writers, including
-- future raw SQL maintenance scripts.
CREATE OR REPLACE FUNCTION "validate_v2_match_result_scope"() RETURNS trigger AS $$
DECLARE row_match_id UUID; row_color "athlete_color"; row_stage "round_stage"; row_attempt SMALLINT; actor_role "tournament_official_role";
BEGIN
  IF TG_TABLE_NAME = 'faults' THEN
    SELECT "match_id", "stage", "attempt_number" INTO row_match_id, row_stage, row_attempt FROM "rounds" WHERE "id" = NEW."round_id";
    IF row_match_id IS DISTINCT FROM NEW."match_id" OR NOT FOUND THEN RAISE EXCEPTION 'Fault round must belong to match' USING ERRCODE='23514'; END IF;
    SELECT "match_id" INTO row_match_id FROM "match_athletes" WHERE "id" = NEW."athlete_id";
    IF row_match_id IS DISTINCT FROM NEW."match_id" OR NOT FOUND THEN RAISE EXCEPTION 'Fault athlete must belong to match' USING ERRCODE='23514'; END IF;
    IF NEW."recording_inspector_assignment_id" IS NOT NULL THEN
      SELECT "match_id", "role" INTO row_match_id, actor_role FROM "match_official_assignments" WHERE "id"=NEW."recording_inspector_assignment_id";
      IF row_match_id IS DISTINCT FROM NEW."match_id" OR actor_role <> 'INSPECTOR' OR NOT FOUND THEN RAISE EXCEPTION 'Fault assignment must be this match inspector' USING ERRCODE='23514'; END IF;
    ELSE
      SELECT "match_id", "role" INTO row_match_id, actor_role FROM "match_sessions" WHERE "id"=NEW."recording_inspector_session_id";
      IF row_match_id IS DISTINCT FROM NEW."match_id" OR actor_role <> 'INSPECTOR' OR NOT FOUND THEN RAISE EXCEPTION 'Fault session must be this match inspector' USING ERRCODE='23514'; END IF;
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
CREATE TRIGGER "faults_validate_scope_trigger" BEFORE INSERT OR UPDATE ON "faults" FOR EACH ROW EXECUTE FUNCTION "validate_v2_match_result_scope"();
CREATE TRIGGER "round_athlete_results_validate_scope_trigger" BEFORE INSERT OR UPDATE ON "round_athlete_results" FOR EACH ROW EXECUTE FUNCTION "validate_v2_match_result_scope"();
CREATE TRIGGER "match_appeals_validate_scope_trigger" BEFORE INSERT OR UPDATE ON "match_appeals" FOR EACH ROW EXECUTE FUNCTION "validate_v2_match_result_scope"();
CREATE TRIGGER "match_appeal_adjustments_validate_scope_trigger" BEFORE INSERT OR UPDATE ON "match_appeal_adjustments" FOR EACH ROW EXECUTE FUNCTION "validate_v2_match_result_scope"();
CREATE TRIGGER "match_outcomes_validate_scope_trigger" BEFORE INSERT OR UPDATE ON "match_outcomes" FOR EACH ROW EXECUTE FUNCTION "validate_v2_match_result_scope"();

CREATE OR REPLACE FUNCTION "validate_match_appeal_round_scope"() RETURNS trigger AS $$
DECLARE appeal_match UUID; appeal_scope "match_appeal_scope"; appeal_attempt SMALLINT; row_match UUID; row_stage "round_stage"; row_attempt SMALLINT;
BEGIN
  SELECT "match_id", "scope", "attempt_number" INTO appeal_match, appeal_scope, appeal_attempt FROM "match_appeals" WHERE "id"=NEW."appeal_id";
  SELECT "match_id", "stage", "attempt_number" INTO row_match, row_stage, row_attempt FROM "rounds" WHERE "id"=NEW."round_id";
  IF NOT FOUND OR row_match IS DISTINCT FROM appeal_match OR (appeal_scope='REGULATION' AND (row_stage <> 'REGULATION' OR row_attempt <> 0)) OR (appeal_scope='OVERTIME' AND (row_stage <> 'OVERTIME' OR row_attempt <> appeal_attempt)) THEN RAISE EXCEPTION 'Appeal source round must belong to appeal match and descriptor scope' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "match_appeal_rounds_validate_scope_trigger" BEFORE INSERT OR UPDATE ON "match_appeal_rounds" FOR EACH ROW EXECUTE FUNCTION "validate_match_appeal_round_scope"();

-- Deferred validation allows transactional creation of an appeal followed by
-- its two immutable athlete snapshots, but rejects every committed partial or
-- cross-match appeal.
CREATE OR REPLACE FUNCTION "validate_completed_appeal_adjustments"() RETURNS trigger AS $$
DECLARE appeal_id_value UUID; expected_count INTEGER; actual_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    appeal_id_value := OLD."appeal_id";
  ELSIF TG_TABLE_NAME = 'match_appeals' THEN
    appeal_id_value := NEW."id";
  ELSE
    appeal_id_value := NEW."appeal_id";
  END IF;
  SELECT count(*) INTO expected_count FROM "match_athletes" ma JOIN "match_appeals" a ON a."match_id"=ma."match_id" WHERE a."id"=appeal_id_value;
  SELECT count(*) INTO actual_count FROM "match_appeal_adjustments" WHERE "appeal_id"=appeal_id_value;
  IF EXISTS (SELECT 1 FROM "match_appeals" WHERE "id"=appeal_id_value AND "status"='COMPLETED' AND "invalidated_at" IS NULL) AND (expected_count <> 2 OR actual_count <> 2) THEN RAISE EXCEPTION 'A completed appeal requires exactly two match-athlete adjustments' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "match_appeals_adjustments_complete_trigger" AFTER INSERT OR UPDATE ON "match_appeals" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_completed_appeal_adjustments"();
CREATE CONSTRAINT TRIGGER "match_appeal_adjustments_complete_trigger" AFTER INSERT OR UPDATE OR DELETE ON "match_appeal_adjustments" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_completed_appeal_adjustments"();
