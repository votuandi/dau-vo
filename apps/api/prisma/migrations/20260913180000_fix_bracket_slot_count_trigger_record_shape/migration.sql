-- A trigger function's NEW record has the shape of its firing table. PostgreSQL
-- resolves both CASE branches, so the former expression referenced fixture_id
-- while running for bracket_fixtures and made every confirmation fail at COMMIT.
CREATE OR REPLACE FUNCTION "validate_bracket_fixture_slot_count"() RETURNS trigger AS $$
DECLARE
  target_fixture_id UUID;
  slot_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'bracket_slots' THEN
    target_fixture_id := NEW."fixture_id";
  ELSE
    target_fixture_id := NEW."id";
  END IF;

  SELECT count(*) INTO slot_count
  FROM "bracket_slots" slot
  WHERE slot."fixture_id" = target_fixture_id;

  IF slot_count <> 2 THEN
    RAISE EXCEPTION 'Bracket fixture must have exactly two slots' USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
