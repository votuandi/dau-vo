-- The unique constraints already provide these exact B-tree access paths.
-- Removing duplicate indexes lowers write amplification without changing query plans.
DROP INDEX IF EXISTS "bracket_fixtures_bracket_id_round_number_position_idx";
DROP INDEX IF EXISTS "matches_bracket_fixture_id_idx";
