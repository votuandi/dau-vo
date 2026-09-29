-- The following historical migration is already shared, so its checksum must
-- remain unchanged.  On a clean replay it uses recursive JSON traversal; this
-- short-lived guard preserves the original metadata and applies the rename at
-- only the audit paths written by TournamentOfficialsService: `role`,
-- `before.role`, and `after.role`.
--
-- Objects, arrays, scalars, nulls, arbitrary nested `role` keys, and prose are
-- deliberately left unchanged.  This guard cannot recover unrelated nested
-- values on databases where the historical recursive migration already ran;
-- those require a verified pre-migration backup or other source of truth.
CREATE FUNCTION "preserve_audit_role_metadata_during_clean_replay"()
RETURNS trigger AS $$
DECLARE
  result JSONB := OLD."metadata";
BEGIN
  IF jsonb_typeof(result) <> 'object' THEN
    RETURN NEW;
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

  NEW."metadata" := result;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "audit_logs_preserve_role_metadata_during_clean_replay"
BEFORE UPDATE OF "metadata" ON "audit_logs"
FOR EACH ROW
WHEN (OLD."metadata" IS DISTINCT FROM NEW."metadata")
EXECUTE FUNCTION "preserve_audit_role_metadata_during_clean_replay"();
