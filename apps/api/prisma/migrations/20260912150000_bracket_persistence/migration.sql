-- Durable, confirmed single-elimination brackets. Preview state deliberately has
-- no table: it remains an authenticated, short-lived application value.
CREATE TYPE "bracket_status" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "bracket_fixture_status" AS ENUM ('PENDING_PARTICIPANTS', 'READY', 'MATCH_PREPARED', 'AWAITING_WINNER', 'COMPLETED');

ALTER TYPE "audit_event_type" ADD VALUE 'BRACKET_CONFIRMED';
ALTER TYPE "audit_event_type" ADD VALUE 'BRACKET_MATCH_PREPARED';
ALTER TYPE "audit_event_type" ADD VALUE 'BRACKET_WINNER_ADVANCED';
ALTER TYPE "audit_event_type" ADD VALUE 'BRACKET_WINNER_MANUALLY_DECIDED';
ALTER TYPE "audit_event_type" ADD VALUE 'BRACKET_WINNER_RETRACTED';
ALTER TYPE "audit_event_type" ADD VALUE 'BRACKET_COMPLETED';

CREATE TABLE "tournament_brackets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tournament_id" UUID NOT NULL,
  "weight_class_id" UUID NOT NULL,
  "status" "bracket_status" NOT NULL DEFAULT 'ACTIVE',
  "athlete_count" INTEGER NOT NULL,
  "bracket_size" INTEGER NOT NULL,
  "round_count" SMALLINT NOT NULL,
  "confirmation_key" VARCHAR(255) NOT NULL,
  "confirmed_by_user_id" UUID,
  "confirmed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournament_brackets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tournament_brackets_confirmation_key_key" UNIQUE ("confirmation_key"),
  CONSTRAINT "tournament_brackets_id_tournament_id_key" UNIQUE ("id", "tournament_id"),
  CONSTRAINT "tournament_brackets_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tournament_brackets_weight_class_id_fkey" FOREIGN KEY ("tournament_id", "weight_class_id") REFERENCES "tournament_weight_classes"("tournament_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tournament_brackets_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "tournament_brackets_counts_check" CHECK ("athlete_count" > 0 AND "bracket_size" >= "athlete_count" AND "round_count" > 0),
  CONSTRAINT "tournament_brackets_terminal_timestamp_check" CHECK (("status" = 'ACTIVE' AND "completed_at" IS NULL AND "cancelled_at" IS NULL) OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL) OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "completed_at" IS NULL))
);
CREATE INDEX "tournament_brackets_tournament_id_weight_class_id_idx" ON "tournament_brackets"("tournament_id", "weight_class_id");
-- Prisma has no partial unique-index declaration. This is the final arbiter for concurrent confirmation.
CREATE UNIQUE INDEX "tournament_brackets_one_active_per_weight_class_key" ON "tournament_brackets"("tournament_id", "weight_class_id") WHERE "status" = 'ACTIVE';

CREATE TABLE "bracket_entrants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "bracket_id" UUID NOT NULL, "athlete_id" UUID NOT NULL,
  "snapshot_name" VARCHAR(255) NOT NULL, "snapshot_birth_year" SMALLINT NOT NULL, "snapshot_organization" VARCHAR(255), "snapshot_image_path" VARCHAR(1024),
  "initial_round_number" SMALLINT NOT NULL, "initial_fixture_position" SMALLINT, "initial_side" "athlete_color", "received_bye" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bracket_entrants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bracket_entrants_bracket_id_athlete_id_key" UNIQUE ("bracket_id", "athlete_id"),
  CONSTRAINT "bracket_entrants_bracket_id_fkey" FOREIGN KEY ("bracket_id") REFERENCES "tournament_brackets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bracket_entrants_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "tournament_athletes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "bracket_entrants_athlete_id_idx" ON "bracket_entrants"("athlete_id");

CREATE TABLE "bracket_fixtures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "bracket_id" UUID NOT NULL, "round_number" SMALLINT NOT NULL, "position" SMALLINT NOT NULL,
  "display_reference" VARCHAR(64) NOT NULL, "status" "bracket_fixture_status" NOT NULL DEFAULT 'PENDING_PARTICIPANTS', "winner_entrant_id" UUID, "winner_decision" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bracket_fixtures_pkey" PRIMARY KEY ("id"), CONSTRAINT "bracket_fixtures_bracket_id_round_number_position_key" UNIQUE ("bracket_id", "round_number", "position"),
  CONSTRAINT "bracket_fixtures_bracket_id_fkey" FOREIGN KEY ("bracket_id") REFERENCES "tournament_brackets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bracket_fixtures_winner_entrant_id_fkey" FOREIGN KEY ("winner_entrant_id") REFERENCES "bracket_entrants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bracket_fixtures_round_position_check" CHECK ("round_number" > 0 AND "position" > 0)
);
CREATE INDEX "bracket_fixtures_bracket_id_round_number_position_idx" ON "bracket_fixtures"("bracket_id", "round_number", "position");
CREATE INDEX "bracket_fixtures_winner_entrant_id_idx" ON "bracket_fixtures"("winner_entrant_id");

CREATE TABLE "bracket_slots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "fixture_id" UUID NOT NULL, "side" "athlete_color" NOT NULL,
  "direct_entrant_id" UUID, "source_fixture_id" UUID, "resolved_entrant_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bracket_slots_pkey" PRIMARY KEY ("id"), CONSTRAINT "bracket_slots_fixture_id_side_key" UNIQUE ("fixture_id", "side"),
  CONSTRAINT "bracket_slots_fixture_id_fkey" FOREIGN KEY ("fixture_id") REFERENCES "bracket_fixtures"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "bracket_slots_direct_entrant_id_fkey" FOREIGN KEY ("direct_entrant_id") REFERENCES "bracket_entrants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bracket_slots_source_fixture_id_fkey" FOREIGN KEY ("source_fixture_id") REFERENCES "bracket_fixtures"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bracket_slots_resolved_entrant_id_fkey" FOREIGN KEY ("resolved_entrant_id") REFERENCES "bracket_entrants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bracket_slots_exactly_one_source_check" CHECK (("direct_entrant_id" IS NULL) <> ("source_fixture_id" IS NULL)),
  CONSTRAINT "bracket_slots_direct_source_resolved_check" CHECK ("direct_entrant_id" IS NULL OR ("resolved_entrant_id" IS NOT NULL AND "resolved_entrant_id" = "direct_entrant_id"))
);
CREATE INDEX "bracket_slots_source_fixture_id_idx" ON "bracket_slots"("source_fixture_id");

-- Matches remain standalone unless explicitly linked. This FK points from Match
-- to Fixture so purge can delete matches first and preserve existing lifecycle behavior.
ALTER TABLE "matches" ADD COLUMN "bracket_fixture_id" UUID;
ALTER TABLE "matches" ADD CONSTRAINT "matches_bracket_fixture_id_key" UNIQUE ("bracket_fixture_id");
ALTER TABLE "matches" ADD CONSTRAINT "matches_bracket_fixture_id_fkey" FOREIGN KEY ("bracket_fixture_id") REFERENCES "bracket_fixtures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "matches_bracket_fixture_id_idx" ON "matches"("bracket_fixture_id");

-- A slot's source and every entrant/winner must be in the fixture's bracket.
-- Cross-table aggregate membership cannot be represented by Prisma relations.
CREATE FUNCTION "validate_bracket_aggregate_membership"() RETURNS trigger AS $$
DECLARE fixture_bracket UUID; referenced_bracket UUID;
BEGIN
  IF TG_TABLE_NAME = 'bracket_fixtures' THEN
    fixture_bracket := NEW."bracket_id";
  ELSE
    SELECT "bracket_id" INTO fixture_bracket FROM "bracket_fixtures" WHERE "id" = NEW."fixture_id";
  END IF;
  IF TG_TABLE_NAME = 'bracket_fixtures' AND NEW."winner_entrant_id" IS NOT NULL THEN
    SELECT "bracket_id" INTO referenced_bracket FROM "bracket_entrants" WHERE "id" = NEW."winner_entrant_id";
  ELSIF TG_TABLE_NAME = 'bracket_slots' THEN
    IF NEW."direct_entrant_id" IS NOT NULL THEN SELECT "bracket_id" INTO referenced_bracket FROM "bracket_entrants" WHERE "id" = NEW."direct_entrant_id";
    ELSIF NEW."source_fixture_id" IS NOT NULL THEN SELECT "bracket_id" INTO referenced_bracket FROM "bracket_fixtures" WHERE "id" = NEW."source_fixture_id"; END IF;
    IF referenced_bracket IS NOT NULL AND referenced_bracket <> fixture_bracket THEN RAISE EXCEPTION 'Bracket aggregate membership violation' USING ERRCODE = '23514'; END IF;
    IF NEW."resolved_entrant_id" IS NOT NULL THEN
      SELECT "bracket_id" INTO referenced_bracket FROM "bracket_entrants" WHERE "id" = NEW."resolved_entrant_id";
    END IF;
  END IF;
  IF referenced_bracket IS NOT NULL AND referenced_bracket <> fixture_bracket THEN RAISE EXCEPTION 'Bracket aggregate membership violation' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "bracket_fixtures_aggregate_membership_trigger" BEFORE INSERT OR UPDATE ON "bracket_fixtures" FOR EACH ROW EXECUTE FUNCTION "validate_bracket_aggregate_membership"();
CREATE TRIGGER "bracket_slots_aggregate_membership_trigger" BEFORE INSERT OR UPDATE ON "bracket_slots" FOR EACH ROW EXECUTE FUNCTION "validate_bracket_aggregate_membership"();

COMMENT ON TABLE "tournament_brackets" IS 'Confirmed bracket aggregate only; previews are stateless and never persisted.';
COMMENT ON TABLE "bracket_slots" IS 'A slot has exactly one source. Direct entries resolve immediately; fixture-winner sources begin unresolved.';
