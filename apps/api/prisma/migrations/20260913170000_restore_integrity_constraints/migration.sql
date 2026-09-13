-- Forward-only repair for 20260912162433. That migration unintentionally
-- removed these protections after it had already reached the local migration
-- history, so it must not be rewritten.
ALTER TABLE "match_athletes"
  ADD CONSTRAINT "match_athletes_match_tournament_id_fkey"
  FOREIGN KEY ("match_id", "tournament_id") REFERENCES "matches"("id", "tournament_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bracket_winner_decision_idempotency"
  ADD CONSTRAINT "bracket_winner_decision_idempotency_fixture_id_fkey"
  FOREIGN KEY ("fixture_id") REFERENCES "bracket_fixtures"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "admin_entitlements_status_active_until_idx"
  ON "admin_entitlements"("status", "active_until");
CREATE INDEX "admin_entitlements_admin_access_ended_at_idx"
  ON "admin_entitlements"("admin_access_ended_at");

-- Prisma cannot express aggregate-scoped references, source-round ordering,
-- or the bracket/match composite membership rule. Keep these protections in
-- stable, named database triggers so direct SQL cannot violate the aggregate.
CREATE OR REPLACE FUNCTION "validate_bracket_aggregate_membership"() RETURNS trigger AS $$
DECLARE
  fixture_bracket UUID;
  referenced_bracket UUID;
  fixture_round SMALLINT;
  source_round SMALLINT;
  bracket_tournament UUID;
  bracket_weight_class UUID;
  athlete_tournament UUID;
  athlete_weight_class UUID;
BEGIN
  IF TG_TABLE_NAME = 'tournament_brackets' THEN
    IF NEW."champion_entrant_id" IS NOT NULL THEN
      SELECT "bracket_id" INTO referenced_bracket FROM "bracket_entrants" WHERE "id" = NEW."champion_entrant_id";
      IF referenced_bracket IS DISTINCT FROM NEW."id" THEN
        RAISE EXCEPTION 'Bracket champion must belong to its bracket' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'bracket_entrants' THEN
    SELECT "tournament_id", "weight_class_id" INTO bracket_tournament, bracket_weight_class FROM "tournament_brackets" WHERE "id" = NEW."bracket_id";
    SELECT "tournament_id", "weight_class_id" INTO athlete_tournament, athlete_weight_class FROM "tournament_athletes" WHERE "id" = NEW."athlete_id";
    IF athlete_tournament IS DISTINCT FROM bracket_tournament OR athlete_weight_class IS DISTINCT FROM bracket_weight_class THEN
      RAISE EXCEPTION 'Bracket entrant athlete must belong to the bracket tournament and weight class' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'bracket_fixtures' THEN
    fixture_bracket := NEW."bracket_id";
    IF NEW."winner_entrant_id" IS NOT NULL THEN
      SELECT "bracket_id" INTO referenced_bracket FROM "bracket_entrants" WHERE "id" = NEW."winner_entrant_id";
      IF referenced_bracket IS DISTINCT FROM fixture_bracket THEN
        RAISE EXCEPTION 'Fixture winner must belong to the fixture bracket' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'bracket_slots' THEN
    SELECT "bracket_id", "round_number" INTO fixture_bracket, fixture_round FROM "bracket_fixtures" WHERE "id" = NEW."fixture_id";
    IF NEW."direct_entrant_id" IS NOT NULL THEN
      SELECT "bracket_id" INTO referenced_bracket FROM "bracket_entrants" WHERE "id" = NEW."direct_entrant_id";
      IF referenced_bracket IS DISTINCT FROM fixture_bracket THEN
        RAISE EXCEPTION 'Direct entrant must belong to the fixture bracket' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW."source_fixture_id" IS NOT NULL THEN
      SELECT "bracket_id", "round_number" INTO referenced_bracket, source_round FROM "bracket_fixtures" WHERE "id" = NEW."source_fixture_id";
      IF referenced_bracket IS DISTINCT FROM fixture_bracket OR source_round >= fixture_round THEN
        RAISE EXCEPTION 'Source fixture must belong to the bracket and an earlier round' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW."resolved_entrant_id" IS NOT NULL THEN
      SELECT "bracket_id" INTO referenced_bracket FROM "bracket_entrants" WHERE "id" = NEW."resolved_entrant_id";
      IF referenced_bracket IS DISTINCT FROM fixture_bracket THEN
        RAISE EXCEPTION 'Resolved entrant must belong to the fixture bracket' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'matches' AND NEW."bracket_fixture_id" IS NOT NULL THEN
    SELECT bracket."tournament_id", bracket."weight_class_id" INTO bracket_tournament, bracket_weight_class
    FROM "bracket_fixtures" fixture JOIN "tournament_brackets" bracket ON bracket."id" = fixture."bracket_id"
    WHERE fixture."id" = NEW."bracket_fixture_id";
    IF NEW."tournament_id" IS DISTINCT FROM bracket_tournament OR NEW."weight_class_id" IS DISTINCT FROM bracket_weight_class THEN
      RAISE EXCEPTION 'Bracket-linked match must belong to the bracket tournament and weight class' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "tournament_brackets_aggregate_membership_trigger" ON "tournament_brackets";
DROP TRIGGER IF EXISTS "bracket_entrants_aggregate_membership_trigger" ON "bracket_entrants";
DROP TRIGGER IF EXISTS "bracket_fixtures_aggregate_membership_trigger" ON "bracket_fixtures";
DROP TRIGGER IF EXISTS "bracket_slots_aggregate_membership_trigger" ON "bracket_slots";
DROP TRIGGER IF EXISTS "matches_bracket_aggregate_membership_trigger" ON "matches";
CREATE TRIGGER "tournament_brackets_aggregate_membership_trigger" BEFORE INSERT OR UPDATE OF "champion_entrant_id" ON "tournament_brackets" FOR EACH ROW EXECUTE FUNCTION "validate_bracket_aggregate_membership"();
CREATE TRIGGER "bracket_entrants_aggregate_membership_trigger" BEFORE INSERT OR UPDATE OF "bracket_id", "athlete_id" ON "bracket_entrants" FOR EACH ROW EXECUTE FUNCTION "validate_bracket_aggregate_membership"();
CREATE TRIGGER "bracket_fixtures_aggregate_membership_trigger" BEFORE INSERT OR UPDATE OF "bracket_id", "winner_entrant_id" ON "bracket_fixtures" FOR EACH ROW EXECUTE FUNCTION "validate_bracket_aggregate_membership"();
CREATE TRIGGER "bracket_slots_aggregate_membership_trigger" BEFORE INSERT OR UPDATE OF "fixture_id", "direct_entrant_id", "source_fixture_id", "resolved_entrant_id" ON "bracket_slots" FOR EACH ROW EXECUTE FUNCTION "validate_bracket_aggregate_membership"();
CREATE TRIGGER "matches_bracket_aggregate_membership_trigger" BEFORE INSERT OR UPDATE OF "bracket_fixture_id", "tournament_id", "weight_class_id" ON "matches" FOR EACH ROW EXECUTE FUNCTION "validate_bracket_aggregate_membership"();

-- Bracket construction inserts a fixture and its two slots in one transaction.
-- A deferred constraint trigger permits that construction while rejecting a
-- committed fixture with any slot count other than two.
CREATE OR REPLACE FUNCTION "validate_bracket_fixture_slot_count"() RETURNS trigger AS $$
DECLARE target_fixture_id UUID; slot_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'bracket_slots' THEN
    target_fixture_id := NEW."fixture_id";
  ELSE
    target_fixture_id := NEW."id";
  END IF;
  SELECT count(*) INTO slot_count FROM "bracket_slots" slot WHERE slot."fixture_id" = target_fixture_id;
  IF slot_count <> 2 THEN
    RAISE EXCEPTION 'Bracket fixture must have exactly two slots' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "bracket_fixtures_exactly_two_slots_trigger"
  AFTER INSERT OR UPDATE ON "bracket_fixtures"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_bracket_fixture_slot_count"();
CREATE CONSTRAINT TRIGGER "bracket_slots_fixture_exactly_two_slots_trigger"
  AFTER INSERT OR UPDATE ON "bracket_slots"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "validate_bracket_fixture_slot_count"();
