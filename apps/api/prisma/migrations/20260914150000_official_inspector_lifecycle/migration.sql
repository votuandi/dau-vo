-- Tournament inspectors do not have a legacy MatchSession.  Lifecycle history
-- remains compatible with legacy sessions while allowing official-authored rows.
ALTER TABLE "match_result_operations"
  ALTER COLUMN "created_by_session_id" DROP NOT NULL;

ALTER TABLE "penalties"
  ALTER COLUMN "created_by_session_id" DROP NOT NULL;
