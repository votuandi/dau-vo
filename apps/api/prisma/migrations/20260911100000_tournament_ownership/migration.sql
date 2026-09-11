-- Expand: ownership is nullable while legacy rows are deterministically backfilled.
ALTER TABLE "tournaments" ADD COLUMN "owner_user_id" UUID;

-- Prefer the earliest recorded, still-referentially-valid actor at tournament
-- creation. The audit-log UUID is a stable tie breaker for same-tick events.
UPDATE "tournaments" tournament
SET "owner_user_id" = source."user_id"
FROM (
  SELECT DISTINCT ON ("metadata"->>'tournamentId')
    audit."metadata"->>'tournamentId' AS tournament_id,
    audit."user_id"
  FROM "audit_logs" audit
  INNER JOIN "users" actor ON actor."id" = audit."user_id"
  WHERE audit."event_type" = 'TOURNAMENT_CREATED' AND audit."user_id" IS NOT NULL
  ORDER BY audit."metadata"->>'tournamentId', audit."created_at" ASC, audit."id" ASC
) source
WHERE tournament."id"::text = source.tournament_id
  AND tournament."owner_user_id" IS NULL;

-- A seed runs after migrations, so it cannot be a migration prerequisite.
-- Legacy users were normalized as active ADMINs by the preceding migration.
-- Use the oldest active, non-deleted legacy administrator, with UUID as a
-- stable tie breaker. This deliberately does not manufacture a user.
WITH fallback AS (
  SELECT "id"
  FROM "users"
  WHERE "role" = 'ADMIN'
    AND "is_active" = true
    AND "deleted_at" IS NULL
  ORDER BY "created_at" ASC, "id" ASC
  LIMIT 1
)
UPDATE "tournaments" tournament
SET "owner_user_id" = fallback."id"
FROM fallback
WHERE tournament."owner_user_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tournaments" WHERE "owner_user_id" IS NULL) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Cannot backfill tournament ownership: tournaments without a valid TOURNAMENT_CREATED actor require an active, non-deleted legacy ADMIN user',
      HINT = 'Restore or add an active legacy ADMIN user, then rerun the migration. Do not rely on the post-migration superadmin seed.';
  END IF;
END $$;

ALTER TABLE "tournaments" ALTER COLUMN "owner_user_id" SET NOT NULL;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tournaments_owner_user_id_status_idx" ON "tournaments"("owner_user_id", "status");
CREATE INDEX "tournaments_owner_user_id_created_at_idx" ON "tournaments"("owner_user_id", "created_at");
