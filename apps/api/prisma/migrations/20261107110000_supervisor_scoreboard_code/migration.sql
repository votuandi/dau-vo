ALTER TABLE "tournament_officials" ADD COLUMN "scoreboard_code" VARCHAR(32);

-- Stable viewing codes for existing supervisors, independently of private credentials.
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "tournament_id" ORDER BY "created_at", "id"
  ) AS position
  FROM "tournament_officials" WHERE "role" = 'SUPERVISOR'
)
UPDATE "tournament_officials" AS official
SET "scoreboard_code" = 'GS' || CASE
  WHEN numbered.position < 10 THEN '0' || numbered.position::text
  ELSE numbered.position::text END
FROM numbered WHERE official."id" = numbered."id";

CREATE UNIQUE INDEX "tournament_officials_tournament_id_scoreboard_code_key"
ON "tournament_officials" ("tournament_id", "scoreboard_code");
