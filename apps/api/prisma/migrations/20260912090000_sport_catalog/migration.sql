-- System catalog records use fixed UUIDs so the backfill is stable in every
-- environment and migration execution never depends on prisma db seed.
CREATE TABLE "sport_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sport_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sport_groups_code_key" UNIQUE ("code")
);

CREATE TABLE "sports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "normalized_name" VARCHAR(255) NOT NULL,
  "sport_group_id" UUID NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sports_code_key" UNIQUE ("code"),
  CONSTRAINT "sports_normalized_name_key" UNIQUE ("normalized_name"),
  CONSTRAINT "sports_sport_group_id_fkey" FOREIGN KEY ("sport_group_id") REFERENCES "sport_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "sports_sport_group_id_idx" ON "sports"("sport_group_id");

INSERT INTO "sport_groups" ("id", "code", "name")
VALUES ('4a78ed51-2fb6-4c9c-a1ec-f054873d6101', 'ONE_ON_ONE_COMBAT', 'Đối kháng 1-1')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "sports" ("id", "code", "name", "normalized_name", "sport_group_id", "is_active")
VALUES ('d91e1cf7-89a7-4475-bd93-6b5f35a14574', 'STICK_FIGHTING', 'Võ Gậy', 'võ gậy', '4a78ed51-2fb6-4c9c-a1ec-f054873d6101', true)
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "tournaments" ADD COLUMN "sport_id" UUID;

UPDATE "tournaments"
SET "sport_id" = 'd91e1cf7-89a7-4475-bd93-6b5f35a14574'
WHERE "sport_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "tournaments" WHERE "sport_id" IS NULL) THEN
    RAISE EXCEPTION 'Sport migration failed: tournaments remain without sport_id after backfill';
  END IF;
END $$;

ALTER TABLE "tournaments" ALTER COLUMN "sport_id" SET NOT NULL;
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_sport_id_fkey" FOREIGN KEY ("sport_id") REFERENCES "sports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tournaments_sport_id_idx" ON "tournaments"("sport_id");
