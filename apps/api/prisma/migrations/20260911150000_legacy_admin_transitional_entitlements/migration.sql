-- Backward-compatible bridge for administrators created before entitlement-backed
-- authorization. CURRENT_TIMESTAMP is transaction-stable, so every inserted row
-- from this migration receives the same migration execution time.
WITH migration_time AS (
  SELECT CURRENT_TIMESTAMP AS active_from
), eligible_admins AS (
  SELECT
    "users"."id",
    GREATEST(
      3,
      COUNT("tournaments"."id") FILTER (
        WHERE "tournaments"."soft_deleted_at" IS NULL
      )::integer
    ) AS tournament_limit
  FROM "users"
  LEFT JOIN "admin_entitlements"
    ON "admin_entitlements"."user_id" = "users"."id"
  LEFT JOIN "tournaments"
    ON "tournaments"."owner_user_id" = "users"."id"
  WHERE "users"."role" = 'ADMIN'
    AND "users"."is_active" = true
    AND "users"."deleted_at" IS NULL
    AND "admin_entitlements"."user_id" IS NULL
  GROUP BY "users"."id"
)
INSERT INTO "admin_entitlements" (
  "user_id", "status", "active_from", "active_until", "tournament_limit"
)
SELECT
  eligible_admins."id",
  'ACTIVE',
  migration_time.active_from,
  migration_time.active_from + INTERVAL '12 months',
  eligible_admins.tournament_limit
FROM eligible_admins
CROSS JOIN migration_time
-- The unique user_id constraint makes this safe if the SQL is ever manually
-- replayed after an entitlement was created between selection and insertion.
ON CONFLICT ("user_id") DO NOTHING;
