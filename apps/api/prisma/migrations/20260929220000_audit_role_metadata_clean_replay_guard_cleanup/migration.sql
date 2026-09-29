-- Remove the clean-replay guard installed before the historical role rename.
-- It is migration-scoped and must not affect normal audit-log updates.
DROP TRIGGER IF EXISTS "audit_logs_preserve_role_metadata_during_clean_replay" ON "audit_logs";
DROP FUNCTION IF EXISTS "preserve_audit_role_metadata_during_clean_replay"();
