-- `NEW` has the record type of the table that fired the trigger.  Do not
-- reference fixture-only fields while handling a bracket_slots row: PostgreSQL
-- raises "record new has no field winner_entrant_id" before it can evaluate a
-- compound boolean expression that appears to guard that reference.
CREATE OR REPLACE FUNCTION "validate_bracket_aggregate_membership"() RETURNS trigger AS $$
DECLARE
  fixture_bracket UUID;
  referenced_bracket UUID;
BEGIN
  IF TG_TABLE_NAME = 'bracket_fixtures' THEN
    fixture_bracket := NEW."bracket_id";

    IF NEW."winner_entrant_id" IS NOT NULL THEN
      SELECT "bracket_id" INTO referenced_bracket
      FROM "bracket_entrants"
      WHERE "id" = NEW."winner_entrant_id";
    END IF;
  ELSE
    SELECT "bracket_id" INTO fixture_bracket
    FROM "bracket_fixtures"
    WHERE "id" = NEW."fixture_id";

    IF NEW."direct_entrant_id" IS NOT NULL THEN
      SELECT "bracket_id" INTO referenced_bracket
      FROM "bracket_entrants"
      WHERE "id" = NEW."direct_entrant_id";
    ELSIF NEW."source_fixture_id" IS NOT NULL THEN
      SELECT "bracket_id" INTO referenced_bracket
      FROM "bracket_fixtures"
      WHERE "id" = NEW."source_fixture_id";
    END IF;

    IF referenced_bracket IS NOT NULL AND referenced_bracket <> fixture_bracket THEN
      RAISE EXCEPTION 'Bracket aggregate membership violation' USING ERRCODE = '23514';
    END IF;

    IF NEW."resolved_entrant_id" IS NOT NULL THEN
      SELECT "bracket_id" INTO referenced_bracket
      FROM "bracket_entrants"
      WHERE "id" = NEW."resolved_entrant_id";
    END IF;
  END IF;

  IF referenced_bracket IS NOT NULL AND referenced_bracket <> fixture_bracket THEN
    RAISE EXCEPTION 'Bracket aggregate membership violation' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
