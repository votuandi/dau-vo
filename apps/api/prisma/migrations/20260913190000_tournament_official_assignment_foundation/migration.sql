-- Additive foundation for tournament-level officials. Legacy match credentials
-- and sessions remain intact and continue to power the live scoring path.
CREATE TYPE "tournament_official_role" AS ENUM ('REFEREE', 'INSPECTOR');
CREATE TYPE "match_official_assignment_release_reason" AS ENUM (
  'MATCH_FINISHED', 'OPERATIONAL_CANCELLED', 'RESET_REQUIRES_SETUP',
  'REPLACED', 'OFFICIAL_DEACTIVATED'
);

ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'TOURNAMENT_OFFICIAL_CREATED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'TOURNAMENT_OFFICIAL_UPDATED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'TOURNAMENT_OFFICIAL_DEACTIVATED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'TOURNAMENT_OFFICIAL_PASSCODE_REGENERATED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'MATCH_INSPECTOR_CLAIMED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'MATCH_OFFICIAL_ASSIGNMENT_CONFIRMED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'MATCH_OFFICIAL_ASSIGNMENT_REPLACED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'MATCH_OFFICIAL_ASSIGNMENT_RELEASED';
ALTER TYPE "audit_event_type" ADD VALUE IF NOT EXISTS 'BRACKET_ROUND_STAFFING_UPDATED';

ALTER TABLE "tournaments" ADD COLUMN "public_code" VARCHAR(32);
-- Deterministic base-30 encoding of the existing UUID ordering. This is safe
-- for upgrade deployments and uses the same ambiguous-character-free alphabet.
WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "id") - 1 AS ordinal FROM "tournaments"
), encoded AS (
  SELECT "id", 'T' || (
    SELECT string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ', ((ordinal / power(30, p))::bigint % 30)::integer + 1, 1), '' ORDER BY p DESC)
    FROM generate_series(0, 8) AS p
  ) AS public_code
  FROM numbered
)
UPDATE "tournaments" t SET "public_code" = e.public_code FROM encoded e WHERE t."id" = e."id";
ALTER TABLE "tournaments" ALTER COLUMN "public_code" SET NOT NULL;
CREATE UNIQUE INDEX "tournaments_public_code_key" ON "tournaments"("public_code");

ALTER TABLE "matches" ADD COLUMN "required_referee_count" SMALLINT NOT NULL DEFAULT 3;
ALTER TABLE "matches" ADD CONSTRAINT "matches_required_referee_count_positive_check" CHECK ("required_referee_count" > 0);

CREATE TABLE "bracket_round_staffing" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "bracket_id" UUID NOT NULL,
  "round_number" SMALLINT NOT NULL, "required_referee_count" SMALLINT NOT NULL DEFAULT 3,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bracket_round_staffing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bracket_round_staffing_required_referee_count_positive_check" CHECK ("required_referee_count" > 0),
  CONSTRAINT "bracket_round_staffing_bracket_id_fkey" FOREIGN KEY ("bracket_id") REFERENCES "tournament_brackets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bracket_round_staffing_bracket_id_round_number_key" UNIQUE ("bracket_id", "round_number")
);

CREATE TABLE "tournament_officials" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "tournament_id" UUID NOT NULL,
  "role" "tournament_official_role" NOT NULL, "name" VARCHAR(255) NOT NULL,
  "normalized_name" VARCHAR(255) NOT NULL, "passcode_hash" VARCHAR(255) NOT NULL,
  "passcode_lookup_digest" CHAR(64) NOT NULL, "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deactivated_at" TIMESTAMPTZ(3), "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournament_officials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tournament_officials_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tournament_officials_id_tournament_id_key" UNIQUE ("id", "tournament_id"),
  CONSTRAINT "tournament_officials_tournament_id_role_normalized_name_key" UNIQUE ("tournament_id", "role", "normalized_name"),
  CONSTRAINT "tournament_officials_tournament_id_passcode_lookup_digest_key" UNIQUE ("tournament_id", "passcode_lookup_digest")
);
CREATE INDEX "tournament_officials_tournament_id_role_is_active_idx" ON "tournament_officials"("tournament_id", "role", "is_active");

CREATE TABLE "tournament_official_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "official_id" UUID NOT NULL,
  "device_id" VARCHAR(255) NOT NULL, "token_hash" VARCHAR(255) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMPTZ(3), "expires_at" TIMESTAMPTZ(3), "revoked_at" TIMESTAMPTZ(3),
  CONSTRAINT "tournament_official_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tournament_official_sessions_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "tournament_official_sessions_official_id_fkey" FOREIGN KEY ("official_id") REFERENCES "tournament_officials"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tournament_official_sessions_official_id_active_idx" ON "tournament_official_sessions"("official_id", "active");

CREATE TABLE "match_official_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "match_id" UUID NOT NULL,
  "tournament_id" UUID NOT NULL, "official_id" UUID NOT NULL,
  "role" "tournament_official_role" NOT NULL, "referee_position" SMALLINT,
  "assigned_by_inspector_id" UUID, "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "released_at" TIMESTAMPTZ(3), "release_reason" "match_official_assignment_release_reason",
  CONSTRAINT "match_official_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "match_official_assignments_match_tournament_id_fkey" FOREIGN KEY ("match_id", "tournament_id") REFERENCES "matches"("id", "tournament_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_official_assignments_official_tournament_id_fkey" FOREIGN KEY ("official_id", "tournament_id") REFERENCES "tournament_officials"("id", "tournament_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_official_assignments_assigned_by_inspector_id_fkey" FOREIGN KEY ("assigned_by_inspector_id") REFERENCES "tournament_officials"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "match_official_assignments_role_position_check" CHECK (("role" = 'REFEREE' AND "referee_position" > 0) OR ("role" = 'INSPECTOR' AND "referee_position" IS NULL)),
  CONSTRAINT "match_official_assignments_release_state_check" CHECK (("released_at" IS NULL AND "release_reason" IS NULL) OR ("released_at" IS NOT NULL AND "release_reason" IS NOT NULL))
);
CREATE INDEX "match_official_assignments_match_id_released_at_idx" ON "match_official_assignments"("match_id", "released_at");
CREATE INDEX "match_official_assignments_official_id_released_at_idx" ON "match_official_assignments"("official_id", "released_at");
CREATE UNIQUE INDEX "match_official_assignments_one_active_official_key" ON "match_official_assignments"("official_id") WHERE "released_at" IS NULL;
CREATE UNIQUE INDEX "match_official_assignments_one_active_inspector_per_match_key" ON "match_official_assignments"("match_id") WHERE "released_at" IS NULL AND "role" = 'INSPECTOR';
CREATE UNIQUE INDEX "match_official_assignments_one_active_referee_position_per_match_key" ON "match_official_assignments"("match_id", "referee_position") WHERE "released_at" IS NULL AND "role" = 'REFEREE';

CREATE OR REPLACE FUNCTION "validate_match_official_assignment"() RETURNS trigger AS $$
DECLARE official_role "tournament_official_role"; inspector_record "tournament_officials"%ROWTYPE;
BEGIN
  SELECT "role" INTO official_role FROM "tournament_officials" WHERE "id" = NEW."official_id";
  IF official_role IS DISTINCT FROM NEW."role" THEN RAISE EXCEPTION 'Official role mismatch' USING ERRCODE = '23514'; END IF;
  IF NEW."assigned_by_inspector_id" IS NOT NULL THEN
    SELECT * INTO inspector_record FROM "tournament_officials" WHERE "id" = NEW."assigned_by_inspector_id";
    IF inspector_record."tournament_id" IS DISTINCT FROM NEW."tournament_id" OR inspector_record."role" <> 'INSPECTOR' THEN
      RAISE EXCEPTION 'Assigning inspector must belong to the tournament and have inspector role' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "match_official_assignments_validate_membership_trigger" BEFORE INSERT OR UPDATE ON "match_official_assignments" FOR EACH ROW EXECUTE FUNCTION "validate_match_official_assignment"();

ALTER TABLE "match_sessions" ADD COLUMN "official_session_id" UUID, ADD COLUMN "assignment_id" UUID;
ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_official_session_id_fkey" FOREIGN KEY ("official_session_id") REFERENCES "tournament_official_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "match_sessions" ADD CONSTRAINT "match_sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "match_official_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "match_sessions_official_session_id_idx" ON "match_sessions"("official_session_id");
CREATE INDEX "match_sessions_assignment_id_idx" ON "match_sessions"("assignment_id");

ALTER TABLE "referee_votes" ADD COLUMN "assignment_id" UUID;
ALTER TABLE "referee_votes" ADD CONSTRAINT "referee_votes_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "match_official_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "referee_votes_assignment_id_idx" ON "referee_votes"("assignment_id");
CREATE UNIQUE INDEX "referee_votes_scoring_window_assignment_id_key" ON "referee_votes"("scoring_window_id", "assignment_id") WHERE "assignment_id" IS NOT NULL;

ALTER TABLE "audit_logs" ADD COLUMN "official_session_id" UUID;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_official_session_id_fkey" FOREIGN KEY ("official_session_id") REFERENCES "tournament_official_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "audit_logs_official_session_id_idx" ON "audit_logs"("official_session_id");
