-- Expand: ownership is nullable while legacy rows are deterministically backfilled.
ALTER TABLE "tournaments" ADD COLUMN "owner_user_id" UUID;

-- Prefer the actor recorded at tournament creation.
UPDATE "tournaments" tournament
SET "owner_user_id" = source."user_id"
FROM (
  SELECT DISTINCT ON ("metadata"->>'tournamentId')
    "metadata"->>'tournamentId' AS tournament_id,
    "user_id"
  FROM "audit_logs"
  WHERE "event_type" = 'TOURNAMENT_CREATED' AND "user_id" IS NOT NULL
  ORDER BY "metadata"->>'tournamentId', "created_at" ASC
) source
WHERE tournament."id"::text = source.tournament_id
  AND tournament."owner_user_id" IS NULL;

-- Deterministic legacy fallback: the seeded system super admin.
UPDATE "tournaments"
SET "owner_user_id" = (SELECT "id" FROM "users" WHERE "normalized_username" = 'superadmin' LIMIT 1)
WHERE "owner_user_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tournaments" WHERE "owner_user_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill tournament ownership: create the superadmin user before applying this migration';
  END IF;
END $$;

ALTER TABLE "tournaments" ALTER COLUMN "owner_user_id" SET NOT NULL;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tournaments_owner_user_id_status_idx" ON "tournaments"("owner_user_id", "status");
CREATE INDEX "tournaments_owner_user_id_created_at_idx" ON "tournaments"("owner_user_id", "created_at");
