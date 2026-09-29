-- The preceding role-rename migration is already present on the release
-- branch, so its checksum must remain intact.  This forward repair deliberately
-- touches only the role-bearing audit paths persisted by TournamentOfficialsService:
-- `role`, `before.role`, and `after.role`.
--
-- It cannot safely reconstruct unrelated nested role values that a previously
-- deployed recursive migration may already have changed.  Recover those only
-- from a known pre-migration backup or source of truth.
CREATE OR REPLACE FUNCTION "rename_official_role_metadata_at_known_paths"(value JSONB)
RETURNS JSONB AS $$
DECLARE
  result JSONB := value;
BEGIN
  IF jsonb_typeof(result) <> 'object' THEN
    RETURN result;
  END IF;

  IF result -> 'role' = '"REFEREE"'::jsonb THEN
    result := jsonb_set(result, '{role}', '"JUDGE"'::jsonb, false);
  ELSIF result -> 'role' = '"INSPECTOR"'::jsonb THEN
    result := jsonb_set(result, '{role}', '"SUPERVISOR"'::jsonb, false);
  END IF;

  IF result #> '{before,role}' = '"REFEREE"'::jsonb THEN
    result := jsonb_set(result, '{before,role}', '"JUDGE"'::jsonb, false);
  ELSIF result #> '{before,role}' = '"INSPECTOR"'::jsonb THEN
    result := jsonb_set(result, '{before,role}', '"SUPERVISOR"'::jsonb, false);
  END IF;

  IF result #> '{after,role}' = '"REFEREE"'::jsonb THEN
    result := jsonb_set(result, '{after,role}', '"JUDGE"'::jsonb, false);
  ELSIF result #> '{after,role}' = '"INSPECTOR"'::jsonb THEN
    result := jsonb_set(result, '{after,role}', '"SUPERVISOR"'::jsonb, false);
  END IF;

  RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

UPDATE "audit_logs"
SET "metadata" = "rename_official_role_metadata_at_known_paths"("metadata")
WHERE "metadata" IS NOT NULL
  AND (
    "metadata" -> 'role' IN ('"REFEREE"'::jsonb, '"INSPECTOR"'::jsonb)
    OR "metadata" #> '{before,role}' IN ('"REFEREE"'::jsonb, '"INSPECTOR"'::jsonb)
    OR "metadata" #> '{after,role}' IN ('"REFEREE"'::jsonb, '"INSPECTOR"'::jsonb)
  );

DROP FUNCTION "rename_official_role_metadata_at_known_paths"(JSONB);
