ALTER TABLE "tournament_organizations"
  ADD COLUMN "normalized_location" VARCHAR(255) NOT NULL DEFAULT '';

UPDATE "tournament_organizations"
SET "normalized_location" = lower(normalize(coalesce("location", ''), NFKC));

ALTER TABLE "tournament_organizations"
  DROP CONSTRAINT "tournament_organizations_tournament_id_normalized_name_key";

ALTER TABLE "tournament_organizations"
  ADD CONSTRAINT "tournament_organizations_name_location_key"
  UNIQUE ("tournament_id", "normalized_name", "normalized_location");
