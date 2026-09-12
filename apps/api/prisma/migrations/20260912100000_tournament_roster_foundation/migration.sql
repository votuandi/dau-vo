-- Tournament roster registration is intentionally distinct from match snapshots.
-- MatchAthlete remains the immutable scoring/audit identity. athlete_id is optional
-- provenance only, so deactivation never removes historical scoring relations.

ALTER TABLE "tournaments" ADD COLUMN "image_path" VARCHAR(1024);

CREATE TABLE "tournament_units" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tournament_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "normalized_name" VARCHAR(255) NOT NULL,
  "details" TEXT,
  "image_path" VARCHAR(1024),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deactivated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournament_units_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tournament_units_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tournament_units_tournament_id_id_key" UNIQUE ("tournament_id", "id"),
  CONSTRAINT "tournament_units_tournament_id_normalized_name_key" UNIQUE ("tournament_id", "normalized_name")
);
CREATE INDEX "tournament_units_tournament_id_is_active_normalized_name_idx" ON "tournament_units"("tournament_id", "is_active", "normalized_name");

CREATE TABLE "tournament_weight_classes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tournament_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "normalized_name" VARCHAR(255) NOT NULL,
  "details" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deactivated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournament_weight_classes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tournament_weight_classes_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tournament_weight_classes_tournament_id_id_key" UNIQUE ("tournament_id", "id"),
  CONSTRAINT "tournament_weight_classes_tournament_id_normalized_name_key" UNIQUE ("tournament_id", "normalized_name")
);
CREATE INDEX "tournament_weight_classes_active_name_idx" ON "tournament_weight_classes"("tournament_id", "is_active", "normalized_name");

CREATE TABLE "tournament_athletes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tournament_id" UUID NOT NULL,
  "unit_id" UUID,
  "weight_class_id" UUID NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "birth_year" SMALLINT NOT NULL,
  "details" TEXT,
  "image_path" VARCHAR(1024),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deactivated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tournament_athletes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tournament_athletes_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tournament_athletes_unit_id_fkey" FOREIGN KEY ("tournament_id", "unit_id") REFERENCES "tournament_units"("tournament_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tournament_athletes_weight_class_id_fkey" FOREIGN KEY ("tournament_id", "weight_class_id") REFERENCES "tournament_weight_classes"("tournament_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tournament_athletes_tournament_id_id_key" UNIQUE ("tournament_id", "id")
);
CREATE INDEX "tournament_athletes_tournament_id_is_active_name_idx" ON "tournament_athletes"("tournament_id", "is_active", "name");
CREATE INDEX "tournament_athletes_tournament_id_unit_id_is_active_idx" ON "tournament_athletes"("tournament_id", "unit_id", "is_active");
CREATE INDEX "tournament_athletes_tournament_id_weight_class_id_is_active_idx" ON "tournament_athletes"("tournament_id", "weight_class_id", "is_active");

ALTER TABLE "matches" ADD COLUMN "weight_class_id" UUID;
ALTER TABLE "matches" ADD CONSTRAINT "matches_id_tournament_id_key" UNIQUE ("id", "tournament_id");
ALTER TABLE "matches" ADD CONSTRAINT "matches_tournament_weight_class_id_fkey"
  FOREIGN KEY ("tournament_id", "weight_class_id") REFERENCES "tournament_weight_classes"("tournament_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "matches_tournament_id_weight_class_id_idx" ON "matches"("tournament_id", "weight_class_id");

-- Every legacy snapshot has a match; this is a lossless technical backfill used
-- solely to enforce the future composite athlete boundary.
ALTER TABLE "match_athletes" ADD COLUMN "tournament_id" UUID;
UPDATE "match_athletes" athlete SET "tournament_id" = match."tournament_id"
FROM "matches" match WHERE match."id" = athlete."match_id";
ALTER TABLE "match_athletes" ALTER COLUMN "tournament_id" SET NOT NULL;
ALTER TABLE "match_athletes" ADD COLUMN "athlete_id" UUID;
ALTER TABLE "match_athletes" ADD CONSTRAINT "match_athletes_match_tournament_id_fkey"
  FOREIGN KEY ("match_id", "tournament_id") REFERENCES "matches"("id", "tournament_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "match_athletes" ADD CONSTRAINT "match_athletes_tournament_athlete_id_fkey"
  FOREIGN KEY ("tournament_id", "athlete_id") REFERENCES "tournament_athletes"("tournament_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "match_athletes_tournament_id_athlete_id_idx" ON "match_athletes"("tournament_id", "athlete_id");

COMMENT ON TABLE "tournament_athletes" IS 'Current tournament roster registrations; rows may be deactivated but are not match scoring snapshots.';
COMMENT ON TABLE "match_athletes" IS 'Historical per-match athlete snapshot. Name and organization stay independent of optional tournament_athletes provenance.';
